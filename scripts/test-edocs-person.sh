#!/usr/bin/env bash
#
# test-edocs-person.sh — run the eDOCS checks as a person signed in with the
# Flevoland account, with their Keycloak token taken from the clipboard.
#
# The live scripts already accept that token as PERSON_TOKEN (test-edocs-live.sh
# section 1c, test-smoke-live.sh Tier 2c). Getting it there by hand is the hard
# part: this script reads it from the clipboard, checks it, and hands it on. The
# token itself is never printed — only its claims.
#
# Usage:
#   bash scripts/test-edocs-person.sh live  [local|acc]        # test-edocs-live.sh with PERSON_TOKEN
#   bash scripts/test-edocs-person.sh smoke [local|acc|prod]   # test-smoke-live.sh with PERSON_TOKEN
#   bash scripts/test-edocs-person.sh diag  [local|acc]        # quick look, no other checks
#
# The target defaults to local. `diag` asks Keycloak's broker endpoint for the
# person's stored Entra token (status and key names only), then shows what the
# backend makes of the person (/v1/edocs/status → data.user, and the
# /v1/edocs/workspaces answer). On acc the broker answer is the useful half: ACC
# cannot reach the on-premises eDOCS and runs in stub mode.
#
# Getting the token:
#   1. Sign in to RBA with "Inloggen met uw Flevoland-account" (localhost:5173,
#      or acc.mijn.open-regels.nl for acc).
#   2. DevTools → Network → any request to the API's /v1 → right-click →
#      Copy → Copy as cURL (bash). Copying only the Authorization value works too.
#   3. Run this script within the token's lifetime (15 minutes).
#   A PERSON_TOKEN already exported is used as is, and the clipboard is not read.
#
# Optional overrides:
#   BASE_URL / KEYCLOAK_URL   override the target's preset (also passed on to the live scripts)
#   Every other variable the live scripts read (CLIENT_SECRET for acc, CONFIRM_PROD=1
#   for prod, ...) is passed through unchanged.
#
# Needs: curl, jq, base64. The Flevoland network re-signs TLS, which Git Bash's
# curl cannot check for revocation; unless CURL_HOME is set, a temporary
# .curlrc with ssl-revoke-best-effort is used for this run only.

set -u

usage() {
  sed -n '11,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

MODE="${1:-}"
TARGET="$(echo "${2:-local}" | tr '[:upper:]' '[:lower:]')"
case "$MODE" in live | smoke | diag) ;; *) usage ;; esac
case "$MODE:$TARGET" in
  live:local | live:acc | smoke:local | smoke:acc | smoke:prod | diag:local | diag:acc) ;;
  *)
    echo "ERROR: '$MODE' does not run against '$TARGET'."
    usage
    ;;
esac

for tool in curl jq base64; do
  command -v "$tool" >/dev/null || { echo "ERROR: $tool is required."; exit 1; }
done

case "$TARGET" in
  local) DEFAULT_BASE_URL="http://localhost:3002" DEFAULT_KEYCLOAK_URL="http://localhost:8080" ;;
  acc) DEFAULT_BASE_URL="https://acc.api.open-regels.nl" DEFAULT_KEYCLOAK_URL="https://acc.keycloak.open-regels.nl" ;;
  prod) DEFAULT_BASE_URL="https://api.open-regels.nl" DEFAULT_KEYCLOAK_URL="https://keycloak.open-regels.nl" ;;
esac
BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"
KEYCLOAK_URL="${KEYCLOAK_URL:-$DEFAULT_KEYCLOAK_URL}"
REALM="${KEYCLOAK_REALM:-ronl}"

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

# ── The token ─────────────────────────────────────────────────────────────────

read_clipboard() {
  if [[ -r /dev/clipboard ]]; then
    cat /dev/clipboard # Git Bash and Cygwin
  elif command -v pbpaste >/dev/null; then
    pbpaste
  elif command -v xclip >/dev/null; then
    xclip -selection clipboard -o
  else
    echo "ERROR: cannot read the clipboard here; export PERSON_TOKEN instead." >&2
    return 1
  fi
}

TOKEN="${PERSON_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  CLIP="$(read_clipboard | tr -d '\r')" || exit 1
  # From "Copy as cURL": the bearer after the Authorization header.
  TOKEN="$(printf '%s' "$CLIP" | grep -oiE 'authorization: *bearer +[A-Za-z0-9._-]+' | head -1 |
    sed -E 's/^[Aa]uthorization: *[Bb]earer +//')"
  # Otherwise the bare value, with or without "Bearer ".
  [[ -n "$TOKEN" ]] || TOKEN="$(printf '%s' "$CLIP" | tr -d '\n' | sed -E 's/^ *[Bb]earer +//')"
fi
case "$TOKEN" in
  eyJ*.*.*) ;;
  *)
    echo "ERROR: no Keycloak token found (got ${#TOKEN} characters). Copy a /v1 request as cURL (bash) and try again."
    exit 1
    ;;
esac

# The payload only: base64url → base64, padded.
CLAIMS="$(printf '%s' "$TOKEN" | cut -d. -f2 | tr '_-' '/+' |
  { b="$(cat)"; while (( ${#b} % 4 )); do b="$b="; done; printf '%s' "$b"; } |
  base64 -d 2>/dev/null)"
if ! printf '%s' "$CLAIMS" | jq -e . >/dev/null 2>&1; then
  echo "ERROR: the token's payload is not readable JSON."
  exit 1
fi

echo "── Token (claims only)"
printf '%s' "$CLAIMS" | jq '{
  user: .preferred_username, email, azp, iss,
  issued: (.iat | todate), expires: (.exp | todate), expired: (.exp < now),
  broker: .resource_access.broker.roles
}'

if printf '%s' "$CLAIMS" | jq -e '.exp < now' >/dev/null; then
  echo "ERROR: this token has expired. Reload the RBA page, copy a fresh /v1 request and run this again."
  exit 1
fi
ISSUER="$(printf '%s' "$CLAIMS" | jq -r '.iss // ""')"
if [[ "$ISSUER" != "${KEYCLOAK_URL%/}/realms/$REALM" ]]; then
  echo "ERROR: the token was issued by '$ISSUER', not by $TARGET's Keycloak (${KEYCLOAK_URL%/}/realms/$REALM)."
  echo "       Copy the token from the RBA you are testing against."
  exit 1
fi

if [[ -z "${CURL_HOME:-}" ]]; then
  export CURL_HOME="$SCRATCH"
  echo ssl-revoke-best-effort >"$CURL_HOME/.curlrc"
fi

# ── Modes ─────────────────────────────────────────────────────────────────────

if [[ "$MODE" == "diag" ]]; then
  code="$(curl -s -o "$SCRATCH/broker.json" -w '%{http_code}' \
    "${KEYCLOAK_URL%/}/realms/$REALM/broker/entra-flevoland/token" \
    -H "Authorization: Bearer $TOKEN")"
  echo "── Keycloak broker endpoint (the stored Entra token): HTTP $code"
  if [[ "$code" == 2* ]]; then
    # Key names only: the body holds the person's Entra tokens.
    jq -r 'if type == "object" then "   keys: " + (keys | join(", ")) else "   (not JSON)" end' \
      "$SCRATCH/broker.json" 2>/dev/null || echo "   (not JSON)"
  else
    # An error body is Keycloak's own message, never a token.
    echo "   $(head -c 300 "$SCRATCH/broker.json")"
  fi
  echo "── /v1/edocs/status → data.user"
  curl -s "${BASE_URL%/}/v1/edocs/status" -H "Authorization: Bearer $TOKEN" |
    jq '{stubMode: .data.stubMode, user: .data.user, code}'
  echo "── /v1/edocs/workspaces"
  curl -s "${BASE_URL%/}/v1/edocs/workspaces" -H "Authorization: Bearer $TOKEN" |
    jq '{actingAs, count: (.data | if type == "array" then length else null end), status, code, detail}'
  exit 0
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PERSON_TOKEN="$TOKEN" TARGET BASE_URL KEYCLOAK_URL
case "$MODE" in
  live) bash "$REPO/scripts/test-edocs-live.sh" ;;
  smoke) bash "$REPO/scripts/test-smoke-live.sh" ;;
esac
