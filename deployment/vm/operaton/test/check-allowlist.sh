#!/bin/sh
# check-allowlist.sh: prove Caddy's public allowlist for #415, through the
# op415-caddy container in front of the 1.0.0 test engine.
#
#   check-allowlist.sh [CADDY_URL] [ADMIN_USER] [ADMIN_PASSWORD]
#
# Defaults: http://localhost:8090 demo demo. Run check-engine.sh first: it
# seeds the fixtures this script reads. Also reads SVC_USER/SVC_PASS
# (default rbaBackend). No credentials are sent unless a check says so.
# One PASS/FAIL line per check; exits 1 if any fails. POSIX sh and curl only.

set -u

CADDY=${1:-http://localhost:8090}
ADMIN_USER=${2:-demo}
ADMIN_PASS=${3:-demo}
SVC_USER=${SVC_USER:-rbaBackend}
SVC_PASS=${SVC_PASS:-rbaBackend}
ER="$CADDY/engine-rest"
ORIGIN='https://example.org'

failures=0
body_file=$(mktemp)
head_file=$(mktemp)
trap 'rm -f "$body_file" "$head_file"' EXIT

anon() { # anon METHOD URL [curl args...] -> status; body/headers kept
  _m=$1 _url=$2
  shift 2
  curl -s --path-as-is -o "$body_file" -D "$head_file" -w '%{http_code}' -X "$_m" "$@" "$_url"
}
check() {
  if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (expected $2, got $3)"; failures=$((failures + 1)); fi
}
check_in() { # check_in LABEL ACTUAL ALLOWED...
  _label=$1 _actual=$2
  shift 2
  for _ok in "$@"; do
    if [ "$_actual" = "$_ok" ]; then echo "PASS  $_label ($_actual)"; return; fi
  done
  echo "FAIL  $_label (got $_actual, allowed: $*)"
  failures=$((failures + 1))
}
first_field() { grep -o "\"$1\":\"[^\"]*\"" "$body_file" | head -n 1 | sed 's/.*:"\(.*\)"/\1/'; }
count_of() { grep -o '"count":[0-9]*' "$body_file" | sed 's/.*://'; }
header_value() { grep -i "^$1:" "$head_file" | head -n 1 | sed 's/^[^:]*: *//' | tr -d '\r'; }

JSON='-H Content-Type:application/json'
EVAL_BODY='{"variables":{"x":{"value":12,"type":"Integer"}}}'

# IDs from the seeded engine, read as admin through Caddy
curl -s -o "$body_file" -u "$ADMIN_USER:$ADMIN_PASS" "$ER/deployment?name=op415-public&maxResults=1"
DEP=$(first_field id)
curl -s -o "$body_file" -u "$ADMIN_USER:$ADMIN_PASS" "$ER/deployment/$DEP/resources"
RES=$(first_field id)
curl -s -o "$body_file" -u "$ADMIN_USER:$ADMIN_PASS" "$ER/decision-definition?key=op415_public&maxResults=1"
DD=$(first_field id)
curl -s -o "$body_file" -u "$ADMIN_USER:$ADMIN_PASS" "$ER/process-definition?key=op415_case&withoutTenantId=true&maxResults=1"
PD=$(first_field id)
if [ -z "$DEP" ] || [ -z "$RES" ] || [ -z "$DD" ] || [ -z "$PD" ]; then
  echo "FAIL  reading fixture IDs (deployment='$DEP' resource='$RES' decision='$DD' process='$PD'); run check-engine.sh first"
  exit 1
fi

echo "-- public without credentials: 200"
for p in /process-definition /process-definition/count /process-definition/key/op415_case \
  /process-definition/key/op415_case/xml "/process-definition/$PD" "/process-definition/$PD/xml" \
  /decision-definition /decision-definition/count /decision-definition/key/op415_public/xml \
  "/decision-definition/$DD" /decision-requirements-definition /deployment /deployment/count \
  "/deployment/$DEP" "/deployment/$DEP/resources" "/deployment/$DEP/resources/$RES" \
  "/deployment/$DEP/resources/$RES/data"; do
  check "GET $p" 200 "$(anon GET "$ER$p")"
done
check "POST /decision-definition/key/op415_public/evaluate" 200 "$(anon POST "$ER/decision-definition/key/op415_public/evaluate" $JSON -d "$EVAL_BODY")"
check "POST /decision-definition/{id}/evaluate" 200 "$(anon POST "$ER/decision-definition/$DD/evaluate" $JSON -d "$EVAL_BODY")"

echo "-- everything else without credentials: 401"
for p in /version /process-instance /process-instance/count /task /task/count /history/process-instance \
  /variable-instance /incident /user /authorization /process-definition/statistics \
  "/process-definition/$PD/statistics" "/process-definition/$PD/form-variables" \
  /process-definition/key/op415_case/form-variables /decision-definition/statistics; do
  check "GET $p" 401 "$(anon GET "$ER$p")"
done
check "POST /deployment/create" 401 "$(anon POST "$ER/deployment/create" -F deployment-name=op415-intruder -F "data=@$(dirname "$0")/fixtures/op415_public.dmn")"
check "POST /process-definition/key/op415_case/start" 401 "$(anon POST "$ER/process-definition/key/op415_case/start" $JSON -d '{}')"
check "PUT /decision-definition/{id}/history-time-to-live" 401 "$(anon PUT "$ER/decision-definition/$DD/history-time-to-live" $JSON -d '{"historyTimeToLive":1}')"
check "DELETE /deployment/{id}" 401 "$(anon DELETE "$ER/deployment/$DEP")"

echo "-- path tricks never reach case data"
for p in /engine-rest/deployment/../process-instance /engine-rest/deployment/%2e%2e/process-instance \
  /engine-rest//process-instance /engine-rest/deployment%2F..%2Fprocess-instance \
  /Engine-Rest/process-instance /engine-rest/process-instance/ \
  "/engine-rest/deployment/$DEP/resources/../../../process-instance/count"; do
  s=$(anon GET "$CADDY$p")
  if [ "$s" = "200" ] && grep -q '"id"\|"count":[1-9]' "$body_file"; then
    echo "FAIL  GET $p leaked case data ($s)"
    failures=$((failures + 1))
  else
    echo "PASS  GET $p ($s, no case data)"
  fi
done

echo "-- a caller's own credentials are kept"
# The wrong password goes to a DIFFERENT account than the one checked next:
# Operaton throttles a user for 3 s and more after a failed login (#425).
check "evaluate with a wrong password is refused" 401 "$(anon POST "$ER/decision-definition/key/op415_public/evaluate" -u "${WRONG_USER:-ldeBackend}:wrong" $JSON -d "$EVAL_BODY")"
check "service account counts cases" 200 "$(anon GET "$ER/process-instance/count" -u "$SVC_USER:$SVC_PASS")"
check_in "  ... count >= 1" "$([ "$(count_of)" -ge 1 ] 2>/dev/null && echo yes || echo no)" yes

echo "-- CORS"
anon GET "$ER/decision-definition/key/op415_public/xml" -H "Origin: $ORIGIN" >/dev/null
check "public GET carries Access-Control-Allow-Origin *" '*' "$(header_value Access-Control-Allow-Origin)"
check "public GET carries no Access-Control-Allow-Credentials" '' "$(header_value Access-Control-Allow-Credentials)"
s=$(anon OPTIONS "$ER/decision-definition/key/op415_public/evaluate" -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type')
check "preflight on a public evaluate answers" 204 "$s"
check "  ... with Access-Control-Allow-Origin *" '*' "$(header_value Access-Control-Allow-Origin)"
anon GET "$ER/version" -H "Origin: $ORIGIN" >/dev/null
check "GET /version carries no Access-Control-Allow-Origin" '' "$(header_value Access-Control-Allow-Origin)"
anon OPTIONS "$ER/process-instance" -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: GET' >/dev/null
check "preflight on /process-instance carries no Access-Control-Allow-Origin" '' "$(header_value Access-Control-Allow-Origin)"
anon GET "$ER/process-instance/count" -u "$SVC_USER:$SVC_PASS" -H "Origin: $ORIGIN" >/dev/null
check "authenticated GET carries no Access-Control-Allow-Origin" '' "$(header_value Access-Control-Allow-Origin)"

echo
if [ "$failures" -eq 0 ]; then echo "check-allowlist: all checks passed"; else echo "check-allowlist: $failures check(s) failed"; exit 1; fi
