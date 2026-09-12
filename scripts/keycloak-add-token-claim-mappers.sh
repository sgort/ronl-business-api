#!/usr/bin/env bash
#
# Adds the three OIDC protocol mappers the ValidSign signing feature needs to
# the ronl-business-api client: email, given_name, family_name.
#
# WHY NOT A REALM IMPORT
# ----------------------
# Keycloak's partial import is the wrong tool for a client that already
# exists. With policy SKIP it skips the whole client, so the mappers are
# never added; with OVERWRITE it replaces the entire client definition,
# discarding whatever the target environment configured by hand -- redirect
# URIs, web origins, the client secret. Importing config/keycloak/
# ronl-realm.json into ACC would do exactly that.
#
# This talks to the protocol-mappers endpoint instead, which touches nothing
# but the mappers themselves.
#
# WHY THESE MAPPERS
# -----------------
# The signer's identity comes entirely from the caller's own Keycloak token
# and never from the request body -- a package created with a guessed address
# would send a real signature request that cannot be recalled. Without an
# email claim the backend refuses with MISSING_SIGNER_EMAIL, and given_name /
# family_name are what ValidSign shows the signer as. Splitting a display
# name would get Dutch surnames ("van der Berg") wrong.
#
# Idempotent: a mapper that already exists by name is left untouched.
#
#   KEYCLOAK_URL   e.g. https://acc.keycloak.example.nl   (required)
#   REALM          default: ronl
#   ADMIN_USER     default: admin
#   ADMIN_PASSWORD required (prompted if unset)
#   CLIENT_ID      default: ronl-business-api
#
# Usage: KEYCLOAK_URL=https://... ADMIN_PASSWORD=... bash scripts/keycloak-add-token-claim-mappers.sh
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:?set KEYCLOAK_URL, e.g. https://acc.keycloak.open-regels.nl}"
# A trailing slash yields "https://host//realms/..." which some deployments
# reject outright; strip it rather than rely on the server being tolerant.
KEYCLOAK_URL="${KEYCLOAK_URL%/}"
REALM="${REALM:-ronl}"
ADMIN_USER="${ADMIN_USER:-admin}"
# The realm the ADMIN account lives in. Usually master, but a Keycloak whose
# admin was created inside the application realm needs that name instead.
ADMIN_REALM="${ADMIN_REALM:-master}"
CLIENT_ID="${CLIENT_ID:-ronl-business-api}"
# Overridable so the create path can be exercised with a throwaway mapper
# without touching the three real ones.
MAPPERS_FILE="${MAPPERS_FILE:-$(dirname "$0")/keycloak-token-claim-mappers.json}"

if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  read -rsp "Keycloak admin password for ${ADMIN_USER}@${KEYCLOAK_URL}: " ADMIN_PASSWORD
  echo
fi

[[ -f "$MAPPERS_FILE" ]] || { echo "missing $MAPPERS_FILE" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# jq on Windows is a native binary writing in text mode: every line it emits
# ends CRLF, so a value read straight into a shell variable carries a trailing
# carriage return. That CR then fails string comparisons ("email" never equals
# "email\r"), builds empty request bodies, and rewinds terminal output so the
# name vanishes from the error line -- which is exactly how this first
# presented: HTTP 500 unknown_error against a nameless mapper.
jqr() { jq "$@" | tr -d '\r'; }

TOKEN_URL="${KEYCLOAK_URL}/realms/${ADMIN_REALM}/protocol/openid-connect/token"
echo "→ authenticating as ${ADMIN_USER} against realm ${ADMIN_REALM}"
# --data-urlencode rather than -d for the credentials: curl sends -d values
# raw, so a password containing & + = or % is parsed as form syntax and
# arrives wrong -- indistinguishable from a genuinely wrong password.
TOKEN_CODE=$(curl -sS -o /tmp/kc-token.out -w '%{http_code}' -X POST "$TOKEN_URL" \
  -d "client_id=admin-cli" -d "grant_type=password" \
  --data-urlencode "username=${ADMIN_USER}" \
  --data-urlencode "password=${ADMIN_PASSWORD}" || echo "000")
TOKEN=$(jqr -r '.access_token // empty' /tmp/kc-token.out 2>/dev/null || true)

# Report what the server actually said. Swallowing it made a wrong password, an
# admin in a different realm, and an HTML error page from a proxy all produce
# the same unhelpful line.
if [[ -z "$TOKEN" ]]; then
  {
    echo "could not obtain an admin token (HTTP ${TOKEN_CODE})"
    echo "  POST ${TOKEN_URL}"
    echo "  response: $(head -c 400 /tmp/kc-token.out 2>/dev/null)"
    echo
    echo "  401 invalid_grant      -> wrong username/password"
    echo "  404 / realm not found  -> the admin is not in '${ADMIN_REALM}'; try ADMIN_REALM=${REALM}"
    echo "  HTML instead of JSON   -> the URL is not hitting Keycloak directly (proxy/ingress)"
  } >&2
  exit 1
fi

echo "→ resolving client ${CLIENT_ID} in realm ${REALM}"
UUID=$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}" | jqr -r '.[0].id')

[[ "$UUID" != "null" && -n "$UUID" ]] || { echo "client ${CLIENT_ID} not found in realm ${REALM}" >&2; exit 1; }
echo "  client uuid: ${UUID}"

EXISTING=$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${UUID}/protocol-mappers/models" | jqr -r '.[].name')

ADDED=0; SKIPPED=0
while read -r NAME; do
  if grep -qx "$NAME" <<<"$EXISTING"; then
    echo "  = ${NAME} already present, leaving it alone"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  BODY=$(jqr -c --arg n "$NAME" '.[] | select(.name == $n)' "$MAPPERS_FILE")
  CODE=$(curl -sS -o /tmp/kc-mapper.out -w '%{http_code}' -X POST \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${UUID}/protocol-mappers/models" \
    -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
    -d "$BODY")
  if [[ "$CODE" == "201" ]]; then
    echo "  + ${NAME} created"
    ADDED=$((ADDED + 1))
  else
    echo "  ! ${NAME} failed (HTTP ${CODE}): $(cat /tmp/kc-mapper.out)" >&2
    exit 1
  fi
done < <(jqr -r '.[].name' "$MAPPERS_FILE")

echo
echo "→ verifying"
# Verify what this run actually processed, taken from MAPPERS_FILE, rather
# than three hardcoded names: with the names pinned, a run over a different
# mapper file reported the wrong ones as proof of its own work.
WANTED=$(jqr -c '[.[].name]' "$MAPPERS_FILE")
curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/clients/${UUID}/protocol-mappers/models" \
  | jqr -r --argjson want "$WANTED" \
      '.[] | select(.name as $n | $want | index($n))
           | "  \(.name) -> \(.config["claim.name"]) from \(.config["user.attribute"])"'

echo
echo "done: ${ADDED} added, ${SKIPPED} already present."
echo "Log out and back in to pick up the new claims -- an existing token does not gain them."
