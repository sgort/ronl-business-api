#!/bin/sh
# provision-accounts.sh: create Operaton's accounts and permissions for #415.
# Idempotent: creates only what is missing, and never changes an existing
# user's password. Safe to run with the engine's login still off.
#
# Everything comes from the environment; nothing secret or personal lives in
# this file (the repository is public):
#
#   OPERATON_URL             engine-rest base, e.g. http://localhost:8081/engine-rest
#   OPERATON_ADMIN_USER      an existing operaton-admin member (demo)
#   OPERATON_ADMIN_PASSWORD  its password
#   SERVICE_ACCOUNTS         space-separated IDs to create in operaton-admin,
#                            e.g. "rbaBackendAcc ldeBackendAcc". Each one's
#                            password is in PW_<ID upper-cased>, e.g.
#                            PW_RBABACKENDACC.
#   EXISTING_ADMIN_MEMBERS   space-separated IDs of existing users to add to
#                            operaton-admin (typed at run time, never committed)
#   PUBLIC_READER_PASSWORD   password for publicReader
#
# Account IDs must match Operaton's default resource whitelist, [a-zA-Z0-9]+:
# no dashes (operaton-admin is the engine's own exception), hence camelCase.
#
# publicReader gets READ on process definitions (6), deployments (9),
# decision definitions (10, plus CREATE_INSTANCE to evaluate) and decision
# requirements definitions (14), resource "*". Nothing else.
#
# POSIX sh and curl only. Exits 1 on the first unexpected HTTP status.

set -u

: "${OPERATON_URL:?OPERATON_URL is required}"
: "${OPERATON_ADMIN_USER:?OPERATON_ADMIN_USER is required}"
: "${OPERATON_ADMIN_PASSWORD:?OPERATON_ADMIN_PASSWORD is required}"
: "${PUBLIC_READER_PASSWORD:?PUBLIC_READER_PASSWORD is required}"
SERVICE_ACCOUNTS=${SERVICE_ACCOUNTS:-}
EXISTING_ADMIN_MEMBERS=${EXISTING_ADMIN_MEMBERS:-}
ADMIN_GROUP=operaton-admin
PUBLIC_READER=publicReader

body_file=$(mktemp)
trap 'rm -f "$body_file"' EXIT

api() { # api METHOD PATH [JSON] -> prints the HTTP status
  if [ $# -ge 3 ]; then
    curl -s -o "$body_file" -w '%{http_code}' -u "$OPERATON_ADMIN_USER:$OPERATON_ADMIN_PASSWORD" \
      -X "$1" -H 'Content-Type: application/json' -d "$3" "$OPERATON_URL$2"
  else
    curl -s -o "$body_file" -w '%{http_code}' -u "$OPERATON_ADMIN_USER:$OPERATON_ADMIN_PASSWORD" \
      -X "$1" "$OPERATON_URL$2"
  fi
}

die() { echo "provision-accounts: $1" >&2; [ -s "$body_file" ] && cat "$body_file" >&2 && echo >&2; exit 1; }
count_of() { grep -o '"count":[0-9]*' "$body_file" | sed 's/.*://'; }

valid_id() { # Operaton's whitelist [a-zA-Z0-9]+; also guards the eval below
  case $1 in '' | *[!a-zA-Z0-9]*) die "invalid account ID '$1'" ;; esac
}

wait_for_engine() { # any answer at all (401 included) means it is up; give it 120 s
  i=0
  while [ "$(curl -s -o /dev/null -w '%{http_code}' "$OPERATON_URL/version")" = "000" ]; do
    i=$((i + 1))
    [ "$i" -ge 60 ] && die "no answer from $OPERATON_URL after 120 s"
    sleep 2
  done
}

ensure_user() { # ensure_user ID PASSWORD
  s=$(api GET "/user/$1/profile")
  case $s in
    200) echo "user $1: exists" ;;
    404)
      s=$(api POST /user/create "{\"profile\":{\"id\":\"$1\",\"firstName\":\"$1\",\"lastName\":\"(service account)\"},\"credentials\":{\"password\":\"$2\"}}")
      [ "$s" = "204" ] || die "creating user $1 answered $s"
      echo "user $1: created"
      ;;
    *) die "reading user $1 answered $s" ;;
  esac
}

ensure_admin_member() { # ensure_admin_member ID
  s=$(api GET "/user/count?id=$1&memberOfGroup=$ADMIN_GROUP")
  [ "$s" = "200" ] || die "checking $1 in $ADMIN_GROUP answered $s"
  if [ "$(count_of)" = "1" ]; then
    echo "member $1 in $ADMIN_GROUP: exists"
    return
  fi
  s=$(api PUT "/group/$ADMIN_GROUP/members/$1")
  [ "$s" = "204" ] || die "adding $1 to $ADMIN_GROUP answered $s"
  echo "member $1 in $ADMIN_GROUP: added"
}

ensure_grant() { # ensure_grant USER RESOURCE_TYPE PERMISSIONS_JSON_ARRAY
  s=$(api GET "/authorization/count?userIdIn=$1&resourceType=$2&resourceId=*")
  [ "$s" = "200" ] || die "checking authorizations of $1 on type $2 answered $s"
  if [ "$(count_of)" != "0" ]; then
    echo "grant $1 on type $2: exists"
    return
  fi
  s=$(api POST /authorization/create "{\"type\":1,\"permissions\":$3,\"userId\":\"$1\",\"groupId\":null,\"resourceType\":$2,\"resourceId\":\"*\"}")
  [ "$s" = "200" ] || die "granting $3 on type $2 to $1 answered $s"
  echo "grant $1 on type $2: created $3"
}

wait_for_engine

for id in $SERVICE_ACCOUNTS; do
  valid_id "$id"
  var="PW_$(echo "$id" | tr 'a-z' 'A-Z')"
  eval "pw=\${$var:-}"
  [ -n "$pw" ] || die "no password for $id: set $var"
  ensure_user "$id" "$pw"
  ensure_admin_member "$id"
done

for id in $EXISTING_ADMIN_MEMBERS; do
  valid_id "$id"
  s=$(api GET "/user/$id/profile")
  [ "$s" = "200" ] || die "existing user $id answered $s (typo?)"
  ensure_admin_member "$id"
done

ensure_user "$PUBLIC_READER" "$PUBLIC_READER_PASSWORD"
ensure_grant "$PUBLIC_READER" 6 '["READ"]'
ensure_grant "$PUBLIC_READER" 9 '["READ"]'
ensure_grant "$PUBLIC_READER" 10 '["READ","CREATE_INSTANCE"]'
ensure_grant "$PUBLIC_READER" 14 '["READ"]'

echo "provision-accounts: done"
