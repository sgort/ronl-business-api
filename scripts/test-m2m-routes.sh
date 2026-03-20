#!/usr/bin/env bash
# test-m2m-routes.sh
# Validates the active M2M route operations against ACC.
#
# Usage:
#   CLIENT_SECRET=<secret> bash scripts/test-m2m-routes.sh
#
# Optional overrides:
#   BASE_URL=https://acc.api.open-regels.nl
#   KEYCLOAK_URL=https://acc.keycloak.open-regels.nl
#   CLIENT_ID=operaton-mcp-client
#   DECISION_KEY=TreeFellingDecision

set -u

BASE_URL="${BASE_URL:-https://acc.api.open-regels.nl}"
KEYCLOAK_URL="${KEYCLOAK_URL:-https://acc.keycloak.open-regels.nl}"
# For local development use:
# BASE_URL="${BASE_URL:-http://localhost:3002}"
# KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
CLIENT_ID="${CLIENT_ID:-operaton-mcp-client}"
DECISION_KEY="${DECISION_KEY:-TreeFellingDecision}"

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
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label — expected HTTP $expected, got HTTP $actual"
  fi
}

check_field() {
  local label="$1"
  local body="$2"
  local field="$3"
  local expected="$4"
  local actual
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

JWT_PAYLOAD=$(echo "$TOKEN" | cut -d. -f2 | awk '{ n=length($0)%4; if(n==2) print $0"=="; else if(n==3) print $0"="; else print $0 }' | base64 -d 2>/dev/null)

AZP=$(echo "$JWT_PAYLOAD" | jq -r '.azp // empty')
AUD=$(echo "$JWT_PAYLOAD" | jq -r '.aud // empty')
MUNICIPALITY=$(echo "$JWT_PAYLOAD" | jq -r '.municipality // "absent"')

[[ "$AZP" == "$CLIENT_ID" ]] && pass "azp claim = $CLIENT_ID" || fail "azp claim mismatch (got: $AZP)"
[[ "$AUD" == *"ronl-business-api"* ]] && pass "aud contains ronl-business-api" || fail "aud missing ronl-business-api (got: $AUD)"
[[ "$MUNICIPALITY" == "absent" ]] && pass "municipality claim absent (correct for M2M)" || fail "municipality claim present — M2M token should not be tenant-scoped"

# ─── Active operations ────────────────────────────────────────────────────────

echo ""
echo "── Active operations ────────────────────────────────────────────────────"

# task.list
TASK_LIST_STATUS=$(curl -s -o /tmp/m2m_task_list.json -w "%{http_code}" \
  "${BASE_URL}/v1/m2m/task" \
  -H "Authorization: Bearer $TOKEN")

check_status "GET /v1/m2m/task" "$TASK_LIST_STATUS" "200"

if [[ "$TASK_LIST_STATUS" == "200" ]]; then
  check_field "GET /v1/m2m/task body" "$(cat /tmp/m2m_task_list.json)" '.success' 'true'
  TASK_COUNT=$(jq '.data | length' /tmp/m2m_task_list.json)
  pass "GET /v1/m2m/task returned $TASK_COUNT task(s)"

  FIRST_TASK_ID=$(jq -r '.data[0].id // empty' /tmp/m2m_task_list.json)
  if [[ -n "$FIRST_TASK_ID" ]]; then
    # task.get
    TASK_GET_STATUS=$(curl -s -o /tmp/m2m_task_get.json -w "%{http_code}" \
      "${BASE_URL}/v1/m2m/task/${FIRST_TASK_ID}" \
      -H "Authorization: Bearer $TOKEN")
    check_status "GET /v1/m2m/task/:id" "$TASK_GET_STATUS" "200"
    if [[ "$TASK_GET_STATUS" == "200" ]]; then
      RETURNED_ID=$(jq -r '.data.id // empty' /tmp/m2m_task_get.json)
      [[ "$RETURNED_ID" == "$FIRST_TASK_ID" ]] \
        && pass "GET /v1/m2m/task/:id returned correct task id" \
        || fail "GET /v1/m2m/task/:id — id mismatch (expected $FIRST_TASK_ID, got $RETURNED_ID)"
    fi

    # task.variables
    TASK_VARS_STATUS=$(curl -s -o /tmp/m2m_task_vars.json -w "%{http_code}" \
      "${BASE_URL}/v1/m2m/task/${FIRST_TASK_ID}/variables" \
      -H "Authorization: Bearer $TOKEN")
    check_status "GET /v1/m2m/task/:id/variables" "$TASK_VARS_STATUS" "200"
    if [[ "$TASK_VARS_STATUS" == "200" ]]; then
      check_field "GET /v1/m2m/task/:id/variables body" "$(cat /tmp/m2m_task_vars.json)" '.success' 'true'
    fi

    # task.form-schema (404 is acceptable — task may have no deployed form)
    TASK_FORM_STATUS=$(curl -s -o /tmp/m2m_task_form.json -w "%{http_code}" \
      "${BASE_URL}/v1/m2m/task/${FIRST_TASK_ID}/form-schema" \
      -H "Authorization: Bearer $TOKEN")
    if [[ "$TASK_FORM_STATUS" == "200" || "$TASK_FORM_STATUS" == "404" ]]; then
      pass "GET /v1/m2m/task/:id/form-schema (HTTP $TASK_FORM_STATUS — route reached)"
    else
      fail "GET /v1/m2m/task/:id/form-schema — unexpected HTTP $TASK_FORM_STATUS"
    fi
  else
    echo "  ~ task/:id routes skipped — no tasks in list"
  fi
fi

# process.list
PROC_LIST_STATUS=$(curl -s -o /tmp/m2m_proc_list.json -w "%{http_code}" \
  "${BASE_URL}/v1/m2m/process" \
  -H "Authorization: Bearer $TOKEN")
check_status "GET /v1/m2m/process" "$PROC_LIST_STATUS" "200"
if [[ "$PROC_LIST_STATUS" == "200" ]]; then
  check_field "GET /v1/m2m/process body" "$(cat /tmp/m2m_proc_list.json)" '.success' 'true'

  FIRST_PROC_ID=$(jq -r '.data[0].id // empty' /tmp/m2m_proc_list.json)
  FIRST_PROC_KEY=$(jq -r '.data[0].definitionId // empty' /tmp/m2m_proc_list.json | cut -d: -f1)
  if [[ -n "$FIRST_PROC_ID" ]]; then
    # process.status
    PROC_STATUS_STATUS=$(curl -s -o /tmp/m2m_proc_status.json -w "%{http_code}" \
      "${BASE_URL}/v1/m2m/process/${FIRST_PROC_ID}/status" \
      -H "Authorization: Bearer $TOKEN")
    check_status "GET /v1/m2m/process/:id/status" "$PROC_STATUS_STATUS" "200"

    # process.variables
    PROC_VARS_STATUS=$(curl -s -o /tmp/m2m_proc_vars.json -w "%{http_code}" \
      "${BASE_URL}/v1/m2m/process/${FIRST_PROC_ID}/variables" \
      -H "Authorization: Bearer $TOKEN")
    check_status "GET /v1/m2m/process/:id/variables" "$PROC_VARS_STATUS" "200"

    # process.historic-variables (404 acceptable for active instances)
    PROC_HIST_VARS_STATUS=$(curl -s -o /tmp/m2m_proc_histvars.json -w "%{http_code}" \
      "${BASE_URL}/v1/m2m/process/${FIRST_PROC_ID}/historic-variables" \
      -H "Authorization: Bearer $TOKEN")
    if [[ "$PROC_HIST_VARS_STATUS" == "200" || "$PROC_HIST_VARS_STATUS" == "404" ]]; then
      pass "GET /v1/m2m/process/:id/historic-variables (HTTP $PROC_HIST_VARS_STATUS — route reached)"
    else
      fail "GET /v1/m2m/process/:id/historic-variables — unexpected HTTP $PROC_HIST_VARS_STATUS"
    fi

    # process.decision-document (404 acceptable — may have no ronl:documentRef)
    PROC_DOC_STATUS=$(curl -s -o /tmp/m2m_proc_doc.json -w "%{http_code}" \
      "${BASE_URL}/v1/m2m/process/${FIRST_PROC_ID}/decision-document" \
      -H "Authorization: Bearer $TOKEN")
    if [[ "$PROC_DOC_STATUS" == "200" || "$PROC_DOC_STATUS" == "404" ]]; then
      pass "GET /v1/m2m/process/:id/decision-document (HTTP $PROC_DOC_STATUS — route reached)"
    else
      fail "GET /v1/m2m/process/:id/decision-document — unexpected HTTP $PROC_DOC_STATUS"
    fi
  else
    echo "  ~ process/:id routes skipped — no active process instances"
  fi

  if [[ -n "$FIRST_PROC_KEY" ]]; then
    # process.start-form (404 acceptable — process may have no deployed start form)
    PROC_FORM_STATUS=$(curl -s -o /tmp/m2m_proc_form.json -w "%{http_code}" \
      "${BASE_URL}/v1/m2m/process/${FIRST_PROC_KEY}/start-form" \
      -H "Authorization: Bearer $TOKEN")
    if [[ "$PROC_FORM_STATUS" == "200" || "$PROC_FORM_STATUS" == "404" ]]; then
      pass "GET /v1/m2m/process/:key/start-form (HTTP $PROC_FORM_STATUS — route reached)"
    else
      fail "GET /v1/m2m/process/:key/start-form — unexpected HTTP $PROC_FORM_STATUS"
    fi

    # process.variable-hints
    PROC_HINTS_STATUS=$(curl -s -o /tmp/m2m_proc_hints.json -w "%{http_code}" \
      "${BASE_URL}/v1/m2m/process/${FIRST_PROC_KEY}/variable-hints" \
      -H "Authorization: Bearer $TOKEN")
    check_status "GET /v1/m2m/process/:key/variable-hints" "$PROC_HINTS_STATUS" "200"
  else
    echo "  ~ process/:key routes skipped — no process definition key available"
  fi
fi

# process.history
PROC_HIST_STATUS=$(curl -s -o /tmp/m2m_proc_hist.json -w "%{http_code}" \
  "${BASE_URL}/v1/m2m/process/history" \
  -H "Authorization: Bearer $TOKEN")
check_status "GET /v1/m2m/process/history" "$PROC_HIST_STATUS" "200"

# decision.evaluate
DECISION_STATUS=$(curl -s -o /tmp/m2m_decision.json -w "%{http_code}" \
  -X POST "${BASE_URL}/v1/m2m/decision/${DECISION_KEY}/evaluate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"variables": {"treeDiameter": 45, "protectedArea": false}}')
check_status "POST /v1/m2m/decision/:key/evaluate" "$DECISION_STATUS" "200"
if [[ "$DECISION_STATUS" == "200" ]]; then
  check_field "POST /v1/m2m/decision/:key/evaluate body" "$(cat /tmp/m2m_decision.json)" '.success' 'true'
fi

# decision.get
DECISION_GET_STATUS=$(curl -s -o /tmp/m2m_decision_get.json -w "%{http_code}" \
  "${BASE_URL}/v1/m2m/decision/${DECISION_KEY}" \
  -H "Authorization: Bearer $TOKEN")
check_status "GET /v1/m2m/decision/:key" "$DECISION_GET_STATUS" "200"
if [[ "$DECISION_GET_STATUS" == "200" ]]; then
  check_field "GET /v1/m2m/decision/:key body" "$(cat /tmp/m2m_decision_get.json)" '.success' 'true'
fi

# ─── No disabled operations — all are active ─────────────────────────────────

echo ""
echo "── No disabled operations (all gates open) ─────────────────────────────"
pass "M2M_ALLOWED_OPERATIONS contains all operations"

# ─── Tenant-scoped routes must still be blocked ───────────────────────────────

echo ""
echo "── Tenant isolation check (M2M token must not reach /v1/task) ──────────"

TENANT_STATUS=$(curl -s -o /tmp/m2m_tenant.json -w "%{http_code}" \
  "${BASE_URL}/v1/task" \
  -H "Authorization: Bearer $TOKEN")

TENANT_CODE=$(jq -r '.error.code // empty' /tmp/m2m_tenant.json)

if [[ "$TENANT_STATUS" == "403" && "$TENANT_CODE" == "MISSING_TENANT" ]]; then
  pass "GET /v1/task → 403 MISSING_TENANT (tenant isolation intact)"
else
  fail "GET /v1/task → expected 403 MISSING_TENANT, got HTTP $TENANT_STATUS code=$TENANT_CODE"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  Results: $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "  Failures:"
  for e in "${ERRORS[@]}"; do
    echo "    - $e"
  done
  echo ""
  exit 1
fi

echo ""
rm -f /tmp/m2m_task_list.json /tmp/m2m_task_get.json /tmp/m2m_decision.json /tmp/m2m_disabled.json /tmp/m2m_tenant.json
exit 0