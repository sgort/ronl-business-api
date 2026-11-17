#!/usr/bin/env bash
#
# Brings a live realm to what the BRP route needs since #319: who may look up
# whom in the BRP, decided by the repository owner on 16-17 November 2026.
#
# WHAT IT ADDS (only what is missing; safe to re-run)
# ---------------------------------------------------
#   1. The realm role brp-raadpleger.
#   2. brp-raadpleger as a composite member of caseworker, so every
#      caseworker holds it -- present and future, Entra-brokered ones
#      included, whose caseworker role a FORCE mapper sets at every login.
#   3. A "bsn" protocol mapper on the ronl-business-api client: the user
#      attribute bsn into the claim bsn (access token, ID token, userinfo).
#   4. The user attribute bsn=<TEST_BSN> on the test citizens that the
#      frontend's old username table mapped (test-citizen-utrecht, -amsterdam,
#      -heusden, -bes, -rotterdam, -denhaag, -flevoland). A user that does not
#      exist on this realm is skipped; one that already has a bsn keeps it.
#
# Nothing is removed. Where DigiD is real, the bsn claim is to come from the
# DigiD subject instead (decision (c) on #319); that is not part of this.
#
# ORDER
# -----
# Run it on a tier BEFORE the code from #319 is deployed there: the backend
# then refuses a citizen's BRP lookup without a bsn claim, and the frontend
# no longer has its username table. The script is additive, so running it
# early changes nothing for the code that runs today.
#
# CHECK
# -----
# After the changes it reads the realm back: the role, the composite, the
# mapper, and each test citizen's bsn. A realm whose user profile drops
# unmanaged attributes would lose the bsn silently; the read-back catches it.
#
#   KEYCLOAK_URL    e.g. https://acc.keycloak.open-regels.nl   (required)
#   REALM           default: ronl
#   CLIENT_ID       default: ronl-business-api
#   TEST_BSN        default: 999992235 (the shared test BSN, reserved range)
#   ADMIN_USER      default: admin
#   ADMIN_REALM     default: master   (realm the ADMIN account lives in)
#   ADMIN_PASSWORD  required (prompted if unset; not needed for --dry-run)
#
# Usage:
#   KEYCLOAK_URL=https://acc.keycloak.open-regels.nl \
#     bash scripts/keycloak-add-brp-raadpleger.sh [--dry-run]
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:?set KEYCLOAK_URL, e.g. https://acc.keycloak.open-regels.nl}"
KEYCLOAK_URL="${KEYCLOAK_URL%/}"
REALM="${REALM:-ronl}"
CLIENT_ID="${CLIENT_ID:-ronl-business-api}"
TEST_BSN="${TEST_BSN:-999992235}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_REALM="${ADMIN_REALM:-master}"

ROLE=brp-raadpleger
COMPOSITE_OF=caseworker
TEST_CITIZENS=(utrecht amsterdam heusden bes rotterdam denhaag flevoland)

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
# jq on Windows writes CRLF; strip the CR wherever a value lands in a variable.
jqr() { jq "$@" | tr -d '\r'; }

TEST_BSN="${TEST_BSN//$'\r'/}"
# A test BSN must be nine digits in the reserved 99999xxxx range: this script
# must never put a real burgerservicenummer on a test account.
[[ "$TEST_BSN" =~ ^99999[0-9]{4}$ ]] || {
  echo "TEST_BSN must be nine digits in the reserved 99999xxxx test range: '${TEST_BSN}'" >&2
  exit 2
}

ROLE_JSON=$(jq -nc --arg n "$ROLE" \
  '{name: $n, description: "May look up any person in the BRP (#319); held by every caseworker through the caseworker composite"}')
MAPPER_JSON=$(jq -nc '{
  name: "bsn", protocol: "openid-connect", protocolMapper: "oidc-usermodel-attribute-mapper",
  consentRequired: false,
  config: {"user.attribute": "bsn", "claim.name": "bsn", "jsonType.label": "String",
           "id.token.claim": "true", "access.token.claim": "true", "userinfo.token.claim": "true"}}')

if [[ "$DRY_RUN" == "true" ]]; then
  echo "→ dry run: nothing is sent to ${KEYCLOAK_URL}"
  echo "→ realm role in ${REALM}:"
  jq . <<<"$ROLE_JSON"
  echo "→ composite: ${COMPOSITE_OF} includes ${ROLE}"
  echo "→ protocol mapper on ${CLIENT_ID}:"
  jq . <<<"$MAPPER_JSON"
  echo "→ attribute bsn=${TEST_BSN} on, where present and without one:"
  printf '  test-citizen-%s\n' "${TEST_CITIZENS[@]}"
  exit 0
fi

if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  read -rsp "Keycloak admin password for ${ADMIN_USER}@${KEYCLOAK_URL}: " ADMIN_PASSWORD
  echo
fi
# Responses and the bearer token live in a private directory, removed however
# the script ends (#252).
TMPD=$(mktemp -d)
trap 'rm -rf "$TMPD"' EXIT

TOKEN_URL="${KEYCLOAK_URL}/realms/${ADMIN_REALM}/protocol/openid-connect/token"
echo "→ authenticating as ${ADMIN_USER} against realm ${ADMIN_REALM}"
# The password goes in on stdin, never as an argument (#252).
TOKEN_CODE=$(printf '%s' "$ADMIN_PASSWORD" | curl -sS -o "$TMPD/token.out" -w '%{http_code}' \
  -X POST "$TOKEN_URL" \
  -d "client_id=admin-cli" -d "grant_type=password" \
  --data-urlencode "username=${ADMIN_USER}" \
  --data-urlencode "password@-" || true)
TOKEN=$(jqr -r '.access_token // empty' "$TMPD/token.out" 2>/dev/null || true)
[[ -n "$TOKEN" ]] || {
  echo "could not obtain an admin token (HTTP ${TOKEN_CODE}) from ${TOKEN_URL}" >&2
  echo "  is ADMIN_PASSWORD set in this shell to another tier's password? unset it to be prompted" >&2
  exit 1
}
# The header reaches curl through a 0600 config file, not argv (#252).
printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" >"$TMPD/auth.cfg"
chmod 600 "$TMPD/auth.cfg"
AUTH=(-K "$TMPD/auth.cfg")
BASE="${KEYCLOAK_URL}/admin/realms/${REALM}"

# api <method> <path> [json]: the HTTP status; the body lands in $TMPD/out.
api() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o "$TMPD/out" -w '%{http_code}' -X "$method" "${AUTH[@]}" \
      -H 'Content-Type: application/json' "${BASE}${path}" --data-binary @- <<<"$body" || true
  else
    curl -sS -o "$TMPD/out" -w '%{http_code}' -X "$method" "${AUTH[@]}" "${BASE}${path}" || true
  fi
}
fail() { echo "  FAILED        $1 -> HTTP $2: $(head -c 200 "$TMPD/out")" >&2; exit 1; }

# ── 1. The role ──────────────────────────────────────────────────────────────
code=$(api GET "/roles/${ROLE}")
if [[ "$code" == "404" ]]; then
  code=$(api POST "/roles" "$ROLE_JSON")
  [[ "$code" == "201" ]] || fail "create role ${ROLE}" "$code"
  echo "  created       role ${ROLE}"
elif [[ "$code" == "200" ]]; then
  echo "  present       role ${ROLE}"
else
  fail "read role ${ROLE}" "$code"
fi
code=$(api GET "/roles/${ROLE}")
[[ "$code" == "200" ]] || fail "read role ${ROLE}" "$code"
ROLE_REP=$(jq -c '{id, name}' "$TMPD/out")

# ── 2. The composite ─────────────────────────────────────────────────────────
code=$(api GET "/roles/${COMPOSITE_OF}/composites/realm")
[[ "$code" == "200" ]] || fail "read composites of ${COMPOSITE_OF}" "$code"
if jq -e --arg n "$ROLE" 'any(.[]; .name == $n)' "$TMPD/out" >/dev/null; then
  echo "  present       ${COMPOSITE_OF} includes ${ROLE}"
else
  code=$(api POST "/roles/${COMPOSITE_OF}/composites" "[${ROLE_REP}]")
  [[ "$code" == "204" ]] || fail "add ${ROLE} to ${COMPOSITE_OF}" "$code"
  echo "  added         ${COMPOSITE_OF} includes ${ROLE}"
fi

# ── 3. The mapper ────────────────────────────────────────────────────────────
code=$(curl -sS -o "$TMPD/clients.json" -w '%{http_code}' "${AUTH[@]}" \
  --get --data-urlencode "clientId=${CLIENT_ID}" "${BASE}/clients" || true)
[[ "$code" == "200" ]] || { echo "could not look up client ${CLIENT_ID} -> HTTP ${code}" >&2; exit 1; }
[[ "$(jqr 'length' "$TMPD/clients.json")" == "1" ]] || {
  echo "expected exactly one client ${CLIENT_ID} in realm ${REALM}" >&2
  exit 1
}
UUID=$(jqr -r '.[0].id' "$TMPD/clients.json")
code=$(api GET "/clients/${UUID}/protocol-mappers/models")
[[ "$code" == "200" ]] || fail "read mappers of ${CLIENT_ID}" "$code"
if jq -e 'any(.[]; .name == "bsn")' "$TMPD/out" >/dev/null; then
  echo "  present       mapper bsn on ${CLIENT_ID}"
else
  code=$(api POST "/clients/${UUID}/protocol-mappers/models" "$MAPPER_JSON")
  [[ "$code" == "201" ]] || fail "add mapper bsn" "$code"
  echo "  added         mapper bsn on ${CLIENT_ID}"
fi

# ── 4. The test citizens ─────────────────────────────────────────────────────
# user_rep <username>: the user's full representation in $TMPD/user.json, or
# a non-zero exit when the user does not exist.
user_rep() {
  local code
  code=$(curl -sS -o "$TMPD/users.json" -w '%{http_code}' "${AUTH[@]}" \
    --get --data-urlencode "username=$1" --data-urlencode "exact=true" "${BASE}/users" || true)
  [[ "$code" == "200" ]] || fail "look up user $1" "$code"
  [[ "$(jqr 'length' "$TMPD/users.json")" == "1" ]] || return 1
  local id
  id=$(jqr -r '.[0].id' "$TMPD/users.json")
  code=$(curl -sS -o "$TMPD/user.json" -w '%{http_code}' "${AUTH[@]}" "${BASE}/users/${id}" || true)
  [[ "$code" == "200" ]] || fail "read user $1" "$code"
}
for t in "${TEST_CITIZENS[@]}"; do
  u="test-citizen-${t}"
  if ! user_rep "$u"; then
    echo "  absent        ${u} (skipped)"
    continue
  fi
  if jq -e '(.attributes.bsn // []) | length > 0' "$TMPD/user.json" >/dev/null; then
    echo "  present       ${u} has a bsn"
    continue
  fi
  id=$(jqr -r '.id' "$TMPD/user.json")
  body=$(jq -c --arg b "$TEST_BSN" '.attributes = ((.attributes // {}) + {bsn: [$b]})' "$TMPD/user.json")
  code=$(api PUT "/users/${id}" "$body")
  [[ "$code" == "204" ]] || fail "set bsn on ${u}" "$code"
  echo "  set           ${u} bsn"
done

# ── Check ────────────────────────────────────────────────────────────────────
echo "→ reading the realm back"
CHECK_FAILED=false
check() {
  if [[ "$2" == "true" ]]; then
    printf '  ok      %s\n' "$1"
  else
    printf '  WRONG   %s\n' "$1" >&2
    CHECK_FAILED=true
  fi
}
check "role ${ROLE}" "$([[ "$(api GET "/roles/${ROLE}")" == "200" ]] && echo true)"
api GET "/roles/${COMPOSITE_OF}/composites/realm" >/dev/null
check "${COMPOSITE_OF} includes ${ROLE}" \
  "$(jq -e --arg n "$ROLE" 'any(.[]; .name == $n)' "$TMPD/out" >/dev/null && echo true)"
api GET "/clients/${UUID}/protocol-mappers/models" >/dev/null
check "mapper bsn on ${CLIENT_ID}" "$(jq -e 'any(.[]; .name == "bsn")' "$TMPD/out" >/dev/null && echo true)"
for t in "${TEST_CITIZENS[@]}"; do
  u="test-citizen-${t}"
  user_rep "$u" || continue
  check "${u} has a bsn" "$(jq -e '(.attributes.bsn // []) | length > 0' "$TMPD/user.json" >/dev/null && echo true)"
done
if [[ "$CHECK_FAILED" == "true" ]]; then
  echo "check: the realm does not hold what was set (a user profile dropping the bsn attribute?)" >&2
  exit 1
fi
echo "check: as expected"
