#!/usr/bin/env bash
# rip-phase-walkthrough.sh
# Drives any deployed RIP phase through its user tasks, stopping before the
# task(s) that would end the phase — so a complete walkthrough of the ladder
# can be set up in seconds instead of filling in dozens of forms by hand.
#
# ONE script rather than one per phase, deliberately. What actually varies
# between R2.1 and R4.1 is three lines of configuration: the process key, which
# task ends the phase, and how many completions to allow before assuming a
# rework loop is being driven. Everything else — the Keycloak token, starting
# through the backend so the tenant context lands, the completion loop, the
# rework-loop cap, cleanup — is identical, and seven copies of it would drift
# apart by the third phase. `--list` prints the table.
#
# Usage:
#   bash scripts/rip-phase-walkthrough.sh R2.3              # drive to the last task
#   bash scripts/rip-phase-walkthrough.sh R2.3 --complete   # finish the phase too
#   bash scripts/rip-phase-walkthrough.sh --chain           # R2.1 -> R4.1, one project
#   bash scripts/rip-phase-walkthrough.sh R2.3 --business-key flevoland-1788…
#   bash scripts/rip-phase-walkthrough.sh R2.3 --force      # skip the precondition
#   bash scripts/rip-phase-walkthrough.sh --clean <instanceId>
#   bash scripts/rip-phase-walkthrough.sh --list
#
# A phase will not start unless its PREDECESSOR HAS COMPLETED for that project,
# which is the same rule the board's Starten tab enforces: it offers only
# projects whose previous-phase instance finished and which have not already
# started this phase. Without that check the script could set up states the UI
# can never produce — a project in R3.1 that never did R2.4 — and then a
# walkthrough "passes" against a board that would have refused the start.
#
# With no --business-key the script looks the candidates up itself, exactly as
# the board does: completed instances of the previous phase, minus those whose
# businessKey already has an instance of this one. One candidate is used
# automatically; several are listed for you to pick with --business-key.
# --force starts an unattached instance for isolated testing of a single phase.
#
# --chain is the reason this exists. It starts R2.1, completes it, then starts
# each following phase CARRYING THE SAME businessKey, so the board sees one
# project walking the ladder rather than seven unrelated instances. That
# inheritance is what the Faseladder's "Starten" tab keys on; without it every
# phase looks like a new project.
#
# Optional overrides (env vars):
#   OPERATON_URL   engine REST base       (default http://localhost:8081/engine-rest)
#   BACKEND_URL    backend base           (default http://localhost:3002)
#   KEYCLOAK_URL   Keycloak base          (default http://localhost:8080)
#   KEYCLOAK_REALM realm                  (default ronl)
#   START_USER / START_PASSWORD / START_USER_CLIENT_ID
#
# Related: scripts/rip-r21-to-approval.sh stops specifically at R2.1's
# ValidSign signature task and waits on the external Relatics task; keep using
# that one for signing work. This script is the generic ladder driver.

set -uo pipefail

SCRIPT_NAME="scripts/$(basename "${BASH_SOURCE[0]}")"

OPERATON_URL="${OPERATON_URL:-http://localhost:8081/engine-rest}"
BACKEND_URL="${BACKEND_URL:-http://localhost:3002}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-ronl}"
START_USER="${START_USER:-test-infra-flevoland}"
START_PASSWORD="${START_PASSWORD:-test123}"
START_USER_CLIENT_ID="${START_USER_CLIENT_ID:-ronl-business-api}"

TASK_POLL_INTERVAL=2
TASK_POLL_TIMEOUT=60

# ── Phase table ───────────────────────────────────────────────────────────────
#
# STOP_KEYS is every user task that leads to an end event, read off the deployed
# BPMN rather than guessed from naming — several phases run parallel branches
# and so end in more than one place. The driver completes everything EXCEPT
# these, which is what "up until the last task to be done" means when a phase
# does not end in a single approval.
#
# MAX is a rework-loop guard, not a task count: hitting it means an Akkoord
# variable did not reach the engine and a review loop is being driven forever.

phase_config() { # $1 = phase code -> sets PROCESS_KEY STOP_KEYS MAX PHASE_NOTE
  case "$1" in
    R2.1)
      PROCESS_KEY=RipR21Process
      STOP_KEYS="Task_AccorderenProjectplan4"
      MAX=30
      PHASE_NOTE="has an external task (topic rip-relatics-workspace) — the backend worker must be running"
      ;;
    R2.2)
      PROCESS_KEY=RipR22Process
      STOP_KEYS="Task_OpstellenDefinitiefVO Task_TerugkoppelenKlanteisen"
      MAX=30
      PHASE_NOTE="no gateways at all; two parallel branches end separately"
      ;;
    R2.3)
      PROCESS_KEY=RipR23Process
      STOP_KEYS="Task_AccorderenProjectplan Task_BepalenInkoopstrategie Task_UpdatenProjectplanning Task_AnalyserenVerbeterpunten"
      MAX=40
      PHASE_NOTE="four parallel branches after the raming; four end events"
      ;;
    R2.4)
      PROCESS_KEY=RipR24Process
      STOP_KEYS="Task_AccorderenProjectplanDO"
      MAX=50
      PHASE_NOTE="first phase with a rework loop (PKT re-check on the DO)"
      ;;
    R3.1)
      PROCESS_KEY=RipR31Process
      STOP_KEYS="Task_ToetsenBestek Task_ToetsenAanpassingenBestek Task_ToetsenInschrijfleidraad Task_ToetsenAanpassingenInschrijfleidraad"
      MAX=50
      PHASE_NOTE="three parallel review streams, each with its own rework loop"
      ;;
    R3.2)
      PROCESS_KEY=RipR32Process
      STOP_KEYS="Task_AccorderenProjectplanContractvorming"
      MAX=50
      PHASE_NOTE=""
      ;;
    R4.1)
      PROCESS_KEY=RipR41Process
      STOP_KEYS="Task_AfrondenInkoopprocedure"
      MAX=50
      PHASE_NOTE="Task_AfwijzenInschrijving is the reject branch and is not reached on the happy path"
      ;;
    R5.1)
      PROCESS_KEY=RipR51Process
      STOP_KEYS="Task_HoudenOverlegVgCoordinator"
      MAX=50
      PHASE_NOTE=""
      ;;
    R5.2)
      PROCESS_KEY=RipR52Process
      STOP_KEYS="Task_AccorderenFactuur Task_InvullenWebformulierAtb Task_PlaatsenBriefInVisi Task_VersturenOverzichtAwrDv"
      MAX=90
      PHASE_NOTE="a PERIOD, not a deliverable: a weekly cycle runs alongside invoicing and delivery, so several tasks are open at once and task definitions recur. werkGereed=ja is what exits the cycle"
      ;;
    R5.4)
      PROCESS_KEY=RipR54Process
      STOP_KEYS="Task_GereedmeldenVisi"
      MAX=60
      PHASE_NOTE="its predecessor is R5.2 — R5.3 is handled outside this tool"
      ;;
    R6.1)
      PROCESS_KEY=RipR61Process
      STOP_KEYS="Task_LatenAanpassenRechtenRelatics Task_LatenSluitenProjectmap Task_VerwerkenFinancieleEindstand"
      MAX=60
      PHASE_NOTE="three parallel close-out streams (A financieel, B overdracht, C evaluatie)"
      ;;
    *)
      return 1
      ;;
  esac
  return 0
}

# R5.3 is deliberately absent: it is `beyond`, so predecessor_of skips over
# it and R5.4 follows R5.2, matching previousModelledPhase in the frontend.
LADDER="R2.1 R2.2 R2.3 R2.4 R3.1 R3.2 R4.1 R5.1 R5.2 R5.4 R6.1"

# Tenant whose instances count as candidates. The board scopes readiness to the
# caseworker's municipality; mirroring that keeps the script honest on a
# multi-tenant engine.
TENANT="${TENANT:-flevoland}"

# The phase a project must have FINISHED before it can start $1 — skipping any
# phase with no process model, the same rule previousModelledPhase applies in
# the frontend catalogue. R5.3 is the one that matters: it is a real step with
# no BPMN and no observable exit, so R5.4 follows R5.2.
predecessor_of() {
  local target="$1" prev=""
  for p in $LADDER; do
    [[ "$p" == "$target" ]] && { echo "$prev"; return 0; }
    prev="$p"
  done
  echo ""
}

# ── Output helpers ────────────────────────────────────────────────────────────
pass() { echo "  OK    $*"; }
fail() { echo "  FAIL  $*" >&2; }
# No cut -c here: the rule is multibyte, and truncating it mid-character
# produces mojibake in the one place a reader looks first.
section() { echo ""; echo "── $* ────────────────────────────────────"; }
fatal() { echo "" >&2; echo "Aborted." >&2; exit 1; }
collapse_ws() { tr '\n' ' ' | sed 's/  */ /g; s/^ //; s/ $//'; }

# ── Arguments ─────────────────────────────────────────────────────────────────
PHASE=""
CHAIN=false
COMPLETE=false
FORCE=false
CLEAN_INSTANCE_ID=""
BUSINESS_KEY_IN=""
PROJECT_NUMBER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --chain) CHAIN=true; shift ;;
    --complete) COMPLETE=true; shift ;;
    --force) FORCE=true; shift ;;
    --clean) CLEAN_INSTANCE_ID="${2:-}"; shift 2 ;;
    --business-key) BUSINESS_KEY_IN="${2:-}"; shift 2 ;;
    --project-number) PROJECT_NUMBER="${2:-}"; shift 2 ;;
    --list)
      printf '%-6s %-16s %-4s %s\n' PHASE PROCESS MAX 'ENDS AT'
      for p in $LADDER; do
        phase_config "$p"
        printf '%-6s %-16s %-4s %s\n' "$p" "$PROCESS_KEY" "$MAX" "$STOP_KEYS"
      done
      exit 0 ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    R[0-9].[0-9]) PHASE="$1"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -n "$PHASE" ]] && ! phase_config "$PHASE"; then
  echo "Unknown phase '$PHASE'. Known phases:" >&2
  for p in $LADDER; do echo "  $p" >&2; done
  exit 2
fi

for bin in curl jq python; do
  command -v "$bin" >/dev/null 2>&1 || { echo "$bin is required." >&2; exit 1; }
done

# ── Cleanup mode ──────────────────────────────────────────────────────────────
if [[ -n "$CLEAN_INSTANCE_ID" ]]; then
  section "Cleaning up ${CLEAN_INSTANCE_ID}"
  for u in "process-instance/${CLEAN_INSTANCE_ID}?skipCustomListeners=true&skipIoMappings=true" \
           "history/process-instance/${CLEAN_INSTANCE_ID}"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "${OPERATON_URL}/${u}")
    case "$code" in
      200|204) pass "deleted ${u%%\?*}" ;;
      404)     pass "already gone: ${u%%\?*}" ;;
      *)       fail "${u%%\?*} -> HTTP ${code}" ;;
    esac
  done
  exit 0
fi

if [[ "$CHAIN" == "false" && -z "$PHASE" ]]; then
  echo "Give a phase (e.g. R2.3), or --chain to walk the whole ladder." >&2
  echo "See $SCRIPT_NAME --list" >&2
  exit 2
fi

# ── Pre-flight ────────────────────────────────────────────────────────────────
section "Pre-flight"

code=$(curl -s -o /dev/null -w '%{http_code}' "${OPERATON_URL}/engine")
[[ "$code" == "200" ]] || { fail "Operaton not reachable at ${OPERATON_URL} (HTTP ${code:-000})"; fatal; }
pass "Operaton reachable"

code=$(curl -s -o /dev/null -w '%{http_code}' "${BACKEND_URL}/v1/health/live")
if [[ "$code" != "200" ]]; then
  fail "backend not live at ${BACKEND_URL} (HTTP ${code:-000})"
  echo ""
  echo "  Instances are started THROUGH the backend so they pick up"
  echo "  municipality, businessKey and the rest of the tenant context"
  echo "  (addTenantToProcessVariables). Started straight against Operaton"
  echo "  they run fine but never appear on the board."
  fatal
fi
pass "backend live"

TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d grant_type=password -d "client_id=${START_USER_CLIENT_ID}" \
  -d "username=${START_USER}" -d "password=${START_PASSWORD}" | jq -r '.access_token // empty')
[[ -n "$TOKEN" ]] || { fail "no Keycloak token for '${START_USER}' at ${KEYCLOAK_URL}"; fatal; }
pass "token obtained for '${START_USER}'"

# ── The variable bundle ───────────────────────────────────────────────────────
#
# Sent on EVERY completion, for every phase. Operaton does not enforce form
# validation on REST completion, so one generous bundle covers every form in
# the ladder; a missing variable is the failure that matters (a wrong gateway
# branch, an em-dash in a generated document), an extra one is inert.
#
# The Akkoord/dekkings values below are the happy path, read off each deployed
# BPMN's conditionExpressions. Several are genuine ROUTE CHOICES rather than
# approve/reject -- mbviMoment, projectkredietDekking, technischeInstallaties,
# notaWaarde, kredietAanneemsom -- where both branches are legitimate and the
# value here is simply the shorter path.
#
# werkGereed is the one that is not a preference. It gates the exit from R5.2's
# weekly cycle: "nee" keeps the cycle running, so anything other than "ja" here
# drives the loop until the completion cap fires.

if [[ -z "$PROJECT_NUMBER" ]]; then
  PROJECT_NUMBER="WALK-$(date +%Y%m%d-%H%M%S)"
fi
# Plain ASCII on purpose: passing multi-byte UTF-8 through `curl -d "$var"` on
# Git Bash for Windows has been observed to corrupt the bytes and return HTTP
# 400 InvalidRequestException.
PROJECT_NAME="Walkthrough testrun - ${PROJECT_NUMBER}"

VARIABLES_JSON=$(jq -n \
  --arg projectNumber "$PROJECT_NUMBER" \
  --arg projectName "$PROJECT_NAME" \
  --arg riskFileReference "REL-WALK-${PROJECT_NUMBER}" \
  '{
    projectNumber:     {value: $projectNumber, type: "String"},
    projectName:       {value: $projectName,   type: "String"},
    projectType:       {value: "wegaanleg",    type: "String"},
    department:        {value: "infrastructuur", type: "String"},
    contributorId:     {value: "Walkthrough bijdrager",     type: "String"},
    clientId:          {value: "Walkthrough opdrachtgever", type: "String"},
    confirmedScope:    {value: "Walkthrough testrun - geen echt project.", type: "String"},
    confirmedBudget:   {value: "100000",       type: "String"},
    confirmedTimeline: {value: "10 weken",     type: "String"},
    riskFileReference: {value: $riskFileReference, type: "String"},
    pdpNotes:          {value: "Gegenereerd door scripts/rip-phase-walkthrough.sh.", type: "String"},
    assignedRoles:     {value: "Projectleider: Walkthrough", type: "String"},

    intakeAkkoord:      {value: "ja",        type: "String"},
    approvalStatus:     {value: "approved",  type: "String"},

    mbviMoment:            {value: "voorafgaandAan", type: "String"},
    projectkredietDekking: {value: "binnen",         type: "String"},

    conceptDoAkkoord:    {value: "ja", type: "String"},
    aanpassingenAkkoord: {value: "ja", type: "String"},
    ramingBinnenKrediet: {value: "ja", type: "String"},

    conceptBestekstekeningenAkkoord:      {value: "ja", type: "String"},
    aanpassingenBestekstekeningenAkkoord: {value: "ja", type: "String"},
    bestekAkkoord:                        {value: "ja", type: "String"},
    aanpassingenBestekAkkoord:            {value: "ja", type: "String"},
    inschrijfleidraadAkkoord:             {value: "ja", type: "String"},
    aanpassingenInschrijfleidraadAkkoord: {value: "ja", type: "String"},

    toezichtplanAkkoord:        {value: "ja", type: "String"},
    projectramingBestekAkkoord: {value: "ja", type: "String"},

    dossierVolledig:                 {value: "ja",  type: "String"},
    onregelmatigheidNotaInlichtingen: {value: "nee", type: "String"},
    onregelmatigheidEenheidsprijzen:  {value: "nee", type: "String"},
    dekkingsbronAfwijking:            {value: "nee", type: "String"},

    documentenAkkoord:            {value: "ja",  type: "String"},
    technischeInstallaties:       {value: "nee", type: "String"},

    weekstaatAkkoord:   {value: "ja",     type: "String"},
    awrAkkoord:         {value: "ja",     type: "String"},
    afwijkingAkkoord:   {value: "ja",     type: "String"},
    kredietPositie:     {value: "binnen", type: "String"},
    notaWaarde:         {value: "onder",  type: "String"},
    termijnenContract:  {value: "binnen", type: "String"},
    werkGereed:         {value: "ja",     type: "String"},

    opleverdossierAkkoordBeheer:    {value: "ja",                type: "String"},
    opleverdossierAkkoordDv:        {value: "ja",                type: "String"},
    restpuntenAkkoord:              {value: "ja",                type: "String"},
    eindafrekeningWaarde:           {value: "onder",             type: "String"},
    kredietAanneemsom:              {value: "binnen-aanneemsom", type: "String"},
    technischeInstallatiesAanwezig: {value: "nee",               type: "String"},

    overdrachtsverklaringAkkoord: {value: "ja", type: "String"}
  }')

# ── Precondition: the previous phase must have completed for this project ────
#
# Mirrors useRipPhaseReadiness in the frontend. Sets RESOLVED_KEY to the
# businessKey to start with, or returns non-zero with an explanation.

# jq on this machine is a native Windows binary and writes CRLF, so every key
# would carry a trailing CR into comm -- which then subtracts nothing and every
# project looks eligible. tr -d is the fix; see the jq-CRLF note that has now
# caught three scripts in this repo.
candidates_for() { # $1 = predecessor process key, $2 = this phase's process key
  local prev_key="$1" this_key="$2" finished taken
  finished=$(curl -s -X POST "${OPERATON_URL}/history/process-instance" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg k "$prev_key" --arg t "$TENANT" \
          '{processDefinitionKey: $k, finished: true,
            variables: [{name: "municipality", operator: "eq", value: $t}]}')" \
    | jq -r '.[].businessKey | select(. != null)' | tr -d '\r' | sort -u)

  # "Already started" covers running AND finished instances of this phase, the
  # same union the board uses -- a project mid-R3.1 is no more a candidate for
  # R3.1 than one that has finished it.
  taken=$(curl -s -X POST "${OPERATON_URL}/history/process-instance" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg k "$this_key" --arg t "$TENANT" \
          '{processDefinitionKey: $k,
            variables: [{name: "municipality", operator: "eq", value: $t}]}')" \
    | jq -r '.[].businessKey | select(. != null)' | tr -d '\r' | sort -u)

  comm -23 <(echo "$finished") <(echo "$taken")
}

check_precondition() { # $1 = phase, $2 = requested businessKey ("" to resolve)
  local phase="$1" requested="$2" prev prev_key cands n
  RESOLVED_KEY="$requested"

  prev=$(predecessor_of "$phase")
  if [[ -z "$prev" ]]; then
    pass "no predecessor — ${phase} is the first rung and starts a new project"
    return 0
  fi

  phase_config "$prev"; prev_key="$PROCESS_KEY"
  phase_config "$phase"

  if [[ "$FORCE" == "true" ]]; then
    echo "  WARN  --force: starting without a completed ${prev}. The board would"
    echo "        not offer this project; only the engine will accept it."
    return 0
  fi

  cands=$(candidates_for "$prev_key" "$PROCESS_KEY")
  n=$(echo "$cands" | grep -c . || true)

  if [[ -n "$requested" ]]; then
    if echo "$cands" | grep -qx -- "$requested"; then
      pass "${prev} completed for ${requested}, and ${phase} has not started for it"
      return 0
    fi
    fail "${requested} is not eligible to start ${phase}"
    echo "  Either ${prev} has not completed for that project, or ${phase} has"
    echo "  already been started for it. The board's Starten tab would not offer"
    echo "  it either. Eligible now: ${cands:-(none)}"
    echo "  Use --force to start an unattached instance anyway."
    return 1
  fi

  if [[ "$n" == "0" ]]; then
    fail "no project is eligible to start ${phase}"
    echo "  ${phase} needs a project whose ${prev} instance has COMPLETED and"
    echo "  which has not already started ${phase} — the same rule the board's"
    echo "  Starten tab applies."
    echo ""
    echo "  Run the ladder up to that point first:"
    echo "    bash ${SCRIPT_NAME} --chain"
    echo "  or drive just the predecessor to completion:"
    echo "    bash ${SCRIPT_NAME} ${prev} --complete"
    echo "  or start an unattached instance for isolated testing:"
    echo "    bash ${SCRIPT_NAME} ${phase} --force"
    return 1
  fi

  if [[ "$n" != "1" ]]; then
    fail "${n} projects are eligible to start ${phase} — pick one"
    echo "$cands" | sed 's/^/    --business-key /'
    return 1
  fi

  RESOLVED_KEY="$cands"
  pass "one eligible project: ${RESOLVED_KEY} (${prev} completed, ${phase} not started)"
  return 0
}

# ── Drive one phase ───────────────────────────────────────────────────────────
#
# Returns 0 and sets RESULT_INSTANCE_ID / RESULT_BUSINESS_KEY / RESULT_LEFT_OPEN.
# $1 = phase code, $2 = businessKey to inherit ("" for a fresh project),
# $3 = "complete" to finish the phase, "stop" to leave its terminal tasks open.

drive_phase() {
  local phase="$1" inherit_key="$2" mode="$3"
  phase_config "$phase" || { fail "unknown phase '${phase}'"; return 1; }

  section "${phase} — ${PROCESS_KEY}"
  [[ -n "$PHASE_NOTE" ]] && echo "  note: ${PHASE_NOTE}"

  local defs
  defs=$(curl -s "${OPERATON_URL}/process-definition?key=${PROCESS_KEY}&latestVersion=true")
  if [[ "$(echo "$defs" | jq 'length')" == "0" ]]; then
    fail "${PROCESS_KEY} is not deployed on this engine"
    echo "  Deploy it via LDE first, then add its key to packages/shared/src/rip-phases.ts."
    return 1
  fi

  # The backend honours a supplied businessKey (it only mints one when absent),
  # which is what lets a chained phase stay attached to the same project.
  local body='{}'
  [[ -n "$inherit_key" ]] && body=$(jq -n --arg bk "$inherit_key" '{businessKey: $bk}')

  local resp code json
  resp=$(curl -s -w '\n%{http_code}' -X POST "${BACKEND_URL}/v1/process/${PROCESS_KEY}/start" \
    -H 'Content-Type: application/json' -H "Authorization: Bearer ${TOKEN}" -d "$body")
  code=$(echo "$resp" | tail -n1)
  json=$(echo "$resp" | sed '$d')
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    fail "start failed (HTTP ${code:-000})"
    echo "$json"
    return 1
  fi

  RESULT_INSTANCE_ID=$(echo "$json" | jq -r '.data.processInstanceId // empty')
  RESULT_BUSINESS_KEY=$(echo "$json" | jq -r '.data.businessKey // empty')
  [[ -n "$RESULT_INSTANCE_ID" ]] || { fail "start returned no processInstanceId"; echo "$json"; return 1; }

  if [[ -n "$inherit_key" && "$RESULT_BUSINESS_KEY" != "$inherit_key" ]]; then
    fail "businessKey was not honoured: asked for '${inherit_key}', got '${RESULT_BUSINESS_KEY}'"
    echo "  addTenantToProcessVariables should only mint a key when none is supplied."
    return 1
  fi
  pass "started ${RESULT_INSTANCE_ID} (businessKey=${RESULT_BUSINESS_KEY})"

  local municipality
  municipality=$(curl -s "${OPERATON_URL}/process-instance/${RESULT_INSTANCE_ID}/variables/municipality" | jq -r '.value // empty')
  [[ -n "$municipality" ]] || { fail "no municipality variable — the instance would be INVISIBLE on the board"; return 1; }
  pass "municipality=${municipality}"

  local done=0 waited found tasks count id name key stop
  RESULT_LEFT_OPEN=""
  while true; do
    tasks=$(curl -s "${OPERATON_URL}/task?processInstanceId=${RESULT_INSTANCE_ID}")
    count=$(echo "$tasks" | jq 'length' 2>/dev/null); [[ -z "$count" || "$count" == "null" ]] && count=0

    if [[ "$count" == "0" ]]; then
      # Either the phase is finished, or an external task is in flight and the
      # backend worker has not picked it up yet. Distinguish the two rather
      # than guessing: ask the engine whether the instance still exists.
      if [[ "$(curl -s -o /dev/null -w '%{http_code}' "${OPERATON_URL}/process-instance/${RESULT_INSTANCE_ID}")" == "404" ]]; then
        pass "phase complete — ${done} task(s) completed, instance ended"
        return 0
      fi
      waited=0; found=false
      while [[ "$waited" -lt "$TASK_POLL_TIMEOUT" ]]; do
        sleep "$TASK_POLL_INTERVAL"; waited=$((waited + TASK_POLL_INTERVAL))
        tasks=$(curl -s "${OPERATON_URL}/task?processInstanceId=${RESULT_INSTANCE_ID}")
        count=$(echo "$tasks" | jq 'length' 2>/dev/null); [[ -z "$count" || "$count" == "null" ]] && count=0
        [[ "$count" != "0" ]] && { found=true; break; }
        [[ "$(curl -s -o /dev/null -w '%{http_code}' "${OPERATON_URL}/process-instance/${RESULT_INSTANCE_ID}")" == "404" ]] && {
          pass "phase complete — ${done} task(s) completed, instance ended"; return 0; }
      done
      if [[ "$found" != "true" ]]; then
        fail "no open task appeared within ${TASK_POLL_TIMEOUT}s and the instance is still running"
        echo "  Most likely an external task nobody is consuming. Instance left for inspection:"
        echo "    bash ${SCRIPT_NAME} --clean ${RESULT_INSTANCE_ID}"
        return 1
      fi
      continue
    fi

    # Pick the first task that is NOT terminal. Only when every open task is
    # terminal is the phase "driven as far as it goes" — which is the correct
    # stopping rule for the phases that run parallel branches.
    id=""; name=""
    local i
    for ((i = 0; i < count; i++)); do
      key=$(echo "$tasks" | jq -r ".[${i}].taskDefinitionKey")
      stop=false
      for s in $STOP_KEYS; do [[ "$key" == "$s" ]] && stop=true; done
      if [[ "$stop" == "false" ]]; then
        id=$(echo "$tasks" | jq -r ".[${i}].id")
        name=$(echo "$tasks" | jq -r ".[${i}].name" | collapse_ws)
        break
      fi
    done

    if [[ -z "$id" ]]; then
      if [[ "$mode" == "complete" ]]; then
        id=$(echo "$tasks" | jq -r '.[0].id')
        name=$(echo "$tasks" | jq -r '.[0].name' | collapse_ws)
      else
        RESULT_LEFT_OPEN=$(echo "$tasks" | jq -r '.[].name' | collapse_ws)
        pass "${done} task(s) completed; stopping with ${count} terminal task(s) open"
        echo "      open: ${RESULT_LEFT_OPEN}"
        return 0
      fi
    fi

    if [[ "$done" -ge "$MAX" ]]; then
      fail "hit the ${MAX}-completion cap on ${phase}"
      echo "  This is a rework loop, not a long phase: an Akkoord variable did not"
      echo "  reach the engine, so a review branch is being driven repeatedly."
      echo "  Current task: ${name}. Instance left for inspection:"
      echo "    bash ${SCRIPT_NAME} --clean ${RESULT_INSTANCE_ID}"
      return 1
    fi

    resp=$(curl -s -w '\n%{http_code}' -X POST "${OPERATON_URL}/task/${id}/complete" \
      -H 'Content-Type: application/json' \
      -d "$(jq -n --argjson v "$VARIABLES_JSON" '{variables: $v}')")
    code=$(echo "$resp" | tail -n1)
    if [[ "$code" != "204" && "$code" != "200" ]]; then
      fail "completing \"${name}\" failed (HTTP ${code:-000})"
      echo "$resp" | sed '$d'
      echo "  Instance left for inspection: bash ${SCRIPT_NAME} --clean ${RESULT_INSTANCE_ID}"
      return 1
    fi
    done=$((done + 1))
    echo "  [${done}] ${name}"
  done
}

# ── Run ───────────────────────────────────────────────────────────────────────

if [[ "$CHAIN" == "true" ]]; then
  echo ""
  echo "Chaining the ladder for one project: ${PROJECT_NUMBER}"
  CHAIN_KEY="$BUSINESS_KEY_IN"
  LAST=""
  for p in $LADDER; do
    phase_config "$p" || continue
    if [[ "$(curl -s "${OPERATON_URL}/process-definition?key=${PROCESS_KEY}&latestVersion=true" | jq 'length')" == "0" ]]; then
      echo ""
      echo "── ${p} — ${PROCESS_KEY} not deployed, stopping the chain here ──"
      break
    fi
    LAST="$p"
  done

  for p in $LADDER; do
    phase_config "$p" || continue
    [[ "$(curl -s "${OPERATON_URL}/process-definition?key=${PROCESS_KEY}&latestVersion=true" | jq 'length')" == "0" ]] && break
    mode="complete"
    # The final deployed phase stops before its terminal task(s) unless asked
    # to finish, so there is something left to click through on the board.
    [[ "$p" == "$LAST" && "$COMPLETE" == "false" ]] && mode="stop"
    drive_phase "$p" "$CHAIN_KEY" "$mode" || fatal
    CHAIN_KEY="$RESULT_BUSINESS_KEY"
  done

  section "Chain complete"
  echo "  project      ${PROJECT_NUMBER}"
  echo "  businessKey  ${CHAIN_KEY}"
  echo "  last phase   ${LAST}"
  echo ""
  echo "  Every phase instance shares that businessKey, so the board shows one"
  echo "  project walking the ladder. Check Beheer -> ${LAST} -> WIP."
  exit 0
fi

section "Precondition for ${PHASE}"
check_precondition "$PHASE" "$BUSINESS_KEY_IN" || fatal

mode="stop"; [[ "$COMPLETE" == "true" ]] && mode="complete"
drive_phase "$PHASE" "$RESOLVED_KEY" "$mode" || fatal

section "Done"
echo "  phase        ${PHASE} (${PROCESS_KEY})"
echo "  instance     ${RESULT_INSTANCE_ID}"
echo "  businessKey  ${RESULT_BUSINESS_KEY}"
echo "  project      ${PROJECT_NUMBER}"
echo ""
echo "  Start the next phase for this same project with:"
echo "    bash ${SCRIPT_NAME} <next-phase> --business-key ${RESULT_BUSINESS_KEY}"
echo "  Clean up with:"
echo "    bash ${SCRIPT_NAME} --clean ${RESULT_INSTANCE_ID}"
