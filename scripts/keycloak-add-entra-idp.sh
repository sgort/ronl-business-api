#!/usr/bin/env bash
#
# Adds, or updates, the Entra ID identity provider for Provincie Flevoland in
# the ronl realm, with the mappers that give its users their tenant, their
# assurance level and their roles. Keycloak brokers the sign-in: Entra
# authenticates the employee, Keycloak issues the token RBA validates, so the
# backend trusts one issuer as before.
# Design: docs/superpowers/specs/2026-09-28-entra-id-brokered-login-design.md
#
# WHY NOT A REALM IMPORT
# ----------------------
# Same reason as keycloak-add-rip-roles.sh: partial import either skips what
# exists or overwrites whole definitions an environment configured by hand.
# And the provider carries a client secret, which must never enter
# config/keycloak/ronl-realm.json -- so a fresh local --import-realm has no
# Entra provider, and this script is run again after it.
#
# WHAT IT SENDS
# -------------
# The provider and its seven mappers are defined in keycloak-entra-idp.json.
# This script fills in the tenant's endpoints, the client id and the secret.
# A provider or mapper that exists is updated in place, never duplicated, so
# the script is safe to re-run -- which is also how a rotated secret goes in.
#
# THE SECRET
# ----------
# Read from ENTRA_CLIENT_SECRET (prompted when unset). It reaches jq through
# the environment ($ENV), not argv, and reaches curl through a pipe, not a
# file. It is never printed; --dry-run shows it as "<redacted>".
#
#   KEYCLOAK_URL         e.g. https://acc.keycloak.open-regels.nl   (required)
#   REALM                default: ronl
#   ADMIN_USER           default: admin
#   ADMIN_REALM          default: master   (realm the ADMIN account lives in)
#   ADMIN_PASSWORD       required (prompted if unset; not needed for --dry-run)
#   ENTRA_TENANT_ID      required, a GUID
#   ENTRA_CLIENT_ID      required, a GUID
#   ENTRA_CLIENT_SECRET  required (prompted if unset; not needed for --dry-run)
#   IDP_FILE             default: scripts/keycloak-entra-idp.json
#
# Usage:
#   KEYCLOAK_URL=http://localhost:8080 ADMIN_PASSWORD=admin \
#   ENTRA_TENANT_ID=... ENTRA_CLIENT_ID=... ENTRA_CLIENT_SECRET=... \
#     bash scripts/keycloak-add-entra-idp.sh
#   ... bash scripts/keycloak-add-entra-idp.sh --dry-run
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:?set KEYCLOAK_URL, e.g. https://acc.keycloak.open-regels.nl}"
# A trailing slash yields "https://host//realms/..." which some deployments
# reject outright; strip it rather than rely on the server being tolerant.
KEYCLOAK_URL="${KEYCLOAK_URL%/}"
REALM="${REALM:-ronl}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_REALM="${ADMIN_REALM:-master}"
IDP_FILE="${IDP_FILE:-$(dirname "$0")/keycloak-entra-idp.json}"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,46p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[[ -f "$IDP_FILE" ]] || { echo "missing $IDP_FILE" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# jq on Windows is a native binary writing in text mode: every line it emits
# ends CRLF, so a value read straight into a shell variable carries a trailing
# carriage return. Strip it wherever a jq value lands in a variable.
jqr() { jq "$@" | tr -d '\r'; }

# Values pasted from an IT hand-over arrive with stray whitespace -- the
# Flevoland client id came with a leading space -- and a pasted value can
# carry a CR. Keycloak would store either verbatim and the login would fail
# at Entra with an unhelpful "application not found".
trim() {
  local s="${1//$'\r'/}"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}
GUID_RE='^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$'

ENTRA_TENANT_ID="$(trim "${ENTRA_TENANT_ID:?set ENTRA_TENANT_ID (the Entra directory/tenant GUID)}")"
ENTRA_CLIENT_ID="$(trim "${ENTRA_CLIENT_ID:?set ENTRA_CLIENT_ID (the app registration client GUID)}")"
[[ "$ENTRA_TENANT_ID" =~ $GUID_RE ]] || { echo "ENTRA_TENANT_ID is not a GUID: '${ENTRA_TENANT_ID}'" >&2; exit 2; }
[[ "$ENTRA_CLIENT_ID" =~ $GUID_RE ]] || { echo "ENTRA_CLIENT_ID is not a GUID: '${ENTRA_CLIENT_ID}'" >&2; exit 2; }
# Entra issues tokens with the tenant id in lower case, and Keycloak compares
# the token's iss to the configured issuer as an exact string: an upper-case
# paste would be accepted here and then fail every login ("wrong issuer").
ENTRA_TENANT_ID="${ENTRA_TENANT_ID,,}"
ENTRA_CLIENT_ID="${ENTRA_CLIENT_ID,,}"

ALIAS=$(jqr -r '.provider.alias' "$IDP_FILE")
AUTHORITY="https://login.microsoftonline.com/${ENTRA_TENANT_ID}"
REDIRECT_URI="${KEYCLOAK_URL}/realms/${REALM}/broker/${ALIAS}/endpoint"

# The provider representation, with the tenant's endpoints and the client
# filled in. The secret comes from $ENV so it never appears in argv.
provider_json() {
  jq -c \
    --arg issuer "${AUTHORITY}/v2.0" \
    --arg auth "${AUTHORITY}/oauth2/v2.0/authorize" \
    --arg token "${AUTHORITY}/oauth2/v2.0/token" \
    --arg jwks "${AUTHORITY}/discovery/v2.0/keys" \
    --arg cid "$ENTRA_CLIENT_ID" \
    '.provider | .config += {
        issuer: $issuer, authorizationUrl: $auth, tokenUrl: $token,
        jwksUrl: $jwks, clientId: $cid, clientSecret: $ENV.ENTRA_CLIENT_SECRET }' \
    "$IDP_FILE"
}

if [[ "$DRY_RUN" == "true" ]]; then
  export ENTRA_CLIENT_SECRET="<redacted>"
  echo "→ dry run: nothing is sent to ${KEYCLOAK_URL}"
  echo "→ identity provider ${ALIAS} in realm ${REALM}:"
  provider_json | jq .
  echo "→ $(jqr '.mappers | length' "$IDP_FILE") mappers:"
  jqr -r '.mappers[] | "  \(.name)  \(.identityProviderMapper)  \(.config | del(.syncMode) | tostring)"' "$IDP_FILE"
  echo "→ redirect URI to register in Entra (platform Web):"
  echo "  ${REDIRECT_URI}"
  exit 0
fi

if [[ -z "${ENTRA_CLIENT_SECRET:-}" ]]; then
  read -rsp "Entra client secret for ${ENTRA_CLIENT_ID}: " ENTRA_CLIENT_SECRET
  echo
fi
ENTRA_CLIENT_SECRET="$(trim "$ENTRA_CLIENT_SECRET")"
[[ -n "$ENTRA_CLIENT_SECRET" ]] || { echo "ENTRA_CLIENT_SECRET is empty" >&2; exit 2; }
export ENTRA_CLIENT_SECRET

if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  read -rsp "Keycloak admin password for ${ADMIN_USER}@${KEYCLOAK_URL}: " ADMIN_PASSWORD
  echo
fi

# ── Admin token ──────────────────────────────────────────────────────────────
TOKEN_URL="${KEYCLOAK_URL}/realms/${ADMIN_REALM}/protocol/openid-connect/token"
echo "→ authenticating as ${ADMIN_USER} against realm ${ADMIN_REALM}"
# --data-urlencode rather than -d for the credentials: curl sends -d values
# raw, so a password containing & + = or % is parsed as form syntax.
TOKEN_CODE=$(curl -sS -o /tmp/kc-entra-token.out -w '%{http_code}' -X POST "$TOKEN_URL" \
  -d "client_id=admin-cli" -d "grant_type=password" \
  --data-urlencode "username=${ADMIN_USER}" \
  --data-urlencode "password=${ADMIN_PASSWORD}" || echo "000")
TOKEN=$(jqr -r '.access_token // empty' /tmp/kc-entra-token.out 2>/dev/null || true)
rm -f /tmp/kc-entra-token.out

if [[ -z "$TOKEN" ]]; then
  {
    echo "could not obtain an admin token (HTTP ${TOKEN_CODE})"
    echo "  POST ${TOKEN_URL}"
    echo
    echo "  401 invalid_grant      -> wrong username/password"
    echo "  404 / realm not found  -> the admin is not in '${ADMIN_REALM}'; try ADMIN_REALM=${REALM}"
    echo "  HTML instead of JSON   -> the URL is not hitting Keycloak directly (proxy/ingress)"
  } >&2
  exit 1
fi
AUTH=(-H "Authorization: Bearer ${TOKEN}")
BASE="${KEYCLOAK_URL}/admin/realms/${REALM}"

REALM_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$BASE")
[[ "$REALM_CODE" == "200" ]] || {
  echo "realm '${REALM}' not reachable (HTTP ${REALM_CODE}) — check REALM and admin rights" >&2
  exit 1
}

# ── The mapped roles must exist before anything is created ───────────────────
# A claim-to-role mapper pointing at a missing role is accepted by Keycloak and
# then fails every login through it. Check first, so a partial run cannot
# leave a provider whose logins break.
EXISTING_ROLES=$(curl -sS "${AUTH[@]}" "${BASE}/roles?briefRepresentation=true&max=1000" \
  | jqr -r '.[].name' | sort)
MISSING_ROLES=()
while IFS= read -r role; do
  grep -qxF -- "$role" <<<"$EXISTING_ROLES" || MISSING_ROLES+=("$role")
done < <(jqr -r '.mappers[].config.role // empty' "$IDP_FILE" | sort -u)
if [[ ${#MISSING_ROLES[@]} -gt 0 ]]; then
  echo "realm ${REALM} lacks role(s) the mappers grant: ${MISSING_ROLES[*]} — nothing changed" >&2
  exit 1
fi
echo "→ all mapped roles present in realm ${REALM}"

FAILED=0

# ── The provider: create or update ───────────────────────────────────────────
IDP_URL="${BASE}/identity-provider/instances/${ALIAS}"
CODE=$(curl -sS -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$IDP_URL")
if [[ "$CODE" == "200" ]]; then
  code=$(provider_json | curl -sS -o /tmp/kc-entra.out -w '%{http_code}' -X PUT "${AUTH[@]}" \
    -H 'Content-Type: application/json' "$IDP_URL" --data-binary @-)
  [[ "$code" == "204" ]] && echo "  updated       provider ${ALIAS}" \
    || { echo "  FAILED        provider ${ALIAS} -> HTTP ${code}: $(head -c 200 /tmp/kc-entra.out)" >&2; FAILED=$((FAILED + 1)); }
elif [[ "$CODE" == "404" ]]; then
  code=$(provider_json | curl -sS -o /tmp/kc-entra.out -w '%{http_code}' -X POST "${AUTH[@]}" \
    -H 'Content-Type: application/json' "${BASE}/identity-provider/instances" --data-binary @-)
  [[ "$code" == "201" ]] && echo "  created       provider ${ALIAS}" \
    || { echo "  FAILED        provider ${ALIAS} -> HTTP ${code}: $(head -c 200 /tmp/kc-entra.out)" >&2; FAILED=$((FAILED + 1)); }
else
  echo "unexpected HTTP ${CODE} reading provider ${ALIAS}" >&2
  exit 1
fi
[[ "$FAILED" -eq 0 ]] || exit 1

# ── The mappers: create or update, by name ───────────────────────────────────
CURRENT=$(curl -sS "${AUTH[@]}" "${IDP_URL}/mappers")
COUNT=$(jqr '.mappers | length' "$IDP_FILE")
for ((i = 0; i < COUNT; i++)); do
  name=$(jqr -r ".mappers[$i].name" "$IDP_FILE")
  id=$(jqr -r --arg n "$name" '[.[] | select(.name == $n)][0].id // empty' <<<"$CURRENT")
  if [[ -n "$id" ]]; then
    code=$(jq -c --arg a "$ALIAS" --arg id "$id" ".mappers[$i] + {identityProviderAlias: \$a, id: \$id}" "$IDP_FILE" \
      | curl -sS -o /tmp/kc-entra.out -w '%{http_code}' -X PUT "${AUTH[@]}" \
          -H 'Content-Type: application/json' "${IDP_URL}/mappers/${id}" --data-binary @-)
    [[ "$code" == "204" ]] && echo "  updated       mapper ${name}" \
      || { echo "  FAILED        mapper ${name} -> HTTP ${code}: $(head -c 200 /tmp/kc-entra.out)" >&2; FAILED=$((FAILED + 1)); }
  else
    code=$(jq -c --arg a "$ALIAS" ".mappers[$i] + {identityProviderAlias: \$a}" "$IDP_FILE" \
      | curl -sS -o /tmp/kc-entra.out -w '%{http_code}' -X POST "${AUTH[@]}" \
          -H 'Content-Type: application/json' "${IDP_URL}/mappers" --data-binary @-)
    [[ "$code" == "201" ]] && echo "  created       mapper ${name}" \
      || { echo "  FAILED        mapper ${name} -> HTTP ${code}: $(head -c 200 /tmp/kc-entra.out)" >&2; FAILED=$((FAILED + 1)); }
  fi
done
rm -f /tmp/kc-entra.out

# ── Verify, rather than trust the status codes ───────────────────────────────
AFTER=$(curl -sS "${AUTH[@]}" "${IDP_URL}/mappers" | jqr -r '.[].name' | sort)
WANTED=$(jqr -r '.mappers[].name' "$IDP_FILE" | sort)
DUPES=$(uniq -d <<<"$AFTER")
[[ -z "$DUPES" ]] || { echo "duplicate mappers: ${DUPES}" >&2; exit 1; }
while IFS= read -r name; do
  grep -qxF -- "$name" <<<"$AFTER" || { echo "mapper ${name} absent after the run" >&2; FAILED=$((FAILED + 1)); }
done <<<"$WANTED"
[[ "$FAILED" -eq 0 ]] || exit 1

echo "→ verified: provider ${ALIAS} with $(wc -l <<<"$AFTER") mappers in realm ${REALM}"
echo "→ redirect URI that must be registered in Entra (platform Web):"
echo "  ${REDIRECT_URI}"
echo "Done."
