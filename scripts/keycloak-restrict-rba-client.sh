#!/usr/bin/env bash
#
# Narrows the ronl-business-api client in a live realm to the origins that
# really sign in through it (#188). Until this runs, the client accepts every
# redirect URI ("*") and every web origin ("*"): a signed-in user who follows
# a crafted authorization link is sent back to any site with a code for their
# session, and as a public client with no secret, that code is all it takes.
#
# WHAT IT CHANGES ON THE CLIENT
# -----------------------------
#   redirectUris                  "<origin>/*" for each origin in RBA_ORIGINS
#                                 (+ "<prefix>*" with RBA_PREVIEW_PREFIX)
#   webOrigins                    ["+"]: exactly the origins of those URIs
#                                 (["*"] with RBA_PREVIEW_PREFIX, see PREVIEWS)
#   post.logout.redirect.uris     "+": the same list
#   pkce.code.challenge.method    "S256", only with --enforce-pkce
#
# Nothing else is touched: the client is read, these fields are replaced, and
# the whole representation is written back, so mappers and settings made by
# hand stay as they are.
#
# THE ORDER MATTERS FOR PKCE
# --------------------------
# Run WITHOUT --enforce-pkce first: the allow-list alone closes the hole.
# Add --enforce-pkce on a tier only once the frontend that sends PKCE
# (pkceMethod 'S256' in packages/frontend/src/services/keycloak.ts) is
# deployed there: Keycloak then refuses every sign-in that sends no
# code_challenge, which is every sign-in from an older frontend.
#
# PREVIEWS
# --------
# Keycloak's wildcard matches a prefix, so "https://<slug>-*" also accepts
# "https://<slug>-x.attacker.example/". RBA_ORIGINS therefore never takes a
# wildcard. RBA_PREVIEW_PREFIX adds one deliberately, for ACC only: the
# repository owner accepted that risk on ACC on 16 November 2026 (#188), so
# that pull request previews can sign in. It is refused for the production
# host. It also keeps webOrigins at "*": Keycloak's web origins take no
# pattern, and keycloak-js exchanges the code from the preview's own origin,
# which "+" cannot derive from a wildcard redirect URI.
#
# THE PROBE
# ---------
# After the update the script asks the realm's authorization endpoint, without
# credentials, whether each origin and https://evil.example.com are accepted as
# redirect URI, and whether a request without PKCE is refused. --probe does
# only that, changes nothing and needs no admin password.
#
#   KEYCLOAK_URL    e.g. https://keycloak.open-regels.nl   (required)
#   RBA_ORIGINS     required: exact origins, separated by spaces or commas,
#                   e.g. "https://mijn.open-regels.nl https://gray-glacier-07cf98403.2.azurestaticapps.net"
#   RBA_PREVIEW_PREFIX  ACC only, optional, e.g. "https://ashy-pebble-0d80dbe03-"
#   REALM           default: ronl
#   CLIENT_ID       default: ronl-business-api
#   ADMIN_USER      default: admin
#   ADMIN_REALM     default: master   (realm the ADMIN account lives in)
#   ADMIN_PASSWORD  required for an update (prompted if unset)
#
# Usage:
#   KEYCLOAK_URL=https://keycloak.open-regels.nl RBA_ORIGINS="..." \
#     bash scripts/keycloak-restrict-rba-client.sh [--dry-run | --probe] [--enforce-pkce]
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:?set KEYCLOAK_URL, e.g. https://keycloak.open-regels.nl}"
KEYCLOAK_URL="${KEYCLOAK_URL%/}"
REALM="${REALM:-ronl}"
CLIENT_ID="${CLIENT_ID:-ronl-business-api}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_REALM="${ADMIN_REALM:-master}"
EVIL_ORIGIN="https://evil.example.com"

DRY_RUN=false
PROBE_ONLY=false
ENFORCE_PKCE=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --probe) PROBE_ONLY=true ;;
    --enforce-pkce) ENFORCE_PKCE=true ;;
    -h|--help) sed -n '2,60p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done
if [[ "$DRY_RUN" == "true" && "$PROBE_ONLY" == "true" ]]; then
  echo "--dry-run and --probe exclude each other" >&2
  exit 2
fi

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
# jq on Windows writes CRLF; strip the CR wherever a value lands in a variable.
jqr() { jq "$@" | tr -d '\r'; }

# An origin is scheme://host[:port] and nothing else: no path, no trailing
# slash, and no wildcard (see PREVIEWS above).
ORIGIN_RE='^https?://[^/*[:space:]]+$'
RAW_ORIGINS="${RBA_ORIGINS:-}"
RAW_ORIGINS="${RAW_ORIGINS//$'\r'/}"
ORIGINS=()
for o in ${RAW_ORIGINS//,/ }; do
  [[ "$o" =~ $ORIGIN_RE ]] || {
    echo "not an origin (scheme://host[:port], no path, no wildcard): '${o}'" >&2
    exit 2
  }
  [[ "$o" != "$EVIL_ORIGIN" ]] || { echo "${EVIL_ORIGIN} is the probe's counter-example, not an origin to allow" >&2; exit 2; }
  ORIGINS+=("$o")
done
[[ ${#ORIGINS[@]} -gt 0 ]] || {
  echo "set RBA_ORIGINS, e.g. \"https://mijn.open-regels.nl\"" >&2
  exit 2
}

# Production is recognised by host name, as in keycloak-add-lde-clients.sh
# (#445); a URL with no readable host counts as production (fails closed).
# tr, not ${h,,}: macOS ships bash 3.2.
keycloak_host() {
  [[ "$1" == *://* ]] || return 0
  local h="${1#*://}"
  h="${h%%[/?#]*}"
  h="${h##*@}"
  h="${h%%:*}"
  h="${h%.}"
  printf '%s' "$h" | tr '[:upper:]' '[:lower:]'
}

PREVIEW_PREFIX="${RBA_PREVIEW_PREFIX:-}"
PREVIEW_PREFIX="${PREVIEW_PREFIX//$'\r'/}"
WEB_ORIGINS_JSON='["+"]'
if [[ -n "$PREVIEW_PREFIX" ]]; then
  KC_HOST="$(keycloak_host "$KEYCLOAK_URL")"
  if [[ -z "$KC_HOST" || "$KC_HOST" == "keycloak.open-regels.nl" ]]; then
    echo "RBA_PREVIEW_PREFIX is refused on production (${KEYCLOAK_URL}): no wildcard redirect there" >&2
    exit 2
  fi
  # https://<static web app slug>- and nothing more: the wildcard is added here.
  [[ "$PREVIEW_PREFIX" =~ ^https://[a-z0-9]+(-[a-z0-9]+)*-$ ]] || {
    echo "RBA_PREVIEW_PREFIX must look like https://<slug>-, e.g. https://ashy-pebble-0d80dbe03-: '${PREVIEW_PREFIX}'" >&2
    exit 2
  }
  WEB_ORIGINS_JSON='["*"]'
fi

REDIRECTS_JSON=$(printf '%s\n' "${ORIGINS[@]}" | jq -R . | jq -sc --arg p "$PREVIEW_PREFIX" \
  'map(. + "/*") + (if $p == "" then [] else [$p + "*"] end)')

# narrow <client json>: the client with this script's fields replaced.
narrow() {
  jq -c --argjson r "$REDIRECTS_JSON" --argjson w "$WEB_ORIGINS_JSON" --arg pkce "$ENFORCE_PKCE" '
    .redirectUris = $r
    | .webOrigins = $w
    | .attributes = ((.attributes // {}) + {"post.logout.redirect.uris": "+"})
    | if $pkce == "true" then .attributes["pkce.code.challenge.method"] = "S256" else . end'
}
# fields <client json>: what this script manages, for before/after output.
fields() {
  jq '{redirectUris, webOrigins,
       postLogoutRedirectUris: .attributes["post.logout.redirect.uris"],
       pkce: .attributes["pkce.code.challenge.method"]}'
}

if [[ "$DRY_RUN" == "true" ]]; then
  echo "→ dry run: nothing is sent to ${KEYCLOAK_URL}"
  echo "→ client ${CLIENT_ID} in realm ${REALM} would get:"
  echo '{}' | narrow | fields
  exit 0
fi

# ── The probe ────────────────────────────────────────────────────────────────
AUTH_URL="${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/auth"
PROBE_FAILED=false

# redirect_verdict <origin>: "accepted" or "refused" for "<origin>/" as redirect URI.
# Judged by status, not by the error text: the ronl login theme renders its own
# error page, which does not carry Keycloak's "Invalid parameter: redirect_uri".
# An accepted URI answers 200 (the login page), or 302 when PKCE is required
# and missing (an error sent TO that URI, which is only done for a valid one);
# a refused URI answers 400.
redirect_verdict() {
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --get "$AUTH_URL" \
    --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "response_type=code" \
    --data-urlencode "scope=openid" \
    --data-urlencode "redirect_uri=$1/" || true)
  case "$code" in
    200|302) echo accepted ;;
    400) echo refused ;;
    *) echo "unexpected HTTP ${code}" ;;
  esac
}
# pkce_verdict <origin>: "required" when a request without code_challenge is refused.
pkce_verdict() {
  local location
  location=$(curl -sS -o /dev/null -w '%{redirect_url}' --get "$AUTH_URL" \
    --data-urlencode "client_id=${CLIENT_ID}" \
    --data-urlencode "response_type=code" \
    --data-urlencode "scope=openid" \
    --data-urlencode "redirect_uri=$1/" || true)
  if [[ "$location" == *"error=invalid_request"* ]]; then echo required; else echo "not required"; fi
}
expect_probe() {
  local what="$1" want="$2" got="$3"
  if [[ "$got" == "$want" ]]; then
    printf '  ok      %-60s %s\n' "$what" "$got"
  else
    printf '  WRONG   %-60s %s (expected %s)\n' "$what" "$got" "$want" >&2
    PROBE_FAILED=true
  fi
}
probe() {
  echo "→ probing ${AUTH_URL}"
  local o
  for o in "${ORIGINS[@]}"; do
    expect_probe "redirect ${o}/" accepted "$(redirect_verdict "$o")"
  done
  if [[ -n "$PREVIEW_PREFIX" ]]; then
    local preview="${PREVIEW_PREFIX}1.westeurope.1.azurestaticapps.net"
    expect_probe "redirect ${preview}/" accepted "$(redirect_verdict "$preview")"
  fi
  expect_probe "redirect ${EVIL_ORIGIN}/" refused "$(redirect_verdict "$EVIL_ORIGIN")"
  local want_pkce="not required"
  [[ "$ENFORCE_PKCE" == "true" ]] && want_pkce=required
  expect_probe "PKCE on ${ORIGINS[0]}" "$want_pkce" "$(pkce_verdict "${ORIGINS[0]}")"
  if [[ "$PROBE_FAILED" == "true" ]]; then
    echo "probe: the realm does not behave as expected" >&2
    exit 1
  fi
  echo "probe: as expected"
}

if [[ "$PROBE_ONLY" == "true" ]]; then
  probe
  exit 0
fi

# ── Admin token ──────────────────────────────────────────────────────────────
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
  exit 1
}
# The header reaches curl through a 0600 config file, not argv (#252).
printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" >"$TMPD/auth.cfg"
chmod 600 "$TMPD/auth.cfg"
AUTH=(-K "$TMPD/auth.cfg")
BASE="${KEYCLOAK_URL}/admin/realms/${REALM}"

# ── The client ───────────────────────────────────────────────────────────────
CODE=$(curl -sS -o "$TMPD/clients.json" -w '%{http_code}' "${AUTH[@]}" \
  --get --data-urlencode "clientId=${CLIENT_ID}" "${BASE}/clients" || true)
[[ "$CODE" == "200" ]] || { echo "could not look up client ${CLIENT_ID} -> HTTP ${CODE}" >&2; exit 1; }
[[ "$(jqr 'length' "$TMPD/clients.json")" == "1" ]] || {
  echo "expected exactly one client ${CLIENT_ID} in realm ${REALM}" >&2
  exit 1
}
jq '.[0]' "$TMPD/clients.json" >"$TMPD/before.json"
UUID=$(jqr -r '.id' "$TMPD/before.json")
narrow <"$TMPD/before.json" >"$TMPD/after.json"

echo "→ ${CLIENT_ID} before:"
fields <"$TMPD/before.json"
echo "→ ${CLIENT_ID} after:"
fields <"$TMPD/after.json"

CODE=$(curl -sS -o "$TMPD/out" -w '%{http_code}' -X PUT "${AUTH[@]}" \
  -H 'Content-Type: application/json' "${BASE}/clients/${UUID}" \
  --data-binary @"$TMPD/after.json" || true)
[[ "$CODE" == "204" ]] || {
  echo "update failed -> HTTP ${CODE}: $(head -c 200 "$TMPD/out")" >&2
  exit 1
}
echo "  updated       client ${CLIENT_ID}"

probe
