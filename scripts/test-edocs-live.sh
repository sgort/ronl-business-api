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
# Optional overrides:
#   BASE_URL=https://acc.api.open-regels.nl
#   KEYCLOAK_URL=https://acc.keycloak.open-regels.nl
#   CLIENT_ID=operaton-mcp-client
#   PROJECT_NUMBER=SMOKE-<timestamp>       # override to reuse/inspect a workspace
#   PROJECT_NAME="eDOCS CLI smoke test"
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
  # This is the whole point of the pre-flight: confirm we are NOT in stub mode
  # and the DM server reports up.
  check_field "stub mode disabled" "$STATUS_BODY" '.data.stubMode' 'false'
  DM_STATUS=$(echo "$STATUS_BODY" | jq -r '.data.status')
  if [[ "$DM_STATUS" == "up" ]]; then
    pass "eDOCS reachable (.data.status = up)"
  else
    fail "eDOCS not reachable (.data.status = $DM_STATUS) — check EDOCS_BASE_URL / credentials"
    echo "$STATUS_BODY" | jq . 2>/dev/null
  fi
fi

# Abort the mutating steps if we are still in stub or the DM server is down —
# they would either be meaningless (stub) or pile up failures (down).
if [[ "$STATUS_CODE" != "200" ]] || \
   [[ "$(jq -r '.data.stubMode' /tmp/edocs_status.json 2>/dev/null)" != "false" ]] || \
   [[ "$(jq -r '.data.status' /tmp/edocs_status.json 2>/dev/null)" != "up" ]]; then
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
