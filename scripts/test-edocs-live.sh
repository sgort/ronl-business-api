#!/usr/bin/env bash
# test-edocs-live.sh
# End-to-end smoke test of the eDOCS connector against a LIVE OpenText eDOCS
# backend, through TWO separate routes:
#   1. /v1/edocs HTTP surface directly — the same path the frontend uses.
#      Lists the existing workspaces (view-only — nothing is created or
#      deleted; see "Known limitations" below), then uploads a standalone
#      document and downloads it back to verify the round-trip.
#   2. The Python MCP POC container (docs/Python-MCP-server.md), called over
#      the MCP streamable-HTTP protocol instead of plain HTTP. Two parts:
#        a. Mirror reads — workspace_list / document_profile / document_versions
#           against the exact DOCUMENT_ID route 1 just created, proving the
#           MCP path sees the same live eDOCS data the direct route does, not
#           just that it responds.
#        b. Own upload — document_upload + document_profile + document_download,
#           creating and reading back a SEPARATE document independent of
#           route 1, proving the MCP route has genuine create+read parity, not
#           just read access to what route 1 made. document_upload/
#           document_download are not exposed to the AI Assistant chat (see
#           PythonPocMcpProvider.ts ALLOWED_TOOLS) — this script calls them
#           directly over raw MCP, same as it already does for the read tools.
#      Local-only (TARGET=local): the POC container isn't deployed to acc.
#
# Run this AFTER setting EDOCS_STUB_MODE=false and restarting the backend, but
# BEFORE exercising the UI.
#
# Document upload is STANDALONE (no workspaceId) — the workspace-ref upload
# path is still broken server-side (see docs/EDOCS-GO-LIVE.md § Known issues).
#
# Known limitations (both intentional, not bugs to chase here):
#   - Workspace create/delete is NOT exercised by this script — the live
#     workspace search (ensureWorkspace) was found to not reliably scope by
#     project number, so automated create+delete risked touching workspaces
#     this script didn't create. Workspaces are listed (read-only) instead.
#   - Document delete always fails (502) — the eDOCS service account this
#     script runs as has no delete-document right in the live DM server. So
#     no cleanup is attempted at all; every run leaves its uploaded
#     document(s) behind by design. There is no interactive confirmation
#     prompt for this reason — there is nothing this script can delete.
#
# Usage:
#   bash scripts/test-edocs-live.sh                     # localhost (default target)
#   TARGET=acc CLIENT_SECRET=<secret> bash scripts/test-edocs-live.sh   # ACC
#
# Defaults to TARGET=local (http://localhost:3002 + http://localhost:8080) —
# same default as test-smoke-live.sh. On localhost, CLIENT_SECRET (and
# CLIENT_ID) auto-load from KEYCLOAK_CLIENT_SECRET / KEYCLOAK_CLIENT_ID in
# packages/backend/.env.<NODE_ENV> when not already exported, so a bare
# `bash scripts/test-edocs-live.sh` runs without exporting a secret by hand.
# TARGET=acc (or any non-localhost BASE_URL) always requires an explicit
# CLIENT_SECRET — ACC credentials never come from the local .env.
#
# A Keycloak-free pre-flight runs first: it probes eDOCS reachability + login
# in-process (packages/backend/.env) and aborts BEFORE the token dance / any
# mutation if eDOCS is unreachable, in stub mode, or the account cannot log in.
# For just that reach/login answer on its own, use: npm run edocs:health.
#
# Optional overrides:
#   TARGET=local|acc                       # picks a preset URL pair (default: local)
#   BASE_URL / KEYCLOAK_URL                # override either preset explicitly
#   CLIENT_ID=operaton-mcp-client
#   PROJECT_NUMBER=SMOKE-<timestamp>       # only used to name the uploaded documents
#   EDOCS_DEPARTMENT=IVR                   # UV_AFD_NAAM profile field (mandatory on the DM server)
#   PYTHON_MCP_POC_ENABLED=true             # route 2 is OFF unless this is true — checked
#                                            # against the exported var first, then
#                                            # PYTHON_MCP_POC_ENABLED in packages/backend/.env.<NODE_ENV>
#   PYTHON_MCP_POC_URL=http://localhost:8765/mcp   # Python MCP POC endpoint (route 2, local-only);
#                                            # same exported-var-then-.env fallback as ENABLED
#   SKIP_LOCAL_PROBE=1                     # skip pre-flight (local .env ≠ target)
#   NODE_ENV=development                   # which .env the pre-flight loads
#   EDOCS_PORTAL_URL=https://<host>/infocenter   # printed as a browsable link in the closing summary
#
# NOTE: a successful run creates two REAL standalone documents in eDOCS (one
# per route) and downloads each back to verify the round-trip. Neither is
# cleaned up (see "Known limitations" above) — both are always left behind.
# The default PROJECT_NUMBER is timestamped so runs never collide and stay
# identifiable in InfoCenter.

set -u

# ── Target presets — mirrors test-smoke-live.sh ────────────────────────────────
TARGET="${TARGET:-local}"
case "$(echo "$TARGET" | tr '[:upper:]' '[:lower:]')" in
  local)
    DEFAULT_BASE_URL="http://localhost:3002"
    DEFAULT_KEYCLOAK_URL="http://localhost:8080"
    ;;
  acc)
    DEFAULT_BASE_URL="https://acc.api.open-regels.nl"
    DEFAULT_KEYCLOAK_URL="https://acc.keycloak.open-regels.nl"
    ;;
  *)
    echo "ERROR: unknown TARGET='$TARGET' (expected 'local' or 'acc')."
    exit 1
    ;;
esac

# Explicit BASE_URL / KEYCLOAK_URL always win over the preset.
BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"
KEYCLOAK_URL="${KEYCLOAK_URL:-$DEFAULT_KEYCLOAK_URL}"
PROJECT_NUMBER="${PROJECT_NUMBER:-SMOKE-$(date +%Y%m%d-%H%M%S)}"
# UV_AFD_NAAM ("Behandelgroep") — mandatory DM-server profile field; no default
# beyond what's known to be valid on infocenter-test.flevoland.nl.
EDOCS_DEPARTMENT="${EDOCS_DEPARTMENT:-IVR}"

# Repo layout — used to run the Keycloak-free eDOCS reach/login pre-flight.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/packages/backend"

# Read a single KEY=value from an env file — stripped of CR, surrounding quotes,
# and trailing space. Only the first `=` is treated as the separator.
read_env_var() {
  sed -n -E "s/^$1=//p" "$2" 2>/dev/null | tail -n1 | tr -d '\r' \
    | sed -E 's/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# On a localhost BASE_URL, fall back to the backend's own Keycloak client
# credentials from packages/backend/.env.<NODE_ENV> — the same fallback
# test-smoke-live.sh uses — so this script runs without exporting a secret by
# hand. An explicit CLIENT_SECRET always wins; the .env fallback never applies
# to a non-local BASE_URL (those creds belong to the local realm).
ENV_FILE="$BACKEND_DIR/.env.${NODE_ENV:-development}"
CREDS_SOURCE="environment"
if [[ "$BASE_URL" =~ ^https?://(localhost|127\.0\.0\.1) && -f "$ENV_FILE" && -z "${CLIENT_SECRET:-}" ]]; then
  _env_secret="$(read_env_var KEYCLOAK_CLIENT_SECRET "$ENV_FILE")"
  if [[ -n "$_env_secret" && "$_env_secret" != "your-client-secret-here" ]]; then
    CLIENT_SECRET="$_env_secret"
    CLIENT_ID="${CLIENT_ID:-$(read_env_var KEYCLOAK_CLIENT_ID "$ENV_FILE")}"
    CREDS_SOURCE="$ENV_FILE"
  fi
fi
CLIENT_ID="${CLIENT_ID:-operaton-mcp-client}"

# Python MCP POC — gates route 2 entirely. Same fallback as CLIENT_SECRET
# above: an explicitly exported PYTHON_MCP_POC_ENABLED always wins; otherwise
# read from packages/backend/.env.<NODE_ENV> (PYTHON_MCP_POC_URL is read the
# same way, so a URL configured there is picked up without exporting it too).
# Defaults to disabled if neither is set — route 2 only runs when explicitly
# turned on, never by trying to connect and seeing what happens.
if [[ -z "${PYTHON_MCP_POC_ENABLED:-}" && -f "$ENV_FILE" ]]; then
  PYTHON_MCP_POC_ENABLED="$(read_env_var PYTHON_MCP_POC_ENABLED "$ENV_FILE")"
fi
PYTHON_MCP_POC_ENABLED="$(echo "${PYTHON_MCP_POC_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')"
if [[ -z "${PYTHON_MCP_POC_URL:-}" && -f "$ENV_FILE" ]]; then
  PYTHON_MCP_POC_URL="$(read_env_var PYTHON_MCP_POC_URL "$ENV_FILE")"
fi
PYTHON_MCP_POC_URL="${PYTHON_MCP_POC_URL:-http://localhost:8765/mcp}"

# Direct eDOCS health probe (in-process, no Keycloak/backend). Echoes its
# EDOCS_HEALTH_RESULT json line. Reflects the LOCAL packages/backend/.env config.
run_edocs_probe() {
  ( cd "$BACKEND_DIR" && NODE_ENV="${NODE_ENV:-development}" \
      npx --no-install tsx scripts/edocs-healthcheck.ts --quiet ) 2>/dev/null \
    | sed -n 's/^EDOCS_HEALTH_RESULT //p' | tail -n1
}

# ─── Pre-flight: is eDOCS reachable AND can we log in? (no Keycloak needed) ──────
#
# The mutating steps below go through the JWT-gated backend and cost a real
# workspace + document, so there is no point starting the Keycloak/token dance if
# eDOCS itself is unreachable, still in stub mode, or the account cannot log in
# (e.g. locked out). This pre-flight answers that in-process, before anything else.
# Set SKIP_LOCAL_PROBE=1 if your local .env does not match the target backend.
if [[ "${SKIP_LOCAL_PROBE:-0}" != "1" && -d "$BACKEND_DIR" ]] && command -v npx >/dev/null 2>&1; then
  echo ""
  echo "── Pre-flight: eDOCS reach + login (direct · no Keycloak · local .env) ───"
  PROBE_JSON=$(run_edocs_probe)
  if [[ -z "$PROBE_JSON" ]]; then
    echo "  ~ probe produced no result - skipping pre-flight (run: cd packages/backend && npm run edocs:health)"
  elif [[ "$(echo "$PROBE_JSON" | jq -r '.status')" == "stub" ]]; then
    echo "  ✗ eDOCS is in STUB mode locally - set EDOCS_STUB_MODE=false and retry."
    echo "    (Nothing to smoke-test against a stub. Aborting before the token dance.)"
    exit 1
  else
    p_rch=$(echo "$PROBE_JSON" | jq -r '.reachable')
    p_aut=$(echo "$PROBE_JSON" | jq -r '.authenticated')
    if [[ "$p_rch" != "true" ]]; then
      echo "  ✗ eDOCS not reachable: $(echo "$PROBE_JSON" | jq -r '.error // "no detail"')"
      echo "    Aborting - the mutating steps would fail. (SKIP_LOCAL_PROBE=1 to override.)"
      exit 1
    fi
    echo "  ✓ eDOCS reachable"
    if [[ "$p_aut" != "true" ]]; then
      echo "  ✗ eDOCS login failed: $(echo "$PROBE_JSON" | jq -r '.error // "no detail (see backend logs / rapi_details)"')"
      echo "    Aborting - credentials cannot log in (locked out?). (SKIP_LOCAL_PROBE=1 to override.)"
      exit 1
    fi
    echo "  ✓ eDOCS login OK - proceeding to the authenticated backend path."
  fi
fi

if [[ -z "${CLIENT_SECRET:-}" ]]; then
  echo "ERROR: CLIENT_SECRET is not set."
  echo "Usage: CLIENT_SECRET=<secret> bash $0"
  exit 1
fi

PASS=0
FAIL=0
ERRORS=()

pass() { echo "  ✓ $1"; ((PASS++)); }
fail() { echo "  ✗ $1"; ERRORS+=("$1"); ((FAIL++)); }

check_status() {
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label - expected HTTP $expected, got HTTP $actual"
  fi
}

check_field() {
  local label="$1" body="$2" field="$3" expected="$4" actual
  actual=$(echo "$body" | jq -r "$field" 2>/dev/null || echo "__jq_error__")
  if [[ "$actual" == "$expected" ]]; then
    pass "$label ($field = $expected)"
  else
    fail "$label - expected $field=$expected, got $field=$actual"
  fi
}

# ─── MCP streamable-HTTP helper (route 2 — Python MCP POC) ────────────────────
#
# Full handshake (initialize → notifications/initialized → tools/call) against
# $1, calling tool $2 with JSON arguments $3, writing the SSE-framed tools/call
# response to $4. Same protocol test-smoke-live.sh's mcp_list_tools() speaks,
# extended here to actually invoke a tool (not just list them) since this
# script needs real data back to compare against the direct-route results.
# Returns 1 on any curl failure, non-200 initialize, or missing session id.
mcp_call_tool() {
  local url="$1" tool="$2" args_json="$3" out="$4"
  local init_headers="/tmp/edocs_mcp_init_headers.txt" session_id

  curl -s -D "$init_headers" -o /dev/null --max-time 10 -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"edocs-live-test","version":"1.0.0"}}}' \
    2>/dev/null || return 1

  grep -qi "^HTTP/[0-9.]* 200" "$init_headers" || return 1
  session_id=$(grep -i "^mcp-session-id:" "$init_headers" | tr -d '\r' \
    | sed -E 's/^[Mm]cp-[Ss]ession-[Ii]d:[[:space:]]*//')
  [[ -z "$session_id" ]] && return 1

  curl -s -o /dev/null --max-time 10 -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $session_id" \
    -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    2>/dev/null

  curl -s --max-time 15 -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $session_id" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"${tool}\",\"arguments\":${args_json}}}" \
    > "$out" 2>/dev/null
}

# Unwraps an SSE-framed tools/call response file (from mcp_call_tool) down to
# the tool's actual JSON body — the same {success, data} shape the direct
# /v1/edocs/* routes return, since the Python tool just relays response.json().
mcp_tool_result_json() {
  sed -n 's/^data: //p' "$1" | tail -n1 | jq -r '.result.content[0].text' 2>/dev/null | tr -d '\r'
}

# ─── Token ────────────────────────────────────────────────────────────────────

echo ""
echo "── Obtaining token ──────────────────────────────────────────────────────"
[[ "$CREDS_SOURCE" != "environment" ]] && \
  echo "  · CLIENT_SECRET loaded from $(basename "$CREDS_SOURCE") (client: ${CLIENT_ID})"

TOKEN_RESPONSE=$(curl -s -X POST \
  "${KEYCLOAK_URL}/realms/ronl/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [[ -z "$TOKEN" ]]; then
  echo "FATAL: Failed to obtain token."
  echo "$TOKEN_RESPONSE" | jq . 2>/dev/null || echo "$TOKEN_RESPONSE"
  exit 1
fi
pass "Token obtained"

AUTH=(-H "Authorization: Bearer $TOKEN")

# ─── 1. Status — the switch must be live ──────────────────────────────────────

echo ""
echo "── eDOCS status (must be live, not stub) ────────────────────────────────"

STATUS_CODE=$(curl -s -o /tmp/edocs_status.json -w "%{http_code}" \
  "${BASE_URL}/v1/edocs/status" "${AUTH[@]}")
check_status "GET /v1/edocs/status" "$STATUS_CODE" "200"

if [[ "$STATUS_CODE" == "200" ]]; then
  STATUS_BODY=$(cat /tmp/edocs_status.json)
  # The pre-flight distinguishes the two health aspects:
  #   reachable      — the DM server responds
  #   authenticated  — the configured credentials can actually log in
  check_field "stub mode disabled" "$STATUS_BODY" '.data.stubMode' 'false'
  check_field "eDOCS reachable" "$STATUS_BODY" '.data.reachable' 'true'

  if [[ "$(echo "$STATUS_BODY" | jq -r '.data.authenticated')" == "true" ]]; then
    pass "eDOCS login succeeds (.data.authenticated = true)"
  else
    fail "eDOCS login failed (.data.authenticated = false): $(echo "$STATUS_BODY" | jq -r '.data.error // "no error detail"')"
    echo "$STATUS_BODY" | jq . 2>/dev/null
  fi
fi

# Abort the mutating steps unless we are live, reachable AND authenticated —
# otherwise they are meaningless (stub) or guaranteed to fail (unreachable/locked).
if [[ "$STATUS_CODE" != "200" ]] || \
   [[ "$(jq -r '.data.stubMode' /tmp/edocs_status.json 2>/dev/null)" != "false" ]] || \
   [[ "$(jq -r '.data.authenticated' /tmp/edocs_status.json 2>/dev/null)" != "true" ]]; then
  echo ""
  echo "  ! Skipping workspace/document steps - status pre-flight did not pass."
  echo ""
  echo "  Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ─── 2. List workspaces (view-only — no create/delete, see header) ────────────

echo ""
echo "── Workspaces ───────────────────────────────────────────────────────────"

WS_LIST_CODE=$(curl -s -o /tmp/edocs_ws_list.json -w "%{http_code}" \
  "${BASE_URL}/v1/edocs/workspaces" "${AUTH[@]}")
check_status "GET /v1/edocs/workspaces" "$WS_LIST_CODE" "200"
if [[ "$WS_LIST_CODE" == "200" ]]; then
  check_field "workspace list body" "$(cat /tmp/edocs_ws_list.json)" '.success' 'true'
  WS_COUNT=$(jq -r '.data | length' /tmp/edocs_ws_list.json 2>/dev/null)
  echo "  Workspaces (${WS_COUNT:-0}):"
  jq -r '.data[]? | "    " + (.id // "?") + "  -  " + (.DOCNAME // "?")' \
    /tmp/edocs_ws_list.json 2>/dev/null
fi

# ─── 3. Upload a document — standalone (the confirmed-working path) ───────────
#
# The workspace-ref path (passing workspaceId) is still broken server-side
# (see EDOCS-GO-LIVE.md § Known issues) — this uploads standalone instead,
# which is the only path confirmed working live, and doesn't need a workspace.

echo ""
echo "── Upload document (standalone) ─────────────────────────────────────────"

DOCUMENT_ID=""
DOC_NUMBER=""

# A small PDF with real, visible text content (not just an empty page), so a
# manual InfoCenter open actually shows something — carrying a unique marker
# so the download step below can prove the content round-trips byte-for-byte
# through eDOCS rather than just checking HTTP 200.
MARKER="SMOKE-${PROJECT_NUMBER}-$(date -u +%FT%TZ)"
# Two lines (label, then marker) rather than one long line — a single line at
# a readable font size clips off the right edge of the page for a marker this
# long, since PROJECT_NUMBER (and so MARKER) length varies.
PDF_TEXT="BT /F1 11 Tf 20 120 Td (eDOCS CLI smoke test) Tj 0 -16 Td (${MARKER}) Tj ET"
PDF_TEXT_LEN=$(printf '%s' "$PDF_TEXT" | wc -c)
PDF_CONTENT=$(cat <<PDFEOF
%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 500 150]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${PDF_TEXT_LEN}>>
stream
${PDF_TEXT}
endstream
endobj
trailer<</Root 1 0 R>>
%%EOF
PDFEOF
)
CONTENT_B64=$(printf '%s' "$PDF_CONTENT" | base64 | tr -d '\n')
ORIGINAL_HASH=$(printf '%s' "$PDF_CONTENT" | sha256sum | cut -d' ' -f1)

DOC_CODE=$(curl -s -o /tmp/edocs_doc.json -w "%{http_code}" \
  -X POST "${BASE_URL}/v1/edocs/documents" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"smoke-test.pdf\",\"contentBase64\":\"${CONTENT_B64}\",\"metadata\":{\"docName\":\"eDOCS CLI smoke test document\",\"department\":\"${EDOCS_DEPARTMENT}\"}}")
check_status "POST /v1/edocs/documents (standalone)" "$DOC_CODE" "200"
if [[ "$DOC_CODE" == "200" ]]; then
  DOCUMENT_ID=$(jq -r '.data.documentId // empty' /tmp/edocs_doc.json)
  DOC_NUMBER=$(jq -r '.data.documentNumber // empty' /tmp/edocs_doc.json)
  [[ -n "$DOC_NUMBER" ]] \
    && pass "document uploaded (documentNumber=$DOC_NUMBER, documentId=$DOCUMENT_ID)" \
    || fail "upload returned no documentNumber"
fi

if [[ -n "$DOCUMENT_ID" ]]; then
  # ─── 4. Document profile ────────────────────────────────────────────────
  echo ""
  echo "── Document profile ─────────────────────────────────────────────────────"
  PROFILE_CODE=$(curl -s -o /tmp/edocs_profile.json -w "%{http_code}" \
    "${BASE_URL}/v1/edocs/documents/${DOCUMENT_ID}/profile" "${AUTH[@]}")
  check_status "GET /v1/edocs/documents/:id/profile" "$PROFILE_CODE" "200"
  [[ "$PROFILE_CODE" == "200" ]] && \
    check_field "profile body" "$(cat /tmp/edocs_profile.json)" '.success' 'true'

  # ─── 5. Document versions (informational — not a download prerequisite) ─
  echo ""
  echo "── Document versions ────────────────────────────────────────────────────"
  VERSIONS_CODE=$(curl -s -o /tmp/edocs_versions.json -w "%{http_code}" \
    "${BASE_URL}/v1/edocs/documents/${DOCUMENT_ID}/versions" "${AUTH[@]}")
  check_status "GET /v1/edocs/documents/:id/versions" "$VERSIONS_CODE" "200"
  [[ "$VERSIONS_CODE" == "200" ]] && \
    pass "versions listed ($(jq -r '.data.versions | length' /tmp/edocs_versions.json) found)"

  # ─── 6. Download + verify the content round-trips ───────────────────────
  # "0" is a confirmed-working version sentinel ("current version") — the
  # versions list's VERSION_ID/VERSION values both 400 here ("Kan
  # documentversie niet vinden"), so this does not depend on step 7's result.
  echo ""
  echo "── Download + verify content round-trip ─────────────────────────────────"
  DOWNLOAD_CODE=$(curl -s -o /tmp/edocs_download.json -w "%{http_code}" \
    "${BASE_URL}/v1/edocs/documents/${DOCUMENT_ID}/versions/0" "${AUTH[@]}")
  check_status "GET /v1/edocs/documents/:id/versions/0" "$DOWNLOAD_CODE" "200"
  if [[ "$DOWNLOAD_CODE" == "200" ]]; then
    DOWNLOADED_B64=$(jq -r '.data.contentBase64 // empty' /tmp/edocs_download.json)
    if [[ -n "$DOWNLOADED_B64" ]]; then
      DOWNLOADED_HASH=$(printf '%s' "$DOWNLOADED_B64" | base64 -d 2>/dev/null | sha256sum | cut -d' ' -f1)
      if [[ "$DOWNLOADED_HASH" == "$ORIGINAL_HASH" ]]; then
        pass "downloaded content matches uploaded content (sha256 ${ORIGINAL_HASH:0:12}…)"
      else
        fail "downloaded content does not match upload (got ${DOWNLOADED_HASH:0:12}…, want ${ORIGINAL_HASH:0:12}…)"
      fi
    else
      fail "download returned no content"
    fi
  fi
else
  echo ""
  echo "  ~ profile/versions/download skipped - no document id"
fi

# ─── Route 2 — same reads, via the Python MCP POC ──────────────────────────────
#
# Runs before route 2's own upload below — it needs the document route 1
# created above to still exist. Local-only: the POC container isn't deployed
# to acc. document_profile / document_versions take the exact DOCUMENT_ID
# route 1 just created, so a success there is a real cross-path proof
# (MCP → Python container → this backend → live eDOCS DM server, same
# object, same id) — not just "the tool responds". workspace_list has no
# per-item id to cross-check against route 1 (nothing creates a workspace
# any more, see header) — it's listed here purely as a view, same as route 1's.

echo ""
echo "── eDOCS via Python MCP POC (read-only mirror, route 2) ──────────────────"

MCP_DOCUMENT_ID=""
MCP_DOC_NUMBER=""

if [[ "$PYTHON_MCP_POC_ENABLED" != "true" ]]; then
  echo "  ~ skipped - PYTHON_MCP_POC_ENABLED=$PYTHON_MCP_POC_ENABLED (set it to true in $ENV_FILE, or export it, to run route 2)"
elif [[ "$(echo "$TARGET" | tr '[:upper:]' '[:lower:]')" != "local" ]]; then
  echo "  ~ skipped - Python MCP POC is local-only, not deployed to $TARGET"
elif ! mcp_call_tool "$PYTHON_MCP_POC_URL" "workspace_list" "{}" /tmp/edocs_mcp_ws_list.json; then
  echo "  ~ skipped - Python MCP POC not reachable at $PYTHON_MCP_POC_URL (start with: docker compose up -d python-mcp-poc)"
else
  MCP_WS_LIST_BODY="$(mcp_tool_result_json /tmp/edocs_mcp_ws_list.json)"
  check_field "workspace_list via MCP" "$MCP_WS_LIST_BODY" '.success' 'true'
  MCP_WS_COUNT=$(echo "$MCP_WS_LIST_BODY" | jq -r '.data | length' 2>/dev/null)
  echo "  Workspaces via MCP (${MCP_WS_COUNT:-0}):"
  echo "$MCP_WS_LIST_BODY" | jq -r '.data[]? | "    " + (.id // "?") + "  -  " + (.DOCNAME // "?")' 2>/dev/null

  if [[ -n "$DOCUMENT_ID" ]]; then
    if mcp_call_tool "$PYTHON_MCP_POC_URL" "document_profile" \
        "{\"document_id\":\"${DOCUMENT_ID}\"}" /tmp/edocs_mcp_profile.json; then
      check_field "document_profile via MCP (same document as route 1)" \
        "$(mcp_tool_result_json /tmp/edocs_mcp_profile.json)" '.success' 'true'
    else
      fail "document_profile via MCP - call failed"
    fi

    if mcp_call_tool "$PYTHON_MCP_POC_URL" "document_versions" \
        "{\"document_id\":\"${DOCUMENT_ID}\"}" /tmp/edocs_mcp_versions.json; then
      VERSIONS_MCP_BODY=$(mcp_tool_result_json /tmp/edocs_mcp_versions.json)
      check_field "document_versions via MCP (same document as route 1)" "$VERSIONS_MCP_BODY" '.success' 'true'
      if [[ "$(echo "$VERSIONS_MCP_BODY" | jq -r '.success' 2>/dev/null)" == "true" ]]; then
        pass "versions listed via MCP ($(echo "$VERSIONS_MCP_BODY" | jq -r '.data.versions | length' 2>/dev/null) found)"
      fi
    else
      fail "document_versions via MCP - call failed"
    fi
  else
    echo "  ~ document_profile/document_versions via MCP skipped - no document id from route 1"
  fi

  # ─── Route 2 creates its OWN document too (parity, not just a mirror) ──────
  # document_upload/document_download are not chat-exposed (see
  # PythonPocMcpProvider.ts ALLOWED_TOOLS) — called directly here over raw
  # MCP, the same way this script already calls the read tools. Proves the
  # MCP route can independently create+read back its own document, not just
  # read what route 1 made.
  echo ""
  echo "── eDOCS via Python MCP POC - own upload (route 2 parity) ────────────────"

  MCP_MARKER="SMOKE-MCP-${PROJECT_NUMBER}-$(date -u +%FT%TZ)"
  MCP_PDF_TEXT="BT /F1 11 Tf 20 120 Td (eDOCS MCP POC upload) Tj 0 -16 Td (${MCP_MARKER}) Tj ET"
  MCP_PDF_TEXT_LEN=$(printf '%s' "$MCP_PDF_TEXT" | wc -c)
  MCP_PDF_CONTENT=$(cat <<PDFEOF
%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 500 150]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${MCP_PDF_TEXT_LEN}>>
stream
${MCP_PDF_TEXT}
endstream
endobj
trailer<</Root 1 0 R>>
%%EOF
PDFEOF
)
  MCP_CONTENT_B64=$(printf '%s' "$MCP_PDF_CONTENT" | base64 | tr -d '\n')
  MCP_ORIGINAL_HASH=$(printf '%s' "$MCP_PDF_CONTENT" | sha256sum | cut -d' ' -f1)

  if mcp_call_tool "$PYTHON_MCP_POC_URL" "document_upload" \
      "{\"filename\":\"smoke-test-mcp.pdf\",\"content_base64\":\"${MCP_CONTENT_B64}\",\"doc_name\":\"eDOCS MCP POC smoke test\",\"department\":\"${EDOCS_DEPARTMENT}\"}" \
      /tmp/edocs_mcp_upload.json; then
    MCP_UPLOAD_BODY=$(mcp_tool_result_json /tmp/edocs_mcp_upload.json)
    check_field "document_upload via MCP" "$MCP_UPLOAD_BODY" '.success' 'true'
    MCP_DOCUMENT_ID=$(echo "$MCP_UPLOAD_BODY" | jq -r '.data.documentId // empty' 2>/dev/null)
    MCP_DOC_NUMBER=$(echo "$MCP_UPLOAD_BODY" | jq -r '.data.documentNumber // empty' 2>/dev/null)
    if [[ -n "$MCP_DOC_NUMBER" ]]; then
      pass "document uploaded via MCP (documentNumber=$MCP_DOC_NUMBER, documentId=$MCP_DOCUMENT_ID)"
    else
      fail "document_upload via MCP returned no documentNumber"
    fi
  else
    fail "document_upload via MCP - call failed"
  fi

  if [[ -n "$MCP_DOCUMENT_ID" ]]; then
    if mcp_call_tool "$PYTHON_MCP_POC_URL" "document_profile" \
        "{\"document_id\":\"${MCP_DOCUMENT_ID}\"}" /tmp/edocs_mcp_own_profile.json; then
      check_field "document_profile via MCP (own upload)" \
        "$(mcp_tool_result_json /tmp/edocs_mcp_own_profile.json)" '.success' 'true'
    else
      fail "document_profile via MCP (own upload) - call failed"
    fi

    if mcp_call_tool "$PYTHON_MCP_POC_URL" "document_download" \
        "{\"document_id\":\"${MCP_DOCUMENT_ID}\",\"version\":\"0\"}" /tmp/edocs_mcp_download.json; then
      MCP_DOWNLOAD_BODY=$(mcp_tool_result_json /tmp/edocs_mcp_download.json)
      check_field "document_download via MCP (own upload)" "$MCP_DOWNLOAD_BODY" '.success' 'true'
      MCP_DOWNLOADED_B64=$(echo "$MCP_DOWNLOAD_BODY" | jq -r '.data.contentBase64 // empty' 2>/dev/null)
      if [[ -n "$MCP_DOWNLOADED_B64" ]]; then
        MCP_DOWNLOADED_HASH=$(printf '%s' "$MCP_DOWNLOADED_B64" | base64 -d 2>/dev/null | sha256sum | cut -d' ' -f1)
        if [[ "$MCP_DOWNLOADED_HASH" == "$MCP_ORIGINAL_HASH" ]]; then
          pass "MCP-uploaded content round-trips correctly (sha256 ${MCP_ORIGINAL_HASH:0:12}…)"
        else
          fail "MCP-uploaded content does not match on download (got ${MCP_DOWNLOADED_HASH:0:12}…, want ${MCP_ORIGINAL_HASH:0:12}…)"
        fi
      else
        fail "document_download via MCP returned no content"
      fi
    else
      fail "document_download via MCP - call failed"
    fi
  fi
fi

# ─── 7. Summary — no cleanup step (see "Known limitations" in the header) ─────
# Nothing is deleted: workspaces are never created by this script (view-only,
# per the header), and document delete is known to 502 for this account
# (no delete-document right) — so there's nothing to usefully prompt for.
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  Created in eDOCS this run (left in place - see header):"
[[ -n "$DOCUMENT_ID" ]] && \
  echo "    document : ${DOCUMENT_ID}  (documentNumber=${DOC_NUMBER})  [route 1 - direct HTTP]"
[[ -n "$MCP_DOCUMENT_ID" ]] && \
  echo "    document : ${MCP_DOCUMENT_ID}  (documentNumber=${MCP_DOC_NUMBER})  [route 2 - Python MCP POC]"
if [[ -n "${EDOCS_PORTAL_URL:-}" ]]; then
  echo "    InfoCenter: ${EDOCS_PORTAL_URL%/}"
else
  echo "    (set EDOCS_PORTAL_URL to print a direct InfoCenter link here)"
fi
echo "─────────────────────────────────────────────────────────────────────────"

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  Results: $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "  Failures:"
  for e in "${ERRORS[@]}"; do echo "    - $e"; done
  echo ""
  exit 1
fi

echo ""
rm -f /tmp/edocs_status.json /tmp/edocs_ws_list.json /tmp/edocs_doc.json \
      /tmp/edocs_profile.json /tmp/edocs_versions.json /tmp/edocs_download.json \
      /tmp/edocs_mcp_init_headers.txt /tmp/edocs_mcp_ws_list.json /tmp/edocs_mcp_profile.json \
      /tmp/edocs_mcp_versions.json /tmp/edocs_mcp_upload.json /tmp/edocs_mcp_own_profile.json \
      /tmp/edocs_mcp_download.json
exit 0