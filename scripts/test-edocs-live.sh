#!/usr/bin/env bash
# test-edocs-live.sh
# End-to-end smoke test of the eDOCS connector against a LIVE OpenText eDOCS
# backend, through the /v1/edocs HTTP surface — the same path the frontend uses.
#
# Run this AFTER setting EDOCS_STUB_MODE=false and restarting the backend, but
# BEFORE exercising the UI. It proves auth, workspace ensure, and document
# upload/profile/versions/download/delete all work against the real DM server.
#
# Document upload is STANDALONE (no workspaceId) — the workspace-ref upload
# path is still broken server-side (see docs/EDOCS-GO-LIVE.md § Known issues),
# so upload no longer depends on the "Ensure workspace" step succeeding.
# Ensure-workspace is still run and checked independently.
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
#   PROJECT_NUMBER=SMOKE-<timestamp>       # override to reuse/inspect a workspace
#   PROJECT_NAME="eDOCS CLI smoke test"
#   EDOCS_DEPARTMENT=IVR                   # UV_AFD_NAAM profile field (mandatory on the DM server)
#   SKIP_LOCAL_PROBE=1                     # skip pre-flight (local .env ≠ target)
#   NODE_ENV=development                   # which .env the pre-flight loads
#   EDOCS_PORTAL_URL=https://<host>/infocenter   # printed as a browsable link before cleanup
#   AUTO_CONFIRM_CLEANUP=1                 # skip the y/N prompt and delete automatically
#
# NOTE: a successful run creates a REAL workspace (via ensure) and a REAL
# standalone document in eDOCS, downloads the document back to verify the
# round-trip, then asks for explicit confirmation before deleting both. In a
# non-interactive shell (no TTY) cleanup is skipped by default — set
# AUTO_CONFIRM_CLEANUP=1 to delete without prompting (e.g. in CI). The default
# PROJECT_NUMBER is timestamped so runs never collide, and skipped-cleanup
# artifacts stay identifiable by it.

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
PROJECT_NAME="${PROJECT_NAME:-eDOCS CLI smoke test}"
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
    echo "  ~ probe produced no result — skipping pre-flight (run: cd packages/backend && npm run edocs:health)"
  elif [[ "$(echo "$PROBE_JSON" | jq -r '.status')" == "stub" ]]; then
    echo "  ✗ eDOCS is in STUB mode locally — set EDOCS_STUB_MODE=false and retry."
    echo "    (Nothing to smoke-test against a stub. Aborting before the token dance.)"
    exit 1
  else
    p_rch=$(echo "$PROBE_JSON" | jq -r '.reachable')
    p_aut=$(echo "$PROBE_JSON" | jq -r '.authenticated')
    if [[ "$p_rch" != "true" ]]; then
      echo "  ✗ eDOCS not reachable: $(echo "$PROBE_JSON" | jq -r '.error // "no detail"')"
      echo "    Aborting — the mutating steps would fail. (SKIP_LOCAL_PROBE=1 to override.)"
      exit 1
    fi
    echo "  ✓ eDOCS reachable"
    if [[ "$p_aut" != "true" ]]; then
      echo "  ✗ eDOCS login failed: $(echo "$PROBE_JSON" | jq -r '.error // "no detail (see backend logs / rapi_details)"')"
      echo "    Aborting — credentials cannot log in (locked out?). (SKIP_LOCAL_PROBE=1 to override.)"
      exit 1
    fi
    echo "  ✓ eDOCS login OK — proceeding to the authenticated backend path."
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
    fail "$label — expected HTTP $expected, got HTTP $actual"
  fi
}

check_field() {
  local label="$1" body="$2" field="$3" expected="$4" actual
  actual=$(echo "$body" | jq -r "$field" 2>/dev/null || echo "__jq_error__")
  if [[ "$actual" == "$expected" ]]; then
    pass "$label ($field = $expected)"
  else
    fail "$label — expected $field=$expected, got $field=$actual"
  fi
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
  echo "  ! Skipping workspace/document steps — status pre-flight did not pass."
  echo ""
  echo "  Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ─── 2. List workspaces ───────────────────────────────────────────────────────

echo ""
echo "── Workspaces ───────────────────────────────────────────────────────────"

WS_LIST_CODE=$(curl -s -o /tmp/edocs_ws_list.json -w "%{http_code}" \
  "${BASE_URL}/v1/edocs/workspaces" "${AUTH[@]}")
check_status "GET /v1/edocs/workspaces" "$WS_LIST_CODE" "200"
[[ "$WS_LIST_CODE" == "200" ]] && \
  check_field "workspace list body" "$(cat /tmp/edocs_ws_list.json)" '.success' 'true'

# ─── 3. Ensure workspace ──────────────────────────────────────────────────────

echo ""
echo "── Ensure workspace ($PROJECT_NUMBER) ───────────────────────────────────"

WS_ENSURE_CODE=$(curl -s -o /tmp/edocs_ws_ensure.json -w "%{http_code}" \
  -X POST "${BASE_URL}/v1/edocs/workspaces/ensure" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"projectNumber\":\"${PROJECT_NUMBER}\",\"projectName\":\"${PROJECT_NAME}\"}")
check_status "POST /v1/edocs/workspaces/ensure" "$WS_ENSURE_CODE" "200"

WORKSPACE_ID=""
if [[ "$WS_ENSURE_CODE" == "200" ]]; then
  check_field "ensure body" "$(cat /tmp/edocs_ws_ensure.json)" '.success' 'true'
  WORKSPACE_ID=$(jq -r '.data.workspaceId // empty' /tmp/edocs_ws_ensure.json)
  if [[ -n "$WORKSPACE_ID" ]]; then
    pass "workspace id returned: $WORKSPACE_ID (created=$(jq -r '.data.created' /tmp/edocs_ws_ensure.json))"
  else
    fail "ensure returned no workspaceId"
  fi
fi

# ─── 4. Upload a document — standalone (the confirmed-working path) ───────────
#
# The workspace-ref path (passing workspaceId) is still broken server-side
# (see EDOCS-GO-LIVE.md § Known issues) — this uploads standalone instead,
# which is the only path confirmed working live. This no longer depends on
# WORKSPACE_ID from step 3; ensure-workspace above is validated independently.

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

# ─── 5. List the workspace's content (endpoint check) ─────────────────────────
# The document above is standalone, so this exercises the endpoint fix without
# expecting to see it — only runs when step 3 produced a WORKSPACE_ID.
if [[ -n "$WORKSPACE_ID" ]]; then
  echo ""
  echo "── Workspace documents ──────────────────────────────────────────────────"
  DOCS_CODE=$(curl -s -o /tmp/edocs_docs.json -w "%{http_code}" \
    "${BASE_URL}/v1/edocs/workspaces/${WORKSPACE_ID}/documents" "${AUTH[@]}")
  check_status "GET /v1/edocs/workspaces/:id/documents" "$DOCS_CODE" "200"
  [[ "$DOCS_CODE" == "200" ]] && \
    check_field "documents body" "$(cat /tmp/edocs_docs.json)" '.success' 'true'
else
  echo ""
  echo "  ~ workspace-documents check skipped — no workspace id"
fi

if [[ -n "$DOCUMENT_ID" ]]; then
  # ─── 6. Document profile ────────────────────────────────────────────────
  echo ""
  echo "── Document profile ─────────────────────────────────────────────────────"
  PROFILE_CODE=$(curl -s -o /tmp/edocs_profile.json -w "%{http_code}" \
    "${BASE_URL}/v1/edocs/documents/${DOCUMENT_ID}/profile" "${AUTH[@]}")
  check_status "GET /v1/edocs/documents/:id/profile" "$PROFILE_CODE" "200"
  [[ "$PROFILE_CODE" == "200" ]] && \
    check_field "profile body" "$(cat /tmp/edocs_profile.json)" '.success' 'true'

  # ─── 7. Document versions (informational — not a download prerequisite) ─
  echo ""
  echo "── Document versions ────────────────────────────────────────────────────"
  VERSIONS_CODE=$(curl -s -o /tmp/edocs_versions.json -w "%{http_code}" \
    "${BASE_URL}/v1/edocs/documents/${DOCUMENT_ID}/versions" "${AUTH[@]}")
  check_status "GET /v1/edocs/documents/:id/versions" "$VERSIONS_CODE" "200"
  [[ "$VERSIONS_CODE" == "200" ]] && \
    pass "versions listed ($(jq -r '.data.versions | length' /tmp/edocs_versions.json) found)"

  # ─── 8. Download + verify the content round-trips ───────────────────────
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
  echo "  ~ profile/versions/download skipped — no document id"
fi

# ─── 9. Browse before cleanup, then confirm ────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  Created in eDOCS:"
[[ -n "$WORKSPACE_ID" ]] && \
  echo "    workspace : ${WORKSPACE_ID}  (${PROJECT_NUMBER} — ${PROJECT_NAME})"
[[ -n "$DOCUMENT_ID" ]] && \
  echo "    document  : ${DOCUMENT_ID}  (documentNumber=${DOC_NUMBER}, standalone — no workspace ref)"
if [[ -n "${EDOCS_PORTAL_URL:-}" ]]; then
  echo "    InfoCenter: ${EDOCS_PORTAL_URL%/}"
else
  echo "    (set EDOCS_PORTAL_URL to print a direct InfoCenter link here)"
fi
echo "─────────────────────────────────────────────────────────────────────────"

if [[ -n "$WORKSPACE_ID" || -n "$DOCUMENT_ID" ]]; then
  DO_CLEANUP=0
  if [[ "${AUTO_CONFIRM_CLEANUP:-0}" == "1" ]]; then
    DO_CLEANUP=1
    echo "  AUTO_CONFIRM_CLEANUP=1 — deleting without prompting."
  elif [[ -t 0 ]]; then
    read -r -p "  Reviewed in InfoCenter? Delete what was created now? [y/N] " REPLY
    [[ "$REPLY" =~ ^[Yy]$ ]] && DO_CLEANUP=1
  else
    echo "  ~ non-interactive shell — skipping cleanup (set AUTO_CONFIRM_CLEANUP=1 to auto-delete)."
  fi

  if [[ "$DO_CLEANUP" == "1" ]]; then
    echo ""
    echo "── Cleanup ───────────────────────────────────────────────────────────────"
    if [[ -n "$DOCUMENT_ID" ]]; then
      DEL_DOC_CODE=$(curl -s -o /tmp/edocs_del_doc.json -w "%{http_code}" \
        -X DELETE "${BASE_URL}/v1/edocs/documents/${DOCUMENT_ID}" "${AUTH[@]}")
      check_status "DELETE /v1/edocs/documents/:id" "$DEL_DOC_CODE" "200"
    fi
    if [[ -n "$WORKSPACE_ID" ]]; then
      DEL_WS_CODE=$(curl -s -o /tmp/edocs_del_ws.json -w "%{http_code}" \
        -X DELETE "${BASE_URL}/v1/edocs/workspaces/${WORKSPACE_ID}" "${AUTH[@]}")
      check_status "DELETE /v1/edocs/workspaces/:id" "$DEL_WS_CODE" "200"
    fi
  else
    echo "  ~ cleanup skipped — workspace ${WORKSPACE_ID} / document ${DOCUMENT_ID} left in eDOCS."
  fi
fi

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
rm -f /tmp/edocs_status.json /tmp/edocs_ws_list.json /tmp/edocs_ws_ensure.json \
      /tmp/edocs_doc.json /tmp/edocs_docs.json /tmp/edocs_profile.json \
      /tmp/edocs_versions.json /tmp/edocs_download.json /tmp/edocs_del_doc.json \
      /tmp/edocs_del_ws.json
exit 0
