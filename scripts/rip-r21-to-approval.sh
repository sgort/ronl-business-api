#!/usr/bin/env bash
# rip-r21-to-approval.sh
# Drives a RipR21Process instance from a cold start to the phase-exit
# signature approval task (Task_AccorderenProjectplan4), stopping there
# without completing it — so a developer testing the ValidSign signing
# feature does not have to fill out twelve forms by hand every time.
#
# Starts the process through the BACKEND's own POST /v1/process/:key/start —
# the same route the board's "R2.1 starten" button uses — so the instance
# picks up municipality, businessKey and every other tenant-context variable
# exactly the way a real instance would (see addTenantToProcessVariables in
# packages/backend/src/middleware/tenant.middleware.ts). A previous version of
# this script POSTed straight to Operaton's tenant-scoped start endpoint; the
# resulting instance ran fine but carried no `municipality` variable, so
# operatonService.getUserTasks's `processVariables=municipality_eq_<tenant>`
# filter hid it from the board entirely. Don't go back to that — guessing at
# the variable list is what caused the bug.
#
# Starting through the backend means the backend needs a Keycloak token
# (password grant, same pattern as scripts/test-smoke-live.sh). Individual
# TASK completions still go straight to Operaton — that part already works
# and is fast, and there's no board-visibility concern once the instance
# itself is correctly tagged.
#
# It also requires the BACKEND to be live for a second reason: RipR21Process
# has one external task (Task_AanmakenWorkspaceRelatics, topic
# "rip-relatics-workspace") that only the backend's externalTaskWorker
# consumes. With the backend down, the run stalls forever fetch-locked on
# that topic — this script fails loudly before starting anything rather than
# let that happen silently.
#
# Usage:
#   bash scripts/rip-r21-to-approval.sh                      # start a fresh run
#   bash scripts/rip-r21-to-approval.sh --project-number 24999
#   bash scripts/rip-r21-to-approval.sh --clean <instanceId>  # delete a run
#
# Optional overrides (env vars):
#   OPERATON_URL        Operaton engine REST base (default: http://localhost:8081/engine-rest)
#   BACKEND_URL         Backend base — both the /v1/health/live pre-flight and
#                       the POST /v1/process/:key/start call go through this
#                       (default: http://localhost:3002)
#   KEYCLOAK_URL        Keycloak base, for the password-grant token fetch
#                       (default: http://localhost:8080)
#   KEYCLOAK_REALM      Realm to authenticate against (default: ronl)
#   START_USER_CLIENT_ID  Public client the password grant runs through
#                       (default: ronl-business-api — no client secret needed)
#   START_USER          Username to start the process as (default:
#                       test-infra-flevoland — seeded caseworker in tenant
#                       "flevoland" with the roles RipR21Process needs)
#   START_PASSWORD      Its password (default: test123 — this is the seeded
#                       REALM password from config/keycloak/ronl-realm.json,
#                       not a real credential; override for any other user)
#   PROJECT_NUMBER      Same as --project-number — makes repeated runs
#                       distinguishable in eDOCS. Default: MANUAL-<timestamp>.
#   TASK_POLL_TIMEOUT   Seconds to wait for the external Relatics task to
#                       hand back to a user task before giving up (default: 90)
#   TASK_POLL_INTERVAL  Seconds between polls while waiting (default: 3)
#
# What it does:
#   1. Pre-flight: Operaton reachable, backend live (fails loudly + explains
#      why if not — see header above).
#   2. Confirms RipR21Process is deployed and reports its version.
#   3. Fetches a Keycloak token for START_USER (password grant) and starts an
#      instance via POST ${BACKEND_URL}/v1/process/RipR21Process/start — this
#      script sends no businessKey, so the backend mints one
#      (tenantId-timestamp), and it stamps
#      municipality, organisationType, initiator, assuranceLevel and
#      applicantId onto the instance. Verifies municipality actually landed
#      on the instance afterwards and fails loudly if it did not — that is
#      the check that would have caught the board-invisibility bug.
#   4. Loops: fetch the instance's open task. If it exists and is not the
#      approval task, complete it with one generous variable bundle (see
#      below) via POST /task/{id}/complete — Operaton does not enforce form
#      validation on REST completion, so one bundle covers all eleven forms.
#      If no task exists, the engine is mid-flight on the external Relatics
#      task; poll with a bounded timeout. Capped at 11 completions (the
#      happy-path task count) — hitting the cap means something looped
#      (most likely a rework loop) rather than reaching the approval task.
#   5. Stops AT Task_AccorderenProjectplan4 without completing it, and prints
#      the instance id, business key, and task id/name, plus a reminder that
#      the task is unclaimed — the signer's identity comes from whoever
#      clicks "Taak claimen" in the board, so this script must not claim it.
#   6. `--clean <instanceId>` deletes the run's runtime instance AND its
#      history — the Faseladder's "Gereed"/"Klaar" counters read completed
#      history, so leaving history behind after a real signature would
#      quietly inflate those counters for whoever looks at them next.
#
# The variable bundle (sent on every task completion, harmless if a
# particular task's form does not use a given field):
#   - Gateway variables, or the process takes the wrong branch:
#     intakeAkkoord=ja (Gateway_IntakeAkkoord), approvalStatus=approved
#     (Gateway_Akkoord2 / Gateway_Akkoord4).
#   - Everything the rip-pdp document template binds (verified against
#     e2e-fixtures/flevoland/rip-pdp.document and a completed instance's
#     history variables): projectNumber, projectName, projectType,
#     department, contributorId, clientId, confirmedScope, confirmedBudget,
#     confirmedTimeline, riskFileReference, pdpNotes, assignedRoles.
#     department is a real value ("infrastructuur") — the eDOCS DM server
#     rejects document creation without one.
#
# Known limitation: this drives the HAPPY PATH only (ja / approved at both
# gateways it passes through). It does not exercise "Verbeteren kwaliteit"
# or a rejected Projectplan 2 — those deserve their own script if ever needed.

set -u

SCRIPT_NAME="$(basename "$0")"

OPERATON_URL="${OPERATON_URL:-http://localhost:8081/engine-rest}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3002}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-ronl}"
START_USER_CLIENT_ID="${START_USER_CLIENT_ID:-ronl-business-api}"
START_USER="${START_USER:-test-infra-flevoland}"
# Seeded REALM password from config/keycloak/ronl-realm.json (test-infra-flevoland),
# not a real credential. Override START_PASSWORD for any other user.
START_PASSWORD="${START_PASSWORD:-test123}"
PROJECT_NUMBER="${PROJECT_NUMBER:-MANUAL-$(date +%Y%m%d-%H%M%S)}"
TASK_POLL_TIMEOUT="${TASK_POLL_TIMEOUT:-90}"
TASK_POLL_INTERVAL="${TASK_POLL_INTERVAL:-3}"

PROCESS_KEY="RipR21Process"
APPROVAL_TASK_KEY="Task_AccorderenProjectplan4"
MAX_TASK_COMPLETIONS=11 # happy-path count: every user task except the approval task itself

CLEAN_INSTANCE_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clean)
      CLEAN_INSTANCE_ID="${2:-}"
      if [[ -z "$CLEAN_INSTANCE_ID" ]]; then
        echo "ERROR: --clean requires an instance id."
        exit 1
      fi
      shift 2
      ;;
    --project-number)
      PROJECT_NUMBER="${2:-}"
      shift 2
      ;;
    -h | --help)
      sed -n '2,102p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'. See --help."
      exit 1
      ;;
  esac
done

PASS=0
FAIL=0
ERRORS=()

pass() {
  echo "  ✓ $1"
  ((PASS++))
}
fail() {
  echo "  ✗ $1"
  ERRORS+=("$1")
  ((FAIL++))
}
section() {
  echo ""
  echo "── $1 ───────────────────────────────────────────────────────────"
}
fatal() {
  echo ""
  echo "  Results: $PASS passed, $FAIL failed"
  exit 1
}

# BPMN task names in this model carry literal newlines (`&#10;` in the
# source, e.g. "Aanleveren Projectplan\n1. Intake-formulier") — printed raw
# they break the line and scramble the progress output. Collapse ALL
# whitespace runs (newlines, carriage returns, tabs, repeated spaces) to a
# single space, and trim the ends, before a task name is ever printed.
collapse_ws() {
  tr -s '[:space:]' ' ' | sed -E 's/^ +//; s/ +$//'
}

# ─── Pre-flight ─────────────────────────────────────────────────────────────

section "Pre-flight"

ENGINE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${OPERATON_URL}/engine" 2>/dev/null)
if [[ "$ENGINE_CODE" != "200" ]]; then
  fail "Operaton engine not reachable at ${OPERATON_URL} (HTTP ${ENGINE_CODE:-000})"
  echo ""
  echo "  Is the Operaton container running? (docker compose up -d operaton),"
  echo "  or pass OPERATON_URL=<url> to point at a different engine."
  fatal
fi
pass "Operaton engine reachable (GET ${OPERATON_URL}/engine)"

BACKEND_LIVE_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/v1/health/live" 2>/dev/null)
if [[ "$BACKEND_LIVE_CODE" != "200" ]]; then
  fail "backend not live at ${BACKEND_URL} (HTTP ${BACKEND_LIVE_CODE:-000})"
  echo ""
  echo "  RipR21Process has one external (service) task,"
  echo "  Task_AanmakenWorkspaceRelatics on topic \"rip-relatics-workspace\","
  echo "  that ONLY the backend's externalTaskWorker consumes. With the"
  echo "  backend down, a started instance would reach that step and stall"
  echo "  there forever — no engine timeout, no error, just silence. Start"
  echo "  the backend (or pass BACKEND_URL=<url> at a running one) and retry."
  fatal
fi
pass "backend live (GET ${BACKEND_URL}/v1/health/live)"

# ─── Cleanup mode — deletes runtime + history, then exits ──────────────────

if [[ -n "$CLEAN_INSTANCE_ID" ]]; then
  section "Cleaning up instance ${CLEAN_INSTANCE_ID}"

  RUNTIME_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    "${OPERATON_URL}/process-instance/${CLEAN_INSTANCE_ID}?skipCustomListeners=true" 2>/dev/null)
  if [[ "$RUNTIME_CODE" == "204" ]]; then
    pass "runtime instance deleted (HTTP 204)"
  elif [[ "$RUNTIME_CODE" == "404" ]]; then
    # Already gone from runtime (e.g. it completed on its own) — the history
    # delete below is the one that actually matters in that case.
    pass "runtime instance already gone (HTTP 404) — proceeding to history"
  else
    fail "runtime delete failed (HTTP ${RUNTIME_CODE:-000})"
  fi

  # This is the delete that matters: the Faseladder's "Gereed"/"Klaar"
  # counters read completed HISTORY, so a runtime-only delete would still
  # leave a phantom completion inflating those counts for whoever looks next.
  HISTORY_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    "${OPERATON_URL}/history/process-instance/${CLEAN_INSTANCE_ID}" 2>/dev/null)
  if [[ "$HISTORY_CODE" == "204" ]]; then
    pass "history deleted (HTTP 204)"
  elif [[ "$HISTORY_CODE" == "404" ]]; then
    pass "no history record found (HTTP 404) — nothing to inflate any counter"
  else
    fail "history delete failed (HTTP ${HISTORY_CODE:-000})"
  fi

  echo ""
  echo "  Results: $PASS passed, $FAIL failed"
  [[ $FAIL -gt 0 ]] && exit 1
  exit 0
fi

# ─── Confirm RipR21Process is deployed ─────────────────────────────────────

section "Process definition"

DEF_JSON=$(curl -s "${OPERATON_URL}/process-definition?key=${PROCESS_KEY}&latestVersion=true" 2>/dev/null)
DEF_COUNT=$(echo "$DEF_JSON" | jq 'length' 2>/dev/null)
if [[ -z "$DEF_COUNT" || "$DEF_COUNT" == "0" || "$DEF_COUNT" == "null" ]]; then
  fail "${PROCESS_KEY} is not deployed on ${OPERATON_URL}"
  fatal
fi
DEF_VERSION=$(echo "$DEF_JSON" | jq -r '.[0].version')
DEF_TENANT=$(echo "$DEF_JSON" | jq -r '.[0].tenantId // empty')
if [[ -n "$DEF_TENANT" ]]; then
  pass "${PROCESS_KEY} deployed (version ${DEF_VERSION}, tenant=${DEF_TENANT})"
else
  pass "${PROCESS_KEY} deployed (version ${DEF_VERSION}, no tenant)"
fi

# ─── Fetch a Keycloak token for START_USER ─────────────────────────────────

section "Keycloak token"

TOKEN_RESPONSE=$(curl -s -X POST \
  "${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=password" \
  -d "client_id=${START_USER_CLIENT_ID}" \
  -d "username=${START_USER}" \
  -d "password=${START_PASSWORD}" 2>/dev/null)
ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty' 2>/dev/null)

if [[ -z "$ACCESS_TOKEN" ]]; then
  fail "could not obtain a Keycloak token for '${START_USER}' via client '${START_USER_CLIENT_ID}' at ${KEYCLOAK_URL}"
  echo ""
  echo "  $(echo "$TOKEN_RESPONSE" | jq -r '.error_description // .error // "no error detail returned"' 2>/dev/null)"
  echo ""
  echo "  Check Keycloak is reachable at ${KEYCLOAK_URL}, the realm is"
  echo "  '${KEYCLOAK_REALM}', the client '${START_USER_CLIENT_ID}' has direct"
  echo "  access grants enabled, and START_USER/START_PASSWORD are correct"
  echo "  (defaults: test-infra-flevoland / test123, the seeded realm password"
  echo "  from config/keycloak/ronl-realm.json)."
  fatal
fi
pass "token obtained for '${START_USER}' via '${START_USER_CLIENT_ID}'"

# ─── Start an instance through the BACKEND ─────────────────────────────────

section "Starting instance (via backend)"

# Goes through the backend's own POST /v1/process/:key/start — the same
# route the board's "R2.1 starten" button uses — instead of Operaton
# directly, so the instance gets municipality, businessKey and every other
# tenant-context variable exactly as a real instance would
# (addTenantToProcessVariables in tenant.middleware.ts sets these).
#
# This script sends no businessKey and lets the backend mint one, which is
# right for a standalone R2.1 run: there is no earlier phase to attach to.
#
# It did NOT used to be a choice. addTenantToProcessVariables overwrote any
# businessKey the caller sent, unconditionally, so sending one was pointless —
# and this comment used to say so. That changed with the RIP phase-progression
# work: a business key now identifies a project's whole journey across phases,
# the originating R2.1 run mints it and every later phase inherits it, so the
# middleware only mints when the caller supplies none. If you want an R2.1
# instance attached to an existing project, or to walk further than R2.1, use
# scripts/rip-phase-walkthrough.sh, which takes --business-key and enforces the
# same start precondition the board's Starten tab applies.
START_URL="${BACKEND_URL}/v1/process/${PROCESS_KEY}/start"
START_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST "$START_URL" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{}' 2>/dev/null)
START_CODE=$(echo "$START_RESPONSE" | tail -n1)
START_JSON=$(echo "$START_RESPONSE" | sed '$d')

if [[ "$START_CODE" != "200" && "$START_CODE" != "201" ]]; then
  fail "start failed (HTTP ${START_CODE:-000}) at ${START_URL}"
  echo "$START_JSON"
  fatal
fi

INSTANCE_ID=$(echo "$START_JSON" | jq -r '.data.processInstanceId // empty')
BUSINESS_KEY=$(echo "$START_JSON" | jq -r '.data.businessKey // empty')
if [[ -z "$INSTANCE_ID" ]]; then
  fail "start returned HTTP ${START_CODE} but no processInstanceId"
  echo "$START_JSON"
  fatal
fi
pass "instance started via backend (id=${INSTANCE_ID}, businessKey=${BUSINESS_KEY})"

# Verify municipality actually landed on the instance. This is the check
# that would have caught the original bug: an instance started directly
# against Operaton ran fine but carried no municipality variable, so it
# never appeared on the board (operatonService.getUserTasks filters on
# processVariables=municipality_eq_<tenant>).
MUNICIPALITY_RESPONSE=$(curl -s -w '\n%{http_code}' \
  "${OPERATON_URL}/process-instance/${INSTANCE_ID}/variables/municipality" 2>/dev/null)
MUNICIPALITY_CODE=$(echo "$MUNICIPALITY_RESPONSE" | tail -n1)
MUNICIPALITY_BODY=$(echo "$MUNICIPALITY_RESPONSE" | sed '$d')
MUNICIPALITY_VALUE=$(echo "$MUNICIPALITY_BODY" | jq -r '.value // empty' 2>/dev/null)

if [[ "$MUNICIPALITY_CODE" != "200" || -z "$MUNICIPALITY_VALUE" ]]; then
  fail "instance ${INSTANCE_ID} has no 'municipality' variable — it would be INVISIBLE on the board"
  echo ""
  echo "  GET ${OPERATON_URL}/process-instance/${INSTANCE_ID}/variables/municipality"
  echo "  returned HTTP ${MUNICIPALITY_CODE:-000}: ${MUNICIPALITY_BODY}"
  echo ""
  echo "  Instance ${INSTANCE_ID} (businessKey=${BUSINESS_KEY}) was left running"
  echo "  for inspection. Clean it up with:"
  echo "    bash ${SCRIPT_NAME} --clean ${INSTANCE_ID}"
  fatal
fi
pass "municipality=${MUNICIPALITY_VALUE} confirmed on the new instance"

# ─── The variable bundle ────────────────────────────────────────────────────
#
# Sent on EVERY task completion below, not just once — Operaton does not
# enforce form validation on REST completion, so one generous bundle covers
# all eleven forms; missing a variable is the failure mode that matters
# (an em-dash in the signed PDF, a wrong gateway branch), not an extra one.

RISK_FILE_REFERENCE="REL-MANUAL-${PROJECT_NUMBER}"
# Plain ASCII on purpose (no em-dash): passing a multi-byte UTF-8 character
# through `curl -d "$var"` on Git Bash for Windows was observed to corrupt the
# byte sequence en route and get the request rejected with HTTP 400
# InvalidRequestException — writing the same bytes from a file worked fine, so
# this is an argv-encoding quirk of that specific path, not a JSON issue.
PROJECT_NAME="ValidSign handmatige testrun - ${PROJECT_NUMBER}"

build_variables_json() {
  jq -n \
    --arg projectNumber "$PROJECT_NUMBER" \
    --arg projectName "$PROJECT_NAME" \
    --arg riskFileReference "$RISK_FILE_REFERENCE" \
    '{
      intakeAkkoord:      {value: "ja",            type: "String"},
      approvalStatus:     {value: "approved",      type: "String"},
      projectNumber:      {value: $projectNumber,  type: "String"},
      projectName:        {value: $projectName,    type: "String"},
      projectType:        {value: "wegaanleg",     type: "String"},
      department:         {value: "infrastructuur", type: "String"},
      contributorId:      {value: "Handmatige testrun bijdrager",     type: "String"},
      clientId:           {value: "Handmatige testrun opdrachtgever", type: "String"},
      confirmedScope:     {value: "Handmatige testrun t.b.v. ValidSign-ondertekening.", type: "String"},
      confirmedBudget:    {value: "100000",        type: "String"},
      confirmedTimeline:  {value: "10 weken",      type: "String"},
      riskFileReference:  {value: $riskFileReference, type: "String"},
      pdpNotes:           {value: "Gegenereerd door scripts/rip-r21-to-approval.sh - geen echt project.", type: "String"},
      assignedRoles:      {value: "Projectleider: Handmatige testrun", type: "String"}
    }'
}

VARIABLES_JSON="$(build_variables_json)"

# ─── Drive the process to the approval task ────────────────────────────────

section "Driving the process to ${APPROVAL_TASK_KEY}"

TASK_COMPLETIONS=0
APPROVAL_TASK_ID=""
APPROVAL_TASK_NAME=""
LAST_COMPLETED_NAME=""
REACHED_APPROVAL=false

while true; do
  TASKS_JSON=$(curl -s "${OPERATON_URL}/task?processInstanceId=${INSTANCE_ID}" 2>/dev/null)
  TASK_COUNT=$(echo "$TASKS_JSON" | jq 'length' 2>/dev/null)
  [[ -z "$TASK_COUNT" || "$TASK_COUNT" == "null" ]] && TASK_COUNT=0

  if [[ "$TASK_COUNT" == "0" ]]; then
    # No open user task — most likely the engine is mid-flight on the
    # external Relatics task (Task_AanmakenWorkspaceRelatics, topic
    # "rip-relatics-workspace"), waiting for the backend's worker to fetch,
    # lock and complete it. Poll with a bounded timeout rather than loop
    # forever on an engine that has genuinely stalled.
    WAITED=0
    FOUND=false
    while [[ "$WAITED" -lt "$TASK_POLL_TIMEOUT" ]]; do
      sleep "$TASK_POLL_INTERVAL"
      WAITED=$((WAITED + TASK_POLL_INTERVAL))
      TASKS_JSON=$(curl -s "${OPERATON_URL}/task?processInstanceId=${INSTANCE_ID}" 2>/dev/null)
      TASK_COUNT=$(echo "$TASKS_JSON" | jq 'length' 2>/dev/null)
      [[ -z "$TASK_COUNT" || "$TASK_COUNT" == "null" ]] && TASK_COUNT=0
      if [[ "$TASK_COUNT" != "0" ]]; then
        FOUND=true
        break
      fi
    done
    if [[ "$FOUND" != "true" ]]; then
      fail "no open task appeared within ${TASK_POLL_TIMEOUT}s"
      echo ""
      echo "  Most likely cause: the process is waiting on the external task"
      echo "  Task_AanmakenWorkspaceRelatics (topic \"rip-relatics-workspace\"),"
      echo "  and the backend's externalTaskWorker is not fetching/locking it —"
      echo "  even though the backend answered /v1/health/live earlier, its"
      echo "  worker poller could be stopped, crashed, or pointed at a"
      echo "  different engine. Check the backend logs for \"rip-relatics-workspace\"."
      echo ""
      echo "  Instance ${INSTANCE_ID} (businessKey=${BUSINESS_KEY}) was left running"
      echo "  for inspection. Clean it up with:"
      echo "    bash ${SCRIPT_NAME} --clean ${INSTANCE_ID}"
      fatal
    fi
    continue
  fi

  TASK_ID=$(echo "$TASKS_JSON" | jq -r '.[0].id')
  TASK_NAME=$(echo "$TASKS_JSON" | jq -r '.[0].name' | collapse_ws)
  TASK_DEF_KEY=$(echo "$TASKS_JSON" | jq -r '.[0].taskDefinitionKey')

  if [[ "$TASK_DEF_KEY" == "$APPROVAL_TASK_KEY" ]]; then
    APPROVAL_TASK_ID="$TASK_ID"
    APPROVAL_TASK_NAME="$TASK_NAME"
    REACHED_APPROVAL=true
    break
  fi

  if [[ "$TASK_COMPLETIONS" -ge "$MAX_TASK_COMPLETIONS" ]]; then
    fail "hit the ${MAX_TASK_COMPLETIONS}-completion cap without reaching ${APPROVAL_TASK_KEY}"
    echo ""
    echo "  Last task completed: \"${LAST_COMPLETED_NAME}\"."
    echo "  Current open task:   \"${TASK_NAME}\" (${TASK_DEF_KEY})."
    echo "  This almost always means a rework loop (e.g. \"Verbeteren"
    echo "  kwaliteit\") is being driven instead of the happy path — check"
    echo "  intakeAkkoord/approvalStatus reached the engine as expected."
    echo ""
    echo "  Instance ${INSTANCE_ID} (businessKey=${BUSINESS_KEY}) was left running"
    echo "  for inspection. Clean it up with:"
    echo "    bash ${SCRIPT_NAME} --clean ${INSTANCE_ID}"
    fatal
  fi

  COMPLETE_BODY=$(jq -n --argjson vars "$VARIABLES_JSON" '{variables: $vars}')
  COMPLETE_RESPONSE=$(curl -s -w '\n%{http_code}' -X POST \
    "${OPERATON_URL}/task/${TASK_ID}/complete" \
    -H 'Content-Type: application/json' -d "$COMPLETE_BODY" 2>/dev/null)
  COMPLETE_CODE=$(echo "$COMPLETE_RESPONSE" | tail -n1)
  COMPLETE_BODY_OUT=$(echo "$COMPLETE_RESPONSE" | sed '$d')

  if [[ "$COMPLETE_CODE" != "204" && "$COMPLETE_CODE" != "200" ]]; then
    fail "completing \"${TASK_NAME}\" failed (HTTP ${COMPLETE_CODE:-000})"
    echo "$COMPLETE_BODY_OUT"
    echo ""
    echo "  Instance ${INSTANCE_ID} (businessKey=${BUSINESS_KEY}) was left running"
    echo "  for inspection. Clean it up with:"
    echo "    bash ${SCRIPT_NAME} --clean ${INSTANCE_ID}"
    fatal
  fi

  TASK_COMPLETIONS=$((TASK_COMPLETIONS + 1))
  LAST_COMPLETED_NAME="$TASK_NAME"
  pass "[${TASK_COMPLETIONS}/${MAX_TASK_COMPLETIONS}] completed: ${TASK_NAME}"
done

# ─── Summary ──────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────────────────────────────"
if [[ "$REACHED_APPROVAL" == "true" ]]; then
  echo "  Reached the approval task — stopped here, nothing completed:"
  echo ""
  echo "    process instance id : ${INSTANCE_ID}"
  echo "    business key        : ${BUSINESS_KEY}"
  echo "    approval task id    : ${APPROVAL_TASK_ID}"
  echo "    approval task name  : $(echo "$APPROVAL_TASK_NAME" | collapse_ws)"
  echo ""
  echo "  This task is UNCLAIMED. Open it in the board and click \"Taak"
  echo "  claimen\" before testing ValidSign signing — the signer's identity"
  echo "  comes from whoever claims the task, not from this script."
  echo ""
  echo "  When done, remove this run with:"
  echo "    bash ${SCRIPT_NAME} --clean ${INSTANCE_ID}"
fi
echo "─────────────────────────────────────────────────────────────────────────"

echo ""
echo "  Results: $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "  Failures:"
  for e in "${ERRORS[@]}"; do echo "    - $e"; done
  exit 1
fi

exit 0
