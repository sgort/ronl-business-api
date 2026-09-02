#!/usr/bin/env bash
#
# Adds the RIP realm roles the process models address tasks to, and optionally
# grants them to a user. Idempotent: a role that already exists is left alone,
# and a grant the user already has is not repeated.
#
# WHY THIS EXISTS
# ---------------
# GET /v1/task passes the caller's Keycloak realm roles to Operaton as
# candidateGroups, so a task whose candidate groups all fall outside the
# caller's roles is filtered out before it reaches the client -- not "cannot
# claim", not listed at all. The eleven RIP models address work to 34 candidate
# groups; a realm carrying only the original six leaves 113 of the ladder's 201
# user tasks unreachable. See docs/RIP-ROLE-VOCABULARIES.md for the
# measurement.
#
# Editing config/keycloak/ronl-realm.json fixes a LOCAL Keycloak, because that
# file is imported when one is provisioned. It does nothing for ACC or
# production, which run their own realms. This script is how those get the
# same roles.
#
# WHY NOT A REALM IMPORT
# ----------------------
# Same reason as keycloak-add-token-claim-mappers.sh: partial import with
# policy SKIP skips what already exists, and with OVERWRITE replaces whole
# definitions, discarding whatever the target environment configured by hand.
# The roles endpoint touches nothing but the roles.
#
# THE ROLE LIST IS NOT DUPLICATED HERE. It is read from the realm file, which
# is the source of truth for which roles the ladder needs. A second hand-kept
# list in this script would drift from it the first time a phase is added.
#
#   KEYCLOAK_URL   e.g. https://acc.keycloak.open-regels.nl   (required)
#   REALM          default: ronl
#   ADMIN_USER     default: admin
#   ADMIN_REALM    default: master   (realm the ADMIN account lives in)
#   ADMIN_PASSWORD required (prompted if unset)
#   GRANT_USER     default: test-infra-flevoland; set empty to only create roles
#   ROLES_FILE     default: config/keycloak/ronl-realm.json
#   ROLE_PREFIX    default: rip-
#
# Usage:
#   KEYCLOAK_URL=http://localhost:8080 ADMIN_PASSWORD=admin \
#     bash scripts/keycloak-add-rip-roles.sh
#   KEYCLOAK_URL=http://localhost:8080 ADMIN_PASSWORD=admin \
#     bash scripts/keycloak-add-rip-roles.sh --dry-run
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:?set KEYCLOAK_URL, e.g. https://acc.keycloak.open-regels.nl}"
# A trailing slash yields "https://host//realms/..." which some deployments
# reject outright; strip it rather than rely on the server being tolerant.
KEYCLOAK_URL="${KEYCLOAK_URL%/}"
REALM="${REALM:-ronl}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_REALM="${ADMIN_REALM:-master}"
GRANT_USER="${GRANT_USER-test-infra-flevoland}"
ROLES_FILE="${ROLES_FILE:-$(dirname "$0")/../config/keycloak/ronl-realm.json}"
ROLE_PREFIX="${ROLE_PREFIX:-rip-}"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,46p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

[[ -f "$ROLES_FILE" ]] || { echo "missing $ROLES_FILE" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

# jq on Windows is a native binary writing in text mode: every line it emits
# ends CRLF, so a value read straight into a shell variable carries a trailing
# carriage return. That CR fails string comparisons, builds empty request
# bodies, and rewinds terminal output so names vanish from error lines.
jqr() { jq "$@" | tr -d '\r'; }

# Every request body is written to a file and posted with -d @file, never
# passed as an argv string. Git Bash for Windows corrupts multi-byte UTF-8 on
# its way through argv, and Keycloak rejects the result with a bare
# HTTP 400 Bad Request that names neither the role nor the character.
# Measured here: {"description":"plain ascii"} -> 201, the same body with an
# em dash -> 400, and that identical em-dash body from a file -> 201. Every
# role description below carries an em dash or a diaeresis.
BODY=/tmp/kc-rip-body.json

if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  read -rsp "Keycloak admin password for ${ADMIN_USER}@${KEYCLOAK_URL}: " ADMIN_PASSWORD
  echo
fi

# ── The roles the ladder needs, from the realm file ──────────────────────────
mapfile -t WANTED < <(jqr -r --arg p "$ROLE_PREFIX" \
  '.roles.realm[] | select(.name | startswith($p)) | .name' "$ROLES_FILE" | sort)
[[ ${#WANTED[@]} -gt 0 ]] || { echo "no ${ROLE_PREFIX}* roles in $ROLES_FILE" >&2; exit 1; }

echo "→ ${#WANTED[@]} ${ROLE_PREFIX}* roles defined in $(basename "$ROLES_FILE")"

# ── Admin token ──────────────────────────────────────────────────────────────
TOKEN_URL="${KEYCLOAK_URL}/realms/${ADMIN_REALM}/protocol/openid-connect/token"
echo "→ authenticating as ${ADMIN_USER} against realm ${ADMIN_REALM}"
# --data-urlencode rather than -d for the credentials: curl sends -d values
# raw, so a password containing & + = or % is parsed as form syntax and
# arrives wrong -- indistinguishable from a genuinely wrong password.
TOKEN_CODE=$(curl -sS -o /tmp/kc-roles-token.out -w '%{http_code}' -X POST "$TOKEN_URL" \
  -d "client_id=admin-cli" -d "grant_type=password" \
  --data-urlencode "username=${ADMIN_USER}" \
  --data-urlencode "password=${ADMIN_PASSWORD}" || echo "000")
TOKEN=$(jqr -r '.access_token // empty' /tmp/kc-roles-token.out 2>/dev/null || true)

if [[ -z "$TOKEN" ]]; then
  {
    echo "could not obtain an admin token (HTTP ${TOKEN_CODE})"
    echo "  POST ${TOKEN_URL}"
    echo "  response: $(head -c 400 /tmp/kc-roles-token.out 2>/dev/null)"
    echo
    echo "  401 invalid_grant      -> wrong username/password"
    echo "  404 / realm not found  -> the admin is not in '${ADMIN_REALM}'; try ADMIN_REALM=${REALM}"
    echo "  HTML instead of JSON   -> the URL is not hitting Keycloak directly (proxy/ingress)"
  } >&2
  exit 1
fi
AUTH=(-H "Authorization: Bearer ${TOKEN}")

# Prove the realm is reachable before reporting on roles inside it.
REALM_CODE=$(curl -sS -o /dev/null -w '%{http_code}' "${AUTH[@]}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}")
[[ "$REALM_CODE" == "200" ]] || {
  echo "realm '${REALM}' not reachable (HTTP ${REALM_CODE}) — check REALM and admin rights" >&2
  exit 1
}

# ── Create missing roles ─────────────────────────────────────────────────────
EXISTING=$(curl -sS "${AUTH[@]}" \
  "${KEYCLOAK_URL}/admin/realms/${REALM}/roles?briefRepresentation=true&max=1000" \
  | jqr -r '.[].name' | sort)

CREATED=0 PRESENT=0 FAILED=0
for role in "${WANTED[@]}"; do
  if grep -qxF -- "$role" <<<"$EXISTING"; then
    PRESENT=$((PRESENT + 1))
    continue
  fi
  desc=$(jqr -r --arg n "$role" \
    '.roles.realm[] | select(.name == $n) | .description // ""' "$ROLES_FILE")
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  would create  ${role}"
    CREATED=$((CREATED + 1))
    continue
  fi
  jq -n --arg n "$role" --arg d "$desc" '{name: $n, description: $d}' >"$BODY"
  code=$(curl -sS -o /tmp/kc-role.out -w '%{http_code}' -X POST "${AUTH[@]}" \
    -H 'Content-Type: application/json' \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/roles" -d @"$BODY")
  case "$code" in
    201) echo "  created       ${role}"; CREATED=$((CREATED + 1)) ;;
    409) echo "  already there ${role}"; PRESENT=$((PRESENT + 1)) ;;
    *)   echo "  FAILED        ${role} -> HTTP ${code}: $(head -c 200 /tmp/kc-role.out)" >&2
         FAILED=$((FAILED + 1)) ;;
  esac
done
echo "→ roles: ${CREATED} created, ${PRESENT} already present, ${FAILED} failed"

# ── Grant to a user ──────────────────────────────────────────────────────────
GRANTED=0
if [[ -n "$GRANT_USER" ]]; then
  UID_=$(curl -sS "${AUTH[@]}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/users?username=${GRANT_USER}&exact=true" \
    | jqr -r '.[0].id // empty')
  if [[ -z "$UID_" ]]; then
    echo "user '${GRANT_USER}' not found in realm ${REALM} — roles created, nothing granted" >&2
  else
    HELD=$(curl -sS "${AUTH[@]}" \
      "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${UID_}/role-mappings/realm" \
      | jqr -r '.[].name' | sort)
    # A role representation needs its id, so the grant body is built from the
    # realm's own view of each role rather than from the file.
    MISSING=()
    for role in "${WANTED[@]}"; do
      grep -qxF -- "$role" <<<"$HELD" || MISSING+=("$role")
    done
    if [[ ${#MISSING[@]} -eq 0 ]]; then
      echo "→ ${GRANT_USER} already holds all ${#WANTED[@]} roles"
    elif [[ "$DRY_RUN" == "true" ]]; then
      echo "→ would grant ${#MISSING[@]} role(s) to ${GRANT_USER}: ${MISSING[*]}"
    else
      echo '[]' >"$BODY"
      for role in "${MISSING[@]}"; do
        curl -sS "${AUTH[@]}" "${KEYCLOAK_URL}/admin/realms/${REALM}/roles/${role}" >/tmp/kc-rep.json
        jq -c --slurpfile r /tmp/kc-rep.json \
          '. + [{id: $r[0].id, name: $r[0].name}]' "$BODY" >"${BODY}.tmp"
        mv "${BODY}.tmp" "$BODY"
      done
      code=$(curl -sS -o /tmp/kc-grant.out -w '%{http_code}' -X POST "${AUTH[@]}" \
        -H 'Content-Type: application/json' \
        "${KEYCLOAK_URL}/admin/realms/${REALM}/users/${UID_}/role-mappings/realm" -d @"$BODY")
      if [[ "$code" == "204" ]]; then
        GRANTED=${#MISSING[@]}
        echo "→ granted ${GRANTED} role(s) to ${GRANT_USER}"
      else
        echo "FAILED granting to ${GRANT_USER} -> HTTP ${code}: $(head -c 200 /tmp/kc-grant.out)" >&2
        FAILED=$((FAILED + 1))
      fi
    fi
  fi
fi

# ── Verify, rather than trust the status codes ───────────────────────────────
if [[ "$DRY_RUN" != "true" ]]; then
  AFTER=$(curl -sS "${AUTH[@]}" \
    "${KEYCLOAK_URL}/admin/realms/${REALM}/roles?briefRepresentation=true&max=1000" \
    | jqr -r '.[].name' | sort)
  MISSING_AFTER=()
  for role in "${WANTED[@]}"; do
    grep -qxF -- "$role" <<<"$AFTER" || MISSING_AFTER+=("$role")
  done
  if [[ ${#MISSING_AFTER[@]} -gt 0 ]]; then
    echo "NOT complete: ${#MISSING_AFTER[@]} role(s) still absent: ${MISSING_AFTER[*]}" >&2
    exit 1
  fi
  echo "→ verified: all ${#WANTED[@]} ${ROLE_PREFIX}* roles present in realm ${REALM}"
fi

[[ "$FAILED" -eq 0 ]] || exit 1
echo "Done."
