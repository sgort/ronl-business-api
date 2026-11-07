#!/bin/sh
# check-engine.sh: prove Operaton's own access rules for #415, straight
# against the engine (no Caddy in front).
#
#   check-engine.sh [ENGINE_REST_URL] [ADMIN_USER] [ADMIN_PASSWORD]
#
# Defaults: http://localhost:8091/engine-rest demo demo (the op415 test
# harness). Also reads SVC_USER/SVC_PASS (a service account in
# operaton-admin, default rbaBackend) and PR_USER/PR_PASS (publicReader).
#
# Seeds the fixtures in ./fixtures (an untenanted DMN, a BPMN with one user
# task, and the same BPMN for tenant flevoland), starts one case if none is
# running, then asserts who may see and do what. One PASS/FAIL line per check;
# exits 1 if any check fails. POSIX sh and curl only.

set -u

BASE=${1:-http://localhost:8091/engine-rest}
ADMIN_USER=${2:-demo}
ADMIN_PASS=${3:-demo}
SVC_USER=${SVC_USER:-rbaBackend}
SVC_PASS=${SVC_PASS:-rbaBackend}
PR_USER=${PR_USER:-publicReader}
PR_PASS=${PR_PASS:-publicReader}
HERE=$(cd "$(dirname "$0")" && pwd)

failures=0
body_file=$(mktemp)
trap 'rm -f "$body_file"' EXIT

# req USER PASS METHOD PATH [curl args...] -> prints the status; body in $body_file.
# USER "-" sends no credentials.
req() {
  _u=$1 _p=$2 _m=$3 _path=$4
  shift 4
  if [ "$_u" = "-" ]; then
    curl -s -o "$body_file" -w '%{http_code}' -X "$_m" "$@" "$BASE$_path"
  else
    curl -s -o "$body_file" -w '%{http_code}' -u "$_u:$_p" -X "$_m" "$@" "$BASE$_path"
  fi
}

check() { # check LABEL EXPECTED ACTUAL
  if [ "$2" = "$3" ]; then
    echo "PASS  $1"
  else
    echo "FAIL  $1 (expected $2, got $3)"
    failures=$((failures + 1))
  fi
}

# first_id FIELD -> first "FIELD":"value" in $body_file
first_field() { grep -o "\"$1\":\"[^\"]*\"" "$body_file" | head -n 1 | sed 's/.*:"\(.*\)"/\1/'; }
count_of() { grep -o '"count":[0-9]*' "$body_file" | sed 's/.*://'; }
json_items() { grep -o '"id":"[^"]*"' "$body_file" | wc -l | tr -d ' '; }

JSON='-H Content-Type:application/json'
EVAL_BODY='{"variables":{"x":{"value":12,"type":"Integer"}}}'

# ---------------------------------------------------------------- seed, as admin
deploy() { # deploy NAME FILE [TENANT]; stops the run if the engine refuses
  if [ -n "${3:-}" ]; then
    _s=$(req "$ADMIN_USER" "$ADMIN_PASS" POST /deployment/create \
      -F "deployment-name=$1" -F "deploy-changed-only=true" -F "tenant-id=$3" -F "data=@$2")
  else
    _s=$(req "$ADMIN_USER" "$ADMIN_PASS" POST /deployment/create \
      -F "deployment-name=$1" -F "deploy-changed-only=true" -F "data=@$2")
  fi
  if [ "$_s" != "200" ]; then
    echo "FAIL  seeding: deploying $1 answered $_s"
    cat "$body_file"
    echo
    exit 1
  fi
}
deploy op415-public "$HERE/fixtures/op415_public.dmn"
deploy op415-case "$HERE/fixtures/op415_case.bpmn"
deploy op415-case-flevoland "$HERE/fixtures/op415_case.bpmn" flevoland

req "$ADMIN_USER" "$ADMIN_PASS" GET "/process-instance/count?processDefinitionKey=op415_case&withoutTenantId=true" >/dev/null
if [ "$(count_of)" = "0" ]; then
  req "$ADMIN_USER" "$ADMIN_PASS" POST /process-definition/key/op415_case/start $JSON -d '{}' >/dev/null
fi
# (key/op415_case/start resolves the untenanted one: tenant-scoped needs /tenant-id/...)
req "$ADMIN_USER" "$ADMIN_PASS" GET "/process-instance?processDefinitionKey=op415_case&maxResults=1" >/dev/null
INSTANCE_ID=$(first_field id)
req "$ADMIN_USER" "$ADMIN_PASS" GET "/deployment?name=op415-public&maxResults=1" >/dev/null
DEPLOYMENT_ID=$(first_field id)
req "$ADMIN_USER" "$ADMIN_PASS" GET "/deployment/$DEPLOYMENT_ID/resources" >/dev/null
RESOURCE_ID=$(first_field id)
if [ -z "$INSTANCE_ID" ] || [ -z "$DEPLOYMENT_ID" ] || [ -z "$RESOURCE_ID" ]; then
  echo "FAIL  seeding (instance='$INSTANCE_ID' deployment='$DEPLOYMENT_ID' resource='$RESOURCE_ID')"
  exit 1
fi

# ---------------------------------------------------------------- anonymous
check "anonymous GET /version is refused" 401 "$(req - - GET /version)"

# ---------------------------------------------------------------- publicReader: the rules
check "publicReader lists the untenanted DMN" 200 "$(req "$PR_USER" "$PR_PASS" GET '/decision-definition?key=op415_public')"
check "  ... 1 result" 1 "$(json_items)"
check "publicReader lists process definitions op415_case" 200 "$(req "$PR_USER" "$PR_PASS" GET '/process-definition?key=op415_case')"
check "  ... only the untenanted one (tenant check on)" 1 "$(json_items)"
check "publicReader lists deployments" 200 "$(req "$PR_USER" "$PR_PASS" GET /deployment)"
check "publicReader reads the DMN source" 200 "$(req "$PR_USER" "$PR_PASS" GET "/deployment/$DEPLOYMENT_ID/resources/$RESOURCE_ID/data")"
check "  ... and it is op415_public" 1 "$(grep -c 'id="op415_public"' "$body_file")"
check "publicReader evaluates op415_public" 200 "$(req "$PR_USER" "$PR_PASS" POST /decision-definition/key/op415_public/evaluate $JSON -d "$EVAL_BODY")"

# ---------------------------------------------------------------- publicReader: the cases
check "publicReader GET /process-instance/count answers" 200 "$(req "$PR_USER" "$PR_PASS" GET /process-instance/count)"
check "  ... with count 0" 0 "$(count_of)"
check "publicReader GET /task/count answers" 200 "$(req "$PR_USER" "$PR_PASS" GET /task/count)"
check "  ... with count 0" 0 "$(count_of)"
check "publicReader GET /history/process-instance/count answers" 200 "$(req "$PR_USER" "$PR_PASS" GET /history/process-instance/count)"
check "  ... with count 0" 0 "$(count_of)"
check "publicReader cannot read a case's variables" 403 "$(req "$PR_USER" "$PR_PASS" GET "/process-instance/$INSTANCE_ID/variables")"
check "publicReader cannot deploy" 403 "$(req "$PR_USER" "$PR_PASS" POST /deployment/create -F deployment-name=op415-intruder -F "data=@$HERE/fixtures/op415_public.dmn")"
check "publicReader cannot start a case" 403 "$(req "$PR_USER" "$PR_PASS" POST /process-definition/key/op415_case/start $JSON -d '{}')"

# ---------------------------------------------------------------- service account
check "service account counts cases" 200 "$(req "$SVC_USER" "$SVC_PASS" GET /process-instance/count)"
if [ "$(count_of)" -ge 1 ] 2>/dev/null; then echo "PASS    ... count >= 1"; else echo "FAIL    ... count >= 1 (got $(count_of))"; failures=$((failures + 1)); fi
check "service account sees the flevoland definition" 200 "$(req "$SVC_USER" "$SVC_PASS" GET '/process-definition?key=op415_case&tenantIdIn=flevoland')"
check "  ... 1 result" 1 "$(json_items)"

echo
if [ "$failures" -eq 0 ]; then
  echo "check-engine: all checks passed"
else
  echo "check-engine: $failures check(s) failed"
  exit 1
fi
