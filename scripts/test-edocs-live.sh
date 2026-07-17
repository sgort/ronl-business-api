#!/usr/bin/env bash
# test-edocs-live.sh
# End-to-end smoke test of the eDOCS connector against a LIVE OpenText eDOCS
# backend, through the /v1/edocs HTTP surface — the same path the frontend uses.
#
# Run this AFTER setting EDOCS_STUB_MODE=false and restarting the backend, but
# BEFORE exercising the UI. It proves auth, workspace ensure, document upload and
# listing all work against the real DM server.
#
# Usage:
#   CLIENT_SECRET=<secret> bash scripts/test-edocs-live.sh
#
# A Keycloak-free pre-flight runs first: it probes eDOCS reachability + login
# in-process (packages/backend/.env) and aborts BEFORE the token dance / any
# mutation if eDOCS is unreachable, in stub mode, or the account cannot log in.
# For just that reach/login answer on its own, use: npm run edocs:health.
#
# Optional overrides:
#   BASE_URL=https://acc.api.open-regels.nl
#   KEYCLOAK_URL=https://acc.keycloak.open-regels.nl
#   CLIENT_ID=operaton-mcp-client
#   PROJECT_NUMBER=SMOKE-<timestamp>       # override to reuse/inspect a workspace
#   PROJECT_NAME="eDOCS CLI smoke test"
#   SKIP_LOCAL_PROBE=1                     # skip pre-flight (local .env ≠ target)
#   NODE_ENV=development                   # which .env the pre-flight loads
#
# NOTE: a successful run creates a REAL workspace and document in eDOCS. The
# service exposes no delete, so clean up manually if your library requires it.
# The default PROJECT_NUMBER is timestamped so runs never collide.

set -u

BASE_URL="${BASE_URL:-https://acc.api.open-regels.nl}"
KEYCLOAK_URL="${KEYCLOAK_URL:-https://acc.keycloak.open-regels.nl}"
# For a local live test (backend on localhost pointed at the real eDOCS server):
# BASE_URL="${BASE_URL:-http://localhost:3002}"
# KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
CLIENT_ID="${CLIENT_ID:-operaton-mcp-client}"
PROJECT_NUMBER="${PROJECT_NUMBER:-SMOKE-$(date +%Y%m%d-%H%M%S)}"
PROJECT_NAME="${PROJECT_NAME:-eDOCS CLI smoke test}"

# Repo layout — used to run the Keycloak-free eDOCS reach/login pre-flight.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/packages/backend"

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

# ─── 4. Upload a document ─────────────────────────────────────────────────────

echo ""
echo "── Upload document ──────────────────────────────────────────────────────"

if [[ -n "$WORKSPACE_ID" ]]; then
  CONTENT_B64=$(printf '%s' "eDOCS CLI smoke test — ${PROJECT_NUMBER} — $(date -u +%FT%TZ)" | base64 | tr -d '\n')
  DOC_CODE=$(curl -s -o /tmp/edocs_doc.json -w "%{http_code}" \
    -X POST "${BASE_URL}/v1/edocs/documents" "${AUTH[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"workspaceId\":\"${WORKSPACE_ID}\",\"filename\":\"smoke-test.txt\",\"contentBase64\":\"${CONTENT_B64}\",\"metadata\":{\"docName\":\"CLI smoke test document\",\"appId\":\"INFRA\"}}")
  check_status "POST /v1/edocs/documents" "$DOC_CODE" "200"
  if [[ "$DOC_CODE" == "200" ]]; then
    DOC_NUMBER=$(jq -r '.data.documentNumber // empty' /tmp/edocs_doc.json)
    [[ -n "$DOC_NUMBER" ]] \
      && pass "document uploaded (documentNumber=$DOC_NUMBER)" \
      || fail "upload returned no documentNumber"
  fi

  # ─── 5. List the workspace's documents ──────────────────────────────────────
  echo ""
  echo "── Workspace documents ──────────────────────────────────────────────────"
  DOCS_CODE=$(curl -s -o /tmp/edocs_docs.json -w "%{http_code}" \
    "${BASE_URL}/v1/edocs/workspaces/${WORKSPACE_ID}/documents" "${AUTH[@]}")
  check_status "GET /v1/edocs/workspaces/:id/documents" "$DOCS_CODE" "200"
  [[ "$DOCS_CODE" == "200" ]] && \
    check_field "documents body" "$(cat /tmp/edocs_docs.json)" '.success' 'true'
else
  echo "  ~ upload + document-list skipped — no workspace id"
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
      /tmp/edocs_doc.json /tmp/edocs_docs.json
exit 0
