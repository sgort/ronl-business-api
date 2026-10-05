#!/usr/bin/env bash
# test-m2m-routes.sh
# Validates the active M2M route operations against a running backend --
# the reads, decision.evaluate, and the four state-changing operations
# (start, claim, complete, delete) added in #214.
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
#   LIFECYCLE_KEY             overrides the per-TARGET key the write lifecycle
#                             starts, claims, completes and cancels. It must
#                             raise a user task ON ITS OWN INSTANCE -- a process
#                             whose task lands on a called sub-process will make
#                             the block skip claim and complete. The lifecycle
#                             starts two instances of its own and removes both;
#                             it never writes to an instance it did not create.

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
    # Raises its own user task. AwbZorgtoeslagProcess does not -- its task lands
    # on a CALLED sub-process with a different instance id, which the lifecycle
    # block would not find.
    DEFAULT_LIFECYCLE_KEY="ZorgtoeslagProvisionalSubProcessE2E"
    ;;
  acc)
    DEFAULT_BASE_URL="https://acc.api.open-regels.nl"
    DEFAULT_KEYCLOAK_URL="https://acc.keycloak.open-regels.nl"
    # ACC's M2M surface uses ACC's main engine (#262). Both keys below are
    # deployed there, and on operaton-doc, which it used before. AwbCompletenessCheck:
    # one input, and a catch-all rule under FIRST hit policy, so any value
    # evaluates cleanly rather than erroring.
    DEFAULT_DECISION_KEY="AwbCompletenessCheck"
    DEFAULT_DECISION_VARS='{"variables": {"productType": "TreeFellingPermit"}}'
    # The deployed bundle carries the non-E2E spelling.
    DEFAULT_LIFECYCLE_KEY="ZorgtoeslagProvisionalSubProcess"
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
LIFECYCLE_KEY="${LIFECYCLE_KEY:-$DEFAULT_LIFECYCLE_KEY}"

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
SUB=$(echo "$JWT_PAYLOAD" | jq -r '.sub // empty')

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

# process.history. POST since #263; asserted to FILTER, not merely to answer:
# a dropped filter returns the whole history with a 200, which is exactly the
# failure the GET spelling had.
PROC_HIST_STATUS=$(curl -s -o /tmp/m2m_proc_hist.json -w "%{http_code}" \
  -X POST "${BASE_URL}/v1/m2m/process/history" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{}')
check_status "POST /v1/m2m/process/history" "$PROC_HIST_STATUS" "200"

if [[ "$PROC_HIST_STATUS" == "200" ]]; then
  HIST_ALL=$(jq '.data | length' /tmp/m2m_proc_hist.json)
  HIST_KEY=$(jq -r '.data[0].processDefinitionKey // empty' /tmp/m2m_proc_hist.json)
  if [[ -z "$HIST_KEY" ]]; then
    echo "  ~ history filter check skipped — the engine has no history yet"
  else
    HIST_FILTERED=$(curl -s -X POST "${BASE_URL}/v1/m2m/process/history" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"processDefinitionKey\":\"${HIST_KEY}\"}")
    HIST_N=$(echo "$HIST_FILTERED" | jq '.data | length')
    HIST_OTHER=$(echo "$HIST_FILTERED" | jq --arg k "$HIST_KEY" '[.data[] | select(.processDefinitionKey != $k)] | length')
    [[ "$HIST_N" -ge 1 && "$HIST_OTHER" == "0" ]] \
      && pass "POST /v1/m2m/process/history filters ($HIST_N of $HIST_ALL are $HIST_KEY)" \
      || fail "POST /v1/m2m/process/history filter ignored ($HIST_N returned, $HIST_OTHER not $HIST_KEY)"
  fi
fi

# The GET spelling answered, deprecated, for one release (v2026.10.0) and is
# removed (#312 item 5). Against a backend that predates the removal this fails,
# which is the point: it says which build you are talking to.
HIST_GET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/v1/m2m/process/history" \
  -H "Authorization: Bearer $TOKEN")
check_status "GET /v1/m2m/process/history (removed)" "$HIST_GET_STATUS" "404"

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

# ─── Write lifecycle: start → claim → complete → delete ──────────────────────
#
# The four state-changing operations. Until #214 this script covered the reads
# and decision.evaluate only, so these four were the operations no test ever
# called — and documenting them turned up three response shapes that diverge
# from their /v1 twins (`{taskId, claimed}` not `{taskId, assignee}`,
# `{taskId, completed}` not `{taskId, status}`, and 200 on start where /v1
# answers 201). Nothing would have caught a change to any of them.
#
# SELF-CLEANING BY CONSTRUCTION. Two instances are started and both are gone by
# the end: one is driven to completion through its task, the other cancelled.
# They are the ONLY instances touched. Nothing pre-existing is ever claimed,
# completed or deleted — the M2M surface applies no tenant filter, so a stray
# write here would land on a real case. The cleanup at the bottom of the block
# runs whatever happened above it.
#
# LIFECYCLE_KEY has to name a process that raises a user task promptly, or claim
# and complete have nothing to act on. Both TARGETs default to the same key
# because both talk to the same M2M engine (OPERATON_M2M_BASE_URL); override it
# when that stops being true.

echo ""
echo "── Write lifecycle: start → claim → complete → delete ──────────────────"

BK_PREFIX="m2m-routes-test-$$"

m2m_delete() {
  # Cancel an instance, ignoring the outcome. Used by the cleanup path, where a
  # 500 just means the instance had already ended.
  curl -s -o /dev/null -X DELETE "${BASE_URL}/v1/m2m/process/$1" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reason":"test-m2m-routes.sh cleanup"}'
}

m2m_task_of() {
  # The first open task on a given instance, or empty.
  curl -s "${BASE_URL}/v1/m2m/task" -H "Authorization: Bearer $TOKEN" \
    | jq -r --arg pid "$1" '[.data[] | select(.processInstanceId == $pid)][0].id // empty'
}

# process.start, with PLAIN variables.
START_A_STATUS=$(curl -s -o /tmp/m2m_start_a.json -w "%{http_code}" \
  -X POST "${BASE_URL}/v1/m2m/process/${LIFECYCLE_KEY}/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"businessKey\":\"${BK_PREFIX}-a\",\"variables\":{\"probeLabel\":\"plain\",\"probeCount\":7,\"probeFlag\":true}}")

if [[ "$START_A_STATUS" == "404" || "$START_A_STATUS" == "500" ]]; then
  echo "  ~ write lifecycle skipped — '$LIFECYCLE_KEY' could not be started (HTTP $START_A_STATUS)"
  echo "    (override with LIFECYCLE_KEY=<key> naming a process with a user task)"
else
  # 200, NOT the 201 that POST /v1/process/:key/start answers. Asserted exactly,
  # because the difference is the kind of thing a well-meaning tidy-up removes.
  check_status "POST /v1/m2m/process/:key/start (200, not /v1's 201)" "$START_A_STATUS" "200"
  PROC_A=$(jq -r '.data.processInstanceId // empty' /tmp/m2m_start_a.json)
  BK_A=$(jq -r '.data.businessKey // empty' /tmp/m2m_start_a.json)

  # The M2M surface keeps a caller's businessKey verbatim. /v1 prefixes a minted
  # one with the owning organisation (#234); there is no organisation here to
  # prefix with.
  [[ "$BK_A" == "${BK_PREFIX}-a" ]] \
    && pass "POST /v1/m2m/process/:key/start keeps businessKey verbatim" \
    || fail "POST /v1/m2m/process/:key/start — businessKey mangled (expected ${BK_PREFIX}-a, got $BK_A)"

  # WHICH ORGANISATION GETS THE CASE. An M2M start is labelled with the PROCESS
  # DEFINITION'S own deployed tenant, not with a constant -- so a case started
  # here normally belongs to a real organisation and is visible to its staff
  # through /v1. The literal `m2m` is only the fallback for a definition
  # carrying no tenant at all.
  #
  # Asserted against the INSTANCE'S OWN tenantId rather than a hard-coded value,
  # which is exactly the invariant operaton.service.ts says the labelling exists
  # for: "so the municipality variable -- the only tenant label access checks
  # read -- agrees with the tenantId Operaton gives its tasks". So this holds for
  # any LIFECYCLE_KEY, tenanted or not.
  #
  # It replaced an assertion that the label is always `m2m`, which passed only
  # because the engine it was first written against had no tenanted definitions.
  if [[ -n "$PROC_A" ]]; then
    curl -s -o /tmp/m2m_vars_a.json "${BASE_URL}/v1/m2m/process/${PROC_A}/variables" \
      -H "Authorization: Bearer $TOKEN"
    MUNI_A=$(jq -r '.data.municipality // "absent"' /tmp/m2m_vars_a.json)
    TENANT_A=$(curl -s "${BASE_URL}/v1/m2m/process" -H "Authorization: Bearer $TOKEN" \
      | jq -r --arg pid "$PROC_A" '([.data[] | select(.id == $pid)][0].tenantId) // "m2m"')

    if [[ "$MUNI_A" == "$TENANT_A" ]]; then
      pass "municipality agrees with the instance's own tenantId ($MUNI_A)"
    else
      fail "municipality — expected $TENANT_A (the instance's tenantId), got $MUNI_A"
    fi

    ORIGIN_A=$(jq -r '.data.originTenantId // "absent"' /tmp/m2m_vars_a.json)
    [[ "$ORIGIN_A" == "absent" ]] \
      && pass "started instance carries no originTenantId (unlike a /v1 start)" \
      || fail "started instance originTenantId — expected absent, got $ORIGIN_A"
  fi

  # A second instance, started with WRAPPED variables. Both forms are accepted
  # here (toOperatonVariables passes a {value,type} through and wraps anything
  # else); /v1 wraps unconditionally, so the wrapped form double-wraps there.
  START_B_STATUS=$(curl -s -o /tmp/m2m_start_b.json -w "%{http_code}" \
    -X POST "${BASE_URL}/v1/m2m/process/${LIFECYCLE_KEY}/start" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"businessKey\":\"${BK_PREFIX}-b\",\"variables\":{\"probeLabel\":{\"value\":\"wrapped\",\"type\":\"String\"},\"probeCount\":{\"value\":7,\"type\":\"Integer\"}}}")
  check_status "POST /v1/m2m/process/:key/start accepts WRAPPED variables too" "$START_B_STATUS" "200"
  PROC_B=$(jq -r '.data.processInstanceId // empty' /tmp/m2m_start_b.json)

  if [[ "$START_B_STATUS" == "200" && -n "$PROC_B" ]]; then
    WRAPPED_LANDED=$(curl -s "${BASE_URL}/v1/m2m/process/${PROC_B}/variables" \
      -H "Authorization: Bearer $TOKEN" | jq -r '.data.probeLabel // "absent"')
    [[ "$WRAPPED_LANDED" == "wrapped" ]] \
      && pass "wrapped variables land unwrapped, same as plain ones" \
      || fail "wrapped variables double-wrapped (probeLabel read back as: $WRAPPED_LANDED)"
  fi

  # A caller may not choose the organisation at start (#261). If the guard ever
  # fails, the stray instance is cancelled at once rather than left behind.
  RESERVED_START_STATUS=$(curl -s -o /tmp/m2m_reserved_start.json -w "%{http_code}" \
    -X POST "${BASE_URL}/v1/m2m/process/${LIFECYCLE_KEY}/start" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"businessKey\":\"${BK_PREFIX}-reserved\",\"variables\":{\"municipality\":\"m2m-routes-test-hijack\"}}")
  check_status "POST /v1/m2m/process/:key/start refuses municipality" "$RESERVED_START_STATUS" "400"
  check_field "start refusal body" "$(cat /tmp/m2m_reserved_start.json)" '.code' 'RESERVED_VARIABLE'
  STRAY=$(jq -r '.data.processInstanceId // empty' /tmp/m2m_reserved_start.json 2>/dev/null)
  [[ -n "$STRAY" ]] && m2m_delete "$STRAY"

  # task.claim, task.complete — on instance A's task.
  TASK_A=""
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    TASK_A=$(m2m_task_of "$PROC_A")
    [[ -n "$TASK_A" ]] && break
    sleep 1
  done

  if [[ -z "$TASK_A" ]]; then
    echo "  ~ claim/complete skipped — '$LIFECYCLE_KEY' raised no user task within 10s"
  else
    # No body: the assignee falls back to the token's subject.
    CLAIM_A_STATUS=$(curl -s -o /tmp/m2m_claim_a.json -w "%{http_code}" \
      -X POST "${BASE_URL}/v1/m2m/task/${TASK_A}/claim" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" -d '{}')
    check_status "POST /v1/m2m/task/:id/claim" "$CLAIM_A_STATUS" "200"
    check_field "POST /v1/m2m/task/:id/claim body" "$(cat /tmp/m2m_claim_a.json)" '.data.claimed' 'true'

    ASSIGNEE_A=$(curl -s "${BASE_URL}/v1/m2m/task/${TASK_A}" \
      -H "Authorization: Bearer $TOKEN" | jq -r '.data.assignee // "null"')
    [[ "$ASSIGNEE_A" == "$SUB" ]] \
      && pass "claim with no body assigns the token subject" \
      || fail "claim with no body — expected assignee $SUB, got $ASSIGNEE_A"

    # Claiming again FOR THE SAME USER is idempotent -- Operaton accepts it and
    # the assignee does not move.
    RECLAIM_SAME_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${BASE_URL}/v1/m2m/task/${TASK_A}/claim" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" -d '{}')
    check_status "re-claiming for the same user is idempotent" "$RECLAIM_SAME_STATUS" "200"

    # Claiming it for a DIFFERENT user while it is held is refused, and the route
    # reports the engine's refusal as a 500 rather than a 409.
    RECLAIM_OTHER_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${BASE_URL}/v1/m2m/task/${TASK_A}/claim" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" -d '{"userId":"m2m-routes-test-usurper"}')
    check_status "claiming a held task for another user is refused" "$RECLAIM_OTHER_STATUS" "500"

    STILL_ASSIGNEE=$(curl -s "${BASE_URL}/v1/m2m/task/${TASK_A}" \
      -H "Authorization: Bearer $TOKEN" | jq -r '.data.assignee // "null"')
    [[ "$STILL_ASSIGNEE" == "$SUB" ]] \
      && pass "a refused claim leaves the assignee where it was" \
      || fail "a refused claim moved the assignee to $STILL_ASSIGNEE"

    # task.complete refuses an access label, as /v1/task/:id/complete does
    # (#261). Refused before the engine is called, so the task stays open for
    # the real completion below.
    RESERVED_COMPLETE_STATUS=$(curl -s -o /tmp/m2m_reserved_complete.json -w "%{http_code}" \
      -X POST "${BASE_URL}/v1/m2m/task/${TASK_A}/complete" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"variables":{"municipality":"m2m-routes-test-hijack","probeCompleted":true}}')
    check_status "POST /v1/m2m/task/:id/complete refuses municipality" "$RESERVED_COMPLETE_STATUS" "400"
    check_field "complete refusal body" "$(cat /tmp/m2m_reserved_complete.json)" '.code' 'RESERVED_VARIABLE'
    [[ -n "$(m2m_task_of "$PROC_A")" ]] \
      && pass "a refused completion leaves the task open" \
      || fail "a refused completion closed the task"

    COMPLETE_A_STATUS=$(curl -s -o /tmp/m2m_complete_a.json -w "%{http_code}" \
      -X POST "${BASE_URL}/v1/m2m/task/${TASK_A}/complete" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"variables":{"probeCompleted":true}}')
    check_status "POST /v1/m2m/task/:id/complete" "$COMPLETE_A_STATUS" "200"
    check_field "POST /v1/m2m/task/:id/complete body" "$(cat /tmp/m2m_complete_a.json)" '.data.completed' 'true'

    # Completing it twice is refused the same way a re-claim is.
    RECOMPLETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${BASE_URL}/v1/m2m/task/${TASK_A}/complete" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" -d '{"variables":{}}')
    check_status "completing a completed task is refused" "$RECOMPLETE_STATUS" "500"

    # The claim body's optional userId overrides the token subject. Asserted on
    # instance B's task, because A's is claimed by now.
    TASK_B=$(m2m_task_of "$PROC_B")
    if [[ -n "$TASK_B" ]]; then
      CLAIM_B_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${BASE_URL}/v1/m2m/task/${TASK_B}/claim" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" -d '{"userId":"m2m-routes-test-operator"}')
      ASSIGNEE_B=$(curl -s "${BASE_URL}/v1/m2m/task/${TASK_B}" \
        -H "Authorization: Bearer $TOKEN" | jq -r '.data.assignee // "null"')
      if [[ "$CLAIM_B_STATUS" == "200" && "$ASSIGNEE_B" == "m2m-routes-test-operator" ]]; then
        pass "claim body's userId overrides the token subject"
      else
        fail "claim userId override — HTTP $CLAIM_B_STATUS, assignee=$ASSIGNEE_B"
      fi
    fi
  fi

  # process.delete, on instance B — still running, so the 200 path is reachable.
  if [[ -n "$PROC_B" ]]; then
    DELETE_B_STATUS=$(curl -s -o /tmp/m2m_delete_b.json -w "%{http_code}" \
      -X DELETE "${BASE_URL}/v1/m2m/process/${PROC_B}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"reason":"test-m2m-routes.sh lifecycle check"}')
    check_status "DELETE /v1/m2m/process/:id" "$DELETE_B_STATUS" "200"
    check_field "DELETE /v1/m2m/process/:id body" "$(cat /tmp/m2m_delete_b.json)" \
      '.data.processInstanceId' "$PROC_B"

    # Cancelling an instance that is already gone reports 500, not 404.
    REDELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X DELETE "${BASE_URL}/v1/m2m/process/${PROC_B}" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" -d '{}')
    check_status "cancelling an already-cancelled instance is refused" "$REDELETE_STATUS" "500"
  fi

  # ── Cleanup ────────────────────────────────────────────────────────────────
  # Runs whatever happened above. A 500 here means the instance had already
  # ended, which is the expected outcome for A once its task completed.
  [[ -n "$PROC_A" ]] && m2m_delete "$PROC_A"
  [[ -n "$PROC_B" ]] && m2m_delete "$PROC_B"

  LEFTOVER=$(curl -s "${BASE_URL}/v1/m2m/process" -H "Authorization: Bearer $TOKEN" \
    | jq -r --arg bk "$BK_PREFIX" '[.data[] | select(.businessKey != null and (.businessKey | startswith($bk)))] | length')
  [[ "$LEFTOVER" == "0" ]] \
    && pass "lifecycle left no running instances behind" \
    || fail "lifecycle left $LEFTOVER instance(s) running with businessKey ${BK_PREFIX}-*"
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

TENANT_CODE=$(jq -r '.code // empty' /tmp/m2m_tenant.json)

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
rm -f /tmp/m2m_task_list.json /tmp/m2m_task_get.json /tmp/m2m_decision.json \
  /tmp/m2m_disabled.json /tmp/m2m_tenant.json \
  /tmp/m2m_start_a.json /tmp/m2m_start_b.json /tmp/m2m_claim_a.json \
  /tmp/m2m_complete_a.json /tmp/m2m_delete_b.json /tmp/m2m_vars_a.json \
  /tmp/m2m_reserved_start.json /tmp/m2m_reserved_complete.json
exit 0