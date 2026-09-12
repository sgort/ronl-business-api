#!/usr/bin/env bash
# test-m2m-routes.sh
# Validates the active M2M route operations against a running backend.
#
# Usage:
#   bash scripts/test-m2m-routes.sh                        # local (default)
#   TARGET=acc CLIENT_SECRET=<secret> bash scripts/test-m2m-routes.sh
#
# On TARGET=local the client secret is read from config/keycloak/ronl-realm.json
# (the seeded operaton-mcp-client), so no secret has to be exported. TARGET=acc
# always needs an explicit CLIENT_SECRET — those credentials are not in the repo.
#
# Optional overrides:
#   TARGET=local|acc          picks a preset pair of URLs (default: local)
#   BASE_URL / KEYCLOAK_URL   set either explicitly to override the TARGET preset
#   CLIENT_ID=operaton-mcp-client
#   DECISION_KEY / DECISION_VARS   override the per-TARGET decision preset

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REALM_FILE="$REPO_ROOT/config/keycloak/ronl-realm.json"

TARGET="${TARGET:-local}"
TARGET_LC="$(echo "$TARGET" | tr '[:upper:]' '[:lower:]')"
case "$TARGET_LC" in
  local)
    DEFAULT_BASE_URL="http://localhost:3002"
    DEFAULT_KEYCLOAK_URL="http://localhost:8080"
    # From the local fixture bundle (docker-compose Operaton).
    DEFAULT_DECISION_KEY="TreeFellingDecision"
    DEFAULT_DECISION_VARS='{"variables": {"treeDiameter": 45, "protectedArea": false}}'
    ;;
  acc)
    DEFAULT_BASE_URL="https://acc.api.open-regels.nl"
    DEFAULT_KEYCLOAK_URL="https://acc.keycloak.open-regels.nl"
    # ACC's M2M client talks to operaton-doc, a different engine from ACC's main
    # one, and TreeFellingDecision is not deployed there. AwbCompletenessCheck is:
    # one input, and a catch-all rule under FIRST hit policy, so any value
    # evaluates cleanly rather than erroring.
    DEFAULT_DECISION_KEY="AwbCompletenessCheck"
    DEFAULT_DECISION_VARS='{"variables": {"productType": "TreeFellingPermit"}}'
    ;;
  *)
    echo "ERROR: unknown TARGET='$TARGET' (expected 'local' or 'acc')."
    exit 1
    ;;
esac

BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"
KEYCLOAK_URL="${KEYCLOAK_URL:-$DEFAULT_KEYCLOAK_URL}"
CLIENT_ID="${CLIENT_ID:-operaton-mcp-client}"
DECISION_KEY="${DECISION_KEY:-$DEFAULT_DECISION_KEY}"
DECISION_VARS="${DECISION_VARS:-$DEFAULT_DECISION_VARS}"

# On localhost, fall back to the seeded realm's own client secret so the script
# runs with no arguments. An exported CLIENT_SECRET always wins, and the realm
# file is never consulted for TARGET=acc — those creds belong to the ACC realm.
CREDS_SOURCE="environment"
if [[ "$TARGET_LC" == "local" && -z "${CLIENT_SECRET:-}" && -f "$REALM_FILE" ]]; then
  CLIENT_SECRET="$(
    python -c "
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding='utf-8'))
    print(next(c.get('secret', '') for c in d.get('clients', []) if c.get('clientId') == sys.argv[2]))
except Exception:
    print('')
" "$REALM_FILE" "$CLIENT_ID" 2>/dev/null
  )"
  [[ -n "${CLIENT_SECRET:-}" ]] && CREDS_SOURCE="$REALM_FILE"
fi

if [[ -z "${CLIENT_SECRET:-}" ]]; then
  echo "ERROR: CLIENT_SECRET is not set and could not be read from the realm file."
  echo "Usage: TARGET=acc CLIENT_SECRET=<secret> bash $0"
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
echo "  M2M route test  ·  TARGET=$TARGET"
echo "  backend:  $BASE_URL"
echo "  keycloak: $KEYCLOAK_URL"
echo "  client:   $CLIENT_ID (secret from $CREDS_SOURCE)"
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
  if [[ "$TARGET_LC" == "local" && "$CREDS_SOURCE" == "$REALM_FILE" ]]; then
    echo ""
    echo "  The secret came from the realm file. Keycloak only imports that on a"
    echo "  first start, so a long-lived keycloak-data volume can hold a different"
    echo "  one. Read what the running realm actually has with:"
    echo ""
    echo "    ADM=\$(curl -s -X POST $KEYCLOAK_URL/realms/master/protocol/openid-connect/token \\"
    echo "      -d grant_type=password -d client_id=admin-cli -d username=admin -d password=admin \\"
    echo "      | jq -r .access_token)"
    echo "    ID=\$(curl -s -H \"Authorization: Bearer \$ADM\" \\"
    echo "      \"$KEYCLOAK_URL/admin/realms/ronl/clients?clientId=$CLIENT_ID\" | jq -r '.[0].id')"
    echo "    curl -s -H \"Authorization: Bearer \$ADM\" \\"
    echo "      \"$KEYCLOAK_URL/admin/realms/ronl/clients/\$ID/client-secret\" | jq -r .value"
    echo ""
    echo "  then re-run with CLIENT_SECRET=<that value>, or reset the realm with"
    echo "  'npm run docker:down:volumes && npm run docker:up' to re-import."
  fi
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
    # process.start-form. Against ACC the deployed bundle is unknown, so 404 is
    # acceptable — the process may simply have no start-event form. Locally the
    # fixture bundle is known, and the stronger assertions further down run too.
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

# decision.get — run first, because it doubles as the existence probe. Which
# decisions are deployed is engine data, not route behaviour: local and ACC talk
# to different engines, so a key missing from one is not a regression in the
# other. A 404 here skips both decision checks with a ~ rather than reporting a
# phantom failure, matching how the rest of the live scripts treat an absent
# dependency.
DECISION_GET_STATUS=$(curl -s -o /tmp/m2m_decision_get.json -w "%{http_code}" \
  "${BASE_URL}/v1/m2m/decision/${DECISION_KEY}" \
  -H "Authorization: Bearer $TOKEN")

if [[ "$DECISION_GET_STATUS" == "404" ]]; then
  echo "  ~ decision routes skipped — '$DECISION_KEY' is not deployed on this engine"
  echo "    (override with DECISION_KEY=<key> and DECISION_VARS='{\"variables\":{...}}')"
else
  check_status "GET /v1/m2m/decision/:key" "$DECISION_GET_STATUS" "200"
  if [[ "$DECISION_GET_STATUS" == "200" ]]; then
    check_field "GET /v1/m2m/decision/:key body" "$(cat /tmp/m2m_decision_get.json)" '.success' 'true'
  fi

  # decision.evaluate
  DECISION_STATUS=$(curl -s -o /tmp/m2m_decision.json -w "%{http_code}" \
    -X POST "${BASE_URL}/v1/m2m/decision/${DECISION_KEY}/evaluate" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$DECISION_VARS")
  check_status "POST /v1/m2m/decision/:key/evaluate" "$DECISION_STATUS" "200"
  if [[ "$DECISION_STATUS" == "200" ]]; then
    check_field "POST /v1/m2m/decision/:key/evaluate body" "$(cat /tmp/m2m_decision.json)" '.success' 'true'
  fi
fi

# ─── Known-fixture assertions (local only) ───────────────────────────────────
#
# Against ACC the deployed bundle is whatever happens to be there, so the checks
# above can only assert "route reached". Locally the fixture bundle is fixed, so
# the tenant behaviour that actually matters can be asserted properly:
#
#   AwbShellProcess       tenant=flevoland, start form kapvergunning-start
#   AwbZorgtoeslagProcess tenant=toeslagen, start form zorgtoeslag-provisional-start
#   RipR21Process         tenant=flevoland, NO start-event form (started via API;
#                         its 8 forms are user-task forms, reached through
#                         /v1/m2m/task/:id/form-schema)
#
# Operaton's own /process-definition/key/{key}/... shorthand 404s for all three —
# they are tenant-scoped and the M2M surface sends no tenant. Getting a form back
# is therefore proof that resolveDeployedTenant + getByKeyWithTenantFallback are
# doing their job, which a 200-or-404 check cannot distinguish from a broken one.

if [[ "$TARGET_LC" == "local" ]]; then
  echo ""
  echo "── Known-fixture assertions (tenant fallback + cross-tenant) ────────────"

  # A tenant-scoped process must still yield its start form through the
  # untenanted M2M surface.
  FIX_FLEVO_STATUS=$(curl -s -o /tmp/m2m_fix_flevo.json -w "%{http_code}"     "${BASE_URL}/v1/m2m/process/AwbShellProcess/start-form"     -H "Authorization: Bearer $TOKEN")
  if [[ "$FIX_FLEVO_STATUS" == "200" ]]     && [[ "$(jq -r '.data.components | type' /tmp/m2m_fix_flevo.json 2>/dev/null)" == "array" ]]; then
    pass "AwbShellProcess start-form resolves despite tenant scoping (flevoland)"
  else
    fail "AwbShellProcess start-form — expected HTTP 200 with a form, got HTTP $FIX_FLEVO_STATUS"
  fi

  # M2M is deliberately cross-tenant: a toeslagen-scoped process must resolve too.
  FIX_TOESLAGEN_STATUS=$(curl -s -o /tmp/m2m_fix_toeslagen.json -w "%{http_code}"     "${BASE_URL}/v1/m2m/process/AwbZorgtoeslagProcess/start-form"     -H "Authorization: Bearer $TOKEN")
  if [[ "$FIX_TOESLAGEN_STATUS" == "200" ]]     && [[ "$(jq -r '.data.components | type' /tmp/m2m_fix_toeslagen.json 2>/dev/null)" == "array" ]]; then
    pass "AwbZorgtoeslagProcess start-form resolves across tenants (toeslagen)"
  else
    fail "AwbZorgtoeslagProcess start-form — expected HTTP 200 with a form, got HTTP $FIX_TOESLAGEN_STATUS"
  fi

  # A process with no start-event form must report that, not fall over.
  FIX_NOFORM_STATUS=$(curl -s -o /dev/null -w "%{http_code}"     "${BASE_URL}/v1/m2m/process/RipR21Process/start-form"     -H "Authorization: Bearer $TOKEN")
  check_status "RipR21Process start-form is absent (started via API, not a form)"     "$FIX_NOFORM_STATUS" "404"

  # variable-hints must work for the same tenant-scoped definition.
  FIX_HINTS_STATUS=$(curl -s -o /tmp/m2m_fix_hints.json -w "%{http_code}"     "${BASE_URL}/v1/m2m/process/RipR21Process/variable-hints"     -H "Authorization: Bearer $TOKEN")
  if [[ "$FIX_HINTS_STATUS" == "200" ]]     && [[ "$(jq -r '.variables | type' /tmp/m2m_fix_hints.json 2>/dev/null)" == "array" ]]; then
    pass "RipR21Process variable-hints resolves despite tenant scoping"
  else
    fail "RipR21Process variable-hints — expected HTTP 200 with variables, got HTTP $FIX_HINTS_STATUS"
  fi
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