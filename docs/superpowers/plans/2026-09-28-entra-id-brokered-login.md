# Entra ID sign-in, brokered by Keycloak — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flevoland employees sign in to RBA with their Flevoland M365 account through a Keycloak-brokered Entra ID provider, reached by a primary button on the landing page.

**Architecture:** An idempotent admin-REST script creates the OIDC identity provider `entra-flevoland` in realm `ronl`, with seven mappers that fix the tenant attributes and the assurance level and map four Entra app roles to realm roles. The frontend sends `idpHint: 'entra-flevoland'` through the existing `selected_idp` → `AuthCallback` path. The backend does not change. The docs live in `iou-architectuur`.

**Tech Stack:** Bash + curl + jq (Keycloak 23 admin REST API), React 19 + Vitest + Testing Library (`packages/frontend`), MkDocs (`iou-architectuur`).

**Spec:** `docs/superpowers/specs/2026-09-28-entra-id-brokered-login-design.md`

## Global Constraints

- Identity-provider alias: `entra-flevoland` — exactly this string in the script's JSON, the frontend constant and the redirect URIs.
- Issuer: `https://login.microsoftonline.com/<ENTRA_TENANT_ID>/v2.0`; scopes `openid profile email`; sync mode `FORCE`.
- Hardcoded attributes: `municipality = flevoland`, `organisation_type = province`, `assurance_level = substantieel`.
- Role mapping from the `roles` claim: `IOU_ADMIN` → `admin`, `IOU_USER` → `caseworker`, `IOU_PA` → `public-affairs`, `IOU_INFRA` → `infra-projectteam`.
- The client secret is never committed, never passed as a command-line argument, never printed and never written to a file.
- `config/keycloak/ronl-realm.json` is not changed.
- No backend change.
- Git: work on `feat/entra-id-brokering` in the main checkout (no worktree). **Ask the user before every `git commit`.** Never use `--no-verify`. Never merge into `acc`.
- Tests: hand the user the exact test command and wait for their green before asking to commit.
- Never start, stop or restart a dev server or the local Keycloak container. If the local Keycloak is not running, ask the user to start it.
- `login-portal.css` keeps its existing formatting; do not run prettier on CSS.
- The in-app changelog entry (`changelog-data.ts`) is written by `/bump-release` at release time, not in this plan.

## Review Focus

1. **Stale session keys from an earlier board click.** A user clicks a board card, comes back, then presses the Flevoland button. The leftover `post_login_redirect` and `username_hint` must not steer the Entra login. Pinned in Task 2.
2. **Copy-pasted IDs with whitespace or a carriage return.** The IT hand-over's client ID had a leading space. The script must trim the values and refuse anything that is not a GUID after trimming, rather than creating a provider that fails at login. Pinned in Task 1.
3. **Re-running the script.** A second run must update in place and never duplicate the provider or a mapper. Pinned in Task 1.
4. **A target realm role missing** (e.g. an older ACC realm without `infra-projectteam`). The script must stop before creating anything, naming the missing roles. Pinned in Task 1.
5. **The secret leaking into output.** Neither `--dry-run` nor a real run may print the secret. Pinned in Task 1.

---

### Task 1: The identity-provider definition and provisioning script

**Files:**

- Create: `scripts/keycloak-entra-idp.json`
- Create: `scripts/keycloak-add-entra-idp.sh`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: the realm's identity provider `entra-flevoland`, which Task 2's `FLEVOLAND_IDP` names and Task 3 documents. The script's inputs are `KEYCLOAK_URL`, `REALM`, `ADMIN_USER`, `ADMIN_REALM`, `ADMIN_PASSWORD`, `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `IDP_FILE` and `--dry-run`.

This script follows `scripts/keycloak-add-rip-roles.sh`: the same admin inputs, token acquisition, `jqr` CR stripping and output style. Bash scripts in this repo have no unit tests. Verification is the dry run and the real run against the local Keycloak, with the checks spelled out below.

- [ ] **Step 1: Write the definition file `scripts/keycloak-entra-idp.json`**

```json
{
  "provider": {
    "alias": "entra-flevoland",
    "displayName": "Flevoland (Entra ID)",
    "providerId": "oidc",
    "enabled": true,
    "trustEmail": true,
    "storeToken": false,
    "addReadTokenRoleOnCreate": false,
    "firstBrokerLoginFlowAlias": "first broker login",
    "config": {
      "clientAuthMethod": "client_secret_post",
      "defaultScope": "openid profile email",
      "validateSignature": "true",
      "useJwksUrl": "true",
      "disableUserInfo": "true",
      "pkceEnabled": "true",
      "pkceMethod": "S256",
      "syncMode": "FORCE",
      "backchannelSupported": "false"
    }
  },
  "mappers": [
    {
      "name": "municipality",
      "identityProviderMapper": "hardcoded-attribute-idp-mapper",
      "config": { "syncMode": "FORCE", "attribute": "municipality", "attribute.value": "flevoland" }
    },
    {
      "name": "organisation-type",
      "identityProviderMapper": "hardcoded-attribute-idp-mapper",
      "config": {
        "syncMode": "FORCE",
        "attribute": "organisation_type",
        "attribute.value": "province"
      }
    },
    {
      "name": "assurance-level",
      "identityProviderMapper": "hardcoded-attribute-idp-mapper",
      "config": {
        "syncMode": "FORCE",
        "attribute": "assurance_level",
        "attribute.value": "substantieel"
      }
    },
    {
      "name": "role-iou-admin",
      "identityProviderMapper": "oidc-role-idp-mapper",
      "config": {
        "syncMode": "FORCE",
        "claim": "roles",
        "claim.value": "IOU_ADMIN",
        "role": "admin"
      }
    },
    {
      "name": "role-iou-user",
      "identityProviderMapper": "oidc-role-idp-mapper",
      "config": {
        "syncMode": "FORCE",
        "claim": "roles",
        "claim.value": "IOU_USER",
        "role": "caseworker"
      }
    },
    {
      "name": "role-iou-pa",
      "identityProviderMapper": "oidc-role-idp-mapper",
      "config": {
        "syncMode": "FORCE",
        "claim": "roles",
        "claim.value": "IOU_PA",
        "role": "public-affairs"
      }
    },
    {
      "name": "role-iou-infra",
      "identityProviderMapper": "oidc-role-idp-mapper",
      "config": {
        "syncMode": "FORCE",
        "claim": "roles",
        "claim.value": "IOU_INFRA",
        "role": "infra-projectteam"
      }
    }
  ]
}
```

Notes for the implementer:

- `disableUserInfo` is `true` because Entra's userinfo endpoint lives on Microsoft Graph. Everything the mappers need (`roles`, `email`, `given_name`, `family_name`) is in the ID token.
- `oidc-role-idp-mapper` matches when the claim is an array containing the value, which is how Entra emits `roles`.
- Keycloak 23's default "first broker login" flow shows the review-profile form only when a required attribute is missing. With `email`, `given_name` and `family_name` in the ID token, a first login creates the user silently. No flow change is needed.

- [ ] **Step 2: Write `scripts/keycloak-add-entra-idp.sh`**

```bash
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
ENTRA_CLIENT_ID="$(trim "${ENTRA_CLIENT_ID:?set ENTRA_CLIENT_ID (the app registration's client GUID)}")"
[[ "$ENTRA_TENANT_ID" =~ $GUID_RE ]] || { echo "ENTRA_TENANT_ID is not a GUID: '${ENTRA_TENANT_ID}'" >&2; exit 2; }
[[ "$ENTRA_CLIENT_ID" =~ $GUID_RE ]] || { echo "ENTRA_CLIENT_ID is not a GUID: '${ENTRA_CLIENT_ID}'" >&2; exit 2; }

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
```

Make it executable: `git update-index --chmod=+x` happens at staging in Step 8.

- [ ] **Step 3: Syntax check**

Run: `bash -n scripts/keycloak-add-entra-idp.sh && jq empty scripts/keycloak-entra-idp.json && echo OK`
Expected: `OK`

- [ ] **Step 4: Dry run, with the secret-leak and whitespace checks (Review Focus 2 and 5)**

The client ID deliberately carries the leading space from the IT hand-over, and a fake secret is set to prove it is not printed:

```bash
KEYCLOAK_URL=http://localhost:8080 \
ENTRA_TENANT_ID=95f3a7d8-730c-4f35-a909-867d3fbde8fe \
ENTRA_CLIENT_ID=" ef967eb0-3902-408f-8161-4e294c826473" \
ENTRA_CLIENT_SECRET=leak-canary-123 \
  bash scripts/keycloak-add-entra-idp.sh --dry-run | tee /tmp/entra-dry.out
grep -c leak-canary /tmp/entra-dry.out
```

Expected:

- The provider JSON shows `"clientId": "ef967eb0-3902-408f-8161-4e294c826473"` with no leading space, `"clientSecret": "<redacted>"`, and `issuer` `https://login.microsoftonline.com/95f3a7d8-730c-4f35-a909-867d3fbde8fe/v2.0`.
- Seven mapper lines are listed.
- The redirect URI is `http://localhost:8080/realms/ronl/broker/entra-flevoland/endpoint`.
- `grep -c` prints `0`.

Then the invalid-ID refusal:

```bash
KEYCLOAK_URL=http://localhost:8080 ENTRA_TENANT_ID=95f3a7d8 ENTRA_CLIENT_ID=x \
  bash scripts/keycloak-add-entra-idp.sh --dry-run; echo "exit=$?"
```

Expected: `ENTRA_TENANT_ID is not a GUID: '95f3a7d8'` and `exit=2`.

- [ ] **Step 5: Missing-role refusal against the local Keycloak (Review Focus 4)**

Precondition: the local Keycloak (`docker compose` service `keycloak`) is running. If `curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/realms/ronl` does not print `200`, stop and ask the user to start it. Do not start it yourself.

```bash
jq '.mappers[3].config.role = "no-such-role"' scripts/keycloak-entra-idp.json > /tmp/entra-bad.json
KEYCLOAK_URL=http://localhost:8080 ADMIN_PASSWORD=admin IDP_FILE=/tmp/entra-bad.json \
ENTRA_TENANT_ID=95f3a7d8-730c-4f35-a909-867d3fbde8fe \
ENTRA_CLIENT_ID=ef967eb0-3902-408f-8161-4e294c826473 ENTRA_CLIENT_SECRET=dummy \
  bash scripts/keycloak-add-entra-idp.sh; echo "exit=$?"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/realms/ronl/broker/entra-flevoland/endpoint
```

Expected:

- `realm ronl lacks role(s) the mappers grant: no-such-role — nothing changed` and `exit=1`.
- The broker endpoint answers `404`, because no provider was created. (If the local admin password is not `admin`, ask the user for it.)

- [ ] **Step 6: Real run, then a second run (Review Focus 3). This step needs the user.**

Ask the user to run it with the real secret in their own shell. The secret stays with them:

```bash
KEYCLOAK_URL=http://localhost:8080 ADMIN_PASSWORD=admin \
ENTRA_TENANT_ID=95f3a7d8-730c-4f35-a909-867d3fbde8fe \
ENTRA_CLIENT_ID=ef967eb0-3902-408f-8161-4e294c826473 \
  bash scripts/keycloak-add-entra-idp.sh
```

It prompts for the secret. Expected on the first run: `created provider entra-flevoland`, seven `created mapper …` lines, and `verified: provider entra-flevoland with 7 mappers`.

Run it a second time. Expected: `updated provider entra-flevoland`, seven `updated mapper …` lines, and again `with 7 mappers`, with no duplicates.

- [ ] **Step 7: Check that the button shows on the Keycloak login page**

Ask the user to open `http://localhost:8080/realms/ronl/account` in a private window. The Keycloak login page must show a **"Flevoland (Entra ID)"** button under the form. Clicking it goes to `login.microsoftonline.com`. Whether the login completes depends on Flevoland IT having registered the localhost redirect URI (spec, "The Entra side", item 1). That is the acceptance test after Task 2.

- [ ] **Step 8: Stage and ask to commit**

```bash
git add scripts/keycloak-entra-idp.json scripts/keycloak-add-entra-idp.sh
git update-index --chmod=+x scripts/keycloak-add-entra-idp.sh
git status --short
```

Report what is staged and ask the user before committing. Proposed message:

```
feat(keycloak): add a script that brokers Flevoland's Entra ID through Keycloak

scripts/keycloak-add-entra-idp.sh creates or updates the OIDC identity
provider entra-flevoland in realm ronl, with mappers that set
municipality=flevoland, organisation_type=province and
assurance_level=substantieel, and map the Entra app roles IOU_ADMIN,
IOU_USER, IOU_PA and IOU_INFRA to admin, caseworker, public-affairs and
infra-projectteam. It is idempotent, checks the mapped roles exist before
creating anything, and never prints or stores the client secret.
```

---

### Task 2: The "Inloggen met uw Flevoland-account" button

**Files:**

- Create: `packages/frontend/src/services/identity-providers.ts`
- Modify: `packages/frontend/src/pages/LoginChoice.tsx` (imports; `startCitizenLogin` at :26-33; hero actions at :80-113)
- Modify: `packages/frontend/src/pages/login-choice/login-portal.css` (after `.lcp .btn-primary:hover`, :164)
- Modify: `packages/frontend/src/pages/AuthCallback.tsx` (doc comment at :72-75 only)
- Test: `packages/frontend/src/pages/LoginChoice.test.tsx`
- Test: `packages/frontend/src/pages/AuthCallback.test.tsx`

**Interfaces:**

- Consumes: the alias `entra-flevoland` created by Task 1 (a string contract, not an import).
- Produces: `export const FLEVOLAND_IDP = 'entra-flevoland';` from `services/identity-providers.ts`.

**Deviation from the spec:** the spec puts `FLEVOLAND_IDP` in `services/keycloak.ts`. That module constructs a `keycloak-js` instance on import, and `LoginChoice` (and its test) would then import keycloak-js just to read a string. A dependency-free module `services/identity-providers.ts` keeps it the one place the alias is named, without that import.

- [ ] **Step 1: Write the failing tests in `LoginChoice.test.tsx`**

First make the existing header test exact. After this change a second button, "Inloggen met uw Flevoland-account", also matches `/Inloggen/`, and `getByRole` would throw on two matches. In the test `the header "Inloggen" link starts a medewerker login…`, replace

```tsx
await user.click(screen.getByRole('button', { name: /Inloggen/ }));
```

with

```tsx
await user.click(screen.getByRole('button', { name: 'Inloggen' }));
```

Then add these tests inside `describe('LoginChoice', …)`, after the DigiD test:

```tsx
it('the Flevoland button starts an Entra ID login and navigates to /auth', async () => {
  const user = userEvent.setup();
  render(<LoginChoice />);

  await user.click(screen.getByRole('button', { name: /Inloggen met uw Flevoland-account/ }));

  expect(sessionStorage.getItem('selected_idp')).toBe('entra-flevoland');
  expect(mockNavigate).toHaveBeenCalledWith('/auth');
});

it('the Flevoland button clears a redirect and username hint left by an earlier board click', async () => {
  sessionStorage.setItem('post_login_redirect', '/dashboard/woo');
  sessionStorage.setItem('username_hint', 'test-woo-flevoland');
  const user = userEvent.setup();
  render(<LoginChoice />);

  await user.click(screen.getByRole('button', { name: /Inloggen met uw Flevoland-account/ }));

  expect(sessionStorage.getItem('post_login_redirect')).toBeNull();
  expect(sessionStorage.getItem('username_hint')).toBeNull();
  expect(sessionStorage.getItem('selected_idp')).toBe('entra-flevoland');
});

it('"Bekijk de borden" remains as a link to the boards section', () => {
  render(<LoginChoice />);

  expect(screen.getByRole('link', { name: 'Bekijk de borden' })).toHaveAttribute('href', '#boards');
});
```

- [ ] **Step 2: Add the AuthCallback characterisation test**

In `AuthCallback.test.tsx`, after the test `citizen flow calls keycloak.login with the selected idp when not authenticated`:

```tsx
it('Flevoland flow calls keycloak.login with the entra-flevoland idp hint when not authenticated', async () => {
  sessionStorage.setItem('selected_idp', 'entra-flevoland');
  mockKeycloak.init.mockResolvedValue(false);

  render(<AuthCallback />);

  await vi.waitFor(() =>
    expect(mockKeycloak.login).toHaveBeenCalledWith({ idpHint: 'entra-flevoland' })
  );
});
```

This test passes without a code change: it pins that the existing non-medewerker branch carries the new alias through.

- [ ] **Step 3: Run the tests to see the LoginChoice ones fail**

Run: `npx vitest run src/pages/LoginChoice.test.tsx src/pages/AuthCallback.test.tsx` (from `packages/frontend`)
Expected: the two new Flevoland-button tests FAIL (no button named "Inloggen met uw Flevoland-account"). The "Bekijk de borden" test already passes, because the link exists today; it guards against the link being dropped. All AuthCallback tests PASS.

- [ ] **Step 4: Create `packages/frontend/src/services/identity-providers.ts`**

```ts
/**
 * Keycloak identity-provider aliases the frontend sends as `idpHint`.
 *
 * `entra-flevoland` must match the provider scripts/keycloak-add-entra-idp.sh
 * creates in the realm, and the redirect URI registered in Flevoland's Entra
 * app registration embeds it too — renaming it means changing all three.
 *
 * Kept in a module of its own so the landing page can name it without
 * importing keycloak-js.
 */
export const FLEVOLAND_IDP = 'entra-flevoland';
```

- [ ] **Step 5: Change `LoginChoice.tsx`**

Add the import after the `BoardCard` import:

```tsx
import { FLEVOLAND_IDP } from '../services/identity-providers';
```

Replace `startCitizenLogin` (lines 26-33) with:

```tsx
function startIdpLogin(idp: 'digid' | 'eherkenning' | 'eidas' | typeof FLEVOLAND_IDP) {
  try {
    // A board click stores a redirect and a test-user hint before the user
    // may come back and choose an identity provider instead. Neither belongs
    // to this login: the landing page follows the role Entra/DigiD grants.
    sessionStorage.removeItem(POST_LOGIN_KEY);
    sessionStorage.removeItem('username_hint');
    sessionStorage.setItem('selected_idp', idp);
  } catch {
    /* non-fatal */
  }
  navigate('/auth');
}
```

Update the DigiD link's handler from `startCitizenLogin('digid')` to `startIdpLogin('digid')`.

Replace the whole `<div className="hero-actions">…</div>` block (lines 80-113) with:

```tsx
<div className="hero-actions">
  <button type="button" className="btn-primary" onClick={() => startIdpLogin(FLEVOLAND_IDP)}>
    Inloggen met uw Flevoland-account
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  </button>
  <a className="btn-secondary" href="#boards">
    Bekijk de borden
  </a>
  <span className="hero-note">
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
    Met het account waarmee u op uw werkplek bent aangemeld
  </span>
</div>
```

Clearing the stale keys also applies to the DigiD link. That is intended: the same stale-hint problem applies there.

- [ ] **Step 6: Add the styles to `login-portal.css`**

Insert after the line `.lcp .btn-primary:hover { … }` (line 164), in the file's existing style. Do not run prettier on this file. The file writes short rules on one line (like `.lcp .btn-primary:hover { … }`). Write `.lcp button.btn-primary` and `.lcp .btn-secondary:hover` that way; the formatter of this plan expanded them below:

```css
.lcp button.btn-primary {
  border: 0;
  cursor: pointer;
  font-family: inherit;
}

.lcp .btn-secondary {
  font-size: 15px;
  font-weight: 600;
  color: var(--blue);
  text-decoration: none;
  padding: 13px 4px;
}

.lcp .btn-secondary:hover {
  color: var(--blue-700);
  text-decoration: underline;
}
```

- [ ] **Step 7: Update the `AuthCallback.tsx` doc comment**

Replace

```
 * Citizen flows (digid / eherkenning / eidas):
 *   Not authenticated → keycloak.login({ idpHint }) redirects to the
 *   external IdP. In dev (no real IdPs configured) it falls back to the
 *   native login form without a context banner.
```

with

```
 * External-IdP flows (digid / eherkenning / eidas / entra-flevoland):
 *   Not authenticated → keycloak.login({ idpHint }) redirects to the
 *   external IdP. entra-flevoland is Provincie Flevoland's Entra ID, brokered
 *   by Keycloak (scripts/keycloak-add-entra-idp.sh). Where the hinted
 *   provider is not configured, Keycloak falls back to its native login form
 *   without a context banner.
```

- [ ] **Step 8: Run the focused tests, type-check and lint**

From `packages/frontend`:
Run: `npx vitest run src/pages/LoginChoice.test.tsx src/pages/AuthCallback.test.tsx`
Expected: all PASS.
Run: `npm run type-check && npm run lint`
Expected: no errors.

- [ ] **Step 9: Hand the full suite to the user**

Ask the user to run `npm test --workspace=@ronl/frontend` and report the result. Wait for their green. Then ask them to look at `http://localhost:5173/` in the running dev server:

- the primary button reads "Inloggen met uw Flevoland-account";
- "Bekijk de borden" sits next to it as a link.

Once Flevoland IT has registered the localhost redirect URI, the acceptance test is:

- click the button, arrive at Microsoft, sign in (on the Flevoland laptop, silently);
- land on the dashboard for the role;
- in DevTools, `JSON.parse(atob(keycloak.token.split('.')[1]))` shows `municipality: "flevoland"`, `organisation_type: "province"`, `loa: "substantieel"` and the mapped `realm_access.roles`.

Do not drive a browser yourself.

- [ ] **Step 10: Stage and ask to commit**

```bash
git add packages/frontend/src/services/identity-providers.ts \
  packages/frontend/src/pages/LoginChoice.tsx packages/frontend/src/pages/LoginChoice.test.tsx \
  packages/frontend/src/pages/AuthCallback.tsx packages/frontend/src/pages/AuthCallback.test.tsx \
  packages/frontend/src/pages/login-choice/login-portal.css
git status --short
```

Report what is staged and ask the user before committing. Proposed message:

```
feat(frontend): sign in with a Flevoland account from the landing page

The hero's primary action becomes "Inloggen met uw Flevoland-account",
which sends idpHint entra-flevoland through the existing AuthCallback
path, so Keycloak goes straight to Entra ID. "Bekijk de borden" stays as
a secondary link. Choosing an identity provider now clears a redirect
and username hint left by an earlier board click.
```

---

### Task 3: Documentation in `iou-architectuur`

**Files** (all under `C:\Users\gorts01\Development\iou-architectuur\`):

- Create: `docs/en/ronl-business-api/developer/deployment/entra-id.md`
- Create: `docs/nl/ronl-business-api/developer/deployment/entra-id.md`
- Modify: `docs/en/ronl-business-api/features/authentication-iam.md:16`, and the same bullet in the NL counterpart
- Modify: `docs/en/ronl-business-api/reference/keycloak-realm.md` (new section before `## Realm roles`), and the NL counterpart
- Modify: `docs/en/ronl-business-api/reference/jwt-claims.md` (paragraph after the custom-claims table), and the NL counterpart
- Modify: `mkdocs.yml:179` (nav)

**Interfaces:**

- Consumes: the script name, env vars, alias, mappers and redirect URIs from Task 1; the button text from Task 2.
- Produces: nothing code depends on.

- [ ] **Step 1: Branch in the docs repo**

```bash
cd /c/Users/gorts01/Development/iou-architectuur
git status --short   # must be clean; if not, stop and report
git switch acc && git pull --ff-only && git switch -c docs/rba-entra-id
```

- [ ] **Step 2: Write `docs/en/ronl-business-api/developer/deployment/entra-id.md`**

````markdown
---
component: RONL Business API
---

# Entra ID (Provincie Flevoland)

Employees of Provincie Flevoland sign in to RBA with their Flevoland M365 account. Keycloak brokers the sign-in: the browser goes to Entra ID, Entra authenticates the employee (with MFA, required by Flevoland's conditional-access policy), and Keycloak issues the token RBA validates. The backend still trusts one issuer — Keycloak — and did not change.

---

## What the employee sees

The landing page's primary button, **Inloggen met uw Flevoland-account**, sends the browser through Keycloak straight to Microsoft. On a Flevoland-managed Windows laptop, Entra signs the employee in with the account the device is joined to, usually without a prompt. This works natively in Edge; Chrome needs the Windows Accounts extension, Firefox the "Allow Windows single sign-on" setting. The Keycloak login page also shows a **Flevoland (Entra ID)** button, as a fallback.

After sign-in the employee lands on the dashboard for their role.

---

## The Entra side

Flevoland IT owns the app registration **IOU-demonstrator**.

| Setting                  | Value                                  |
| ------------------------ | -------------------------------------- |
| Tenant ID                | `95f3a7d8-730c-4f35-a909-867d3fbde8fe` |
| Application (client) ID  | `ef967eb0-3902-408f-8161-4e294c826473` |
| Platform                 | Web                                    |
| Optional ID-token claims | `email`, `given_name`, `family_name`   |
| Assignment required      | Yes                                    |

Redirect URIs, one per Keycloak:

| Environment | Redirect URI                                                                      |
| ----------- | --------------------------------------------------------------------------------- |
| Local       | `http://localhost:8080/realms/ronl/broker/entra-flevoland/endpoint`               |
| ACC         | `https://acc.keycloak.open-regels.nl/realms/ronl/broker/entra-flevoland/endpoint` |
| PROD        | `https://keycloak.open-regels.nl/realms/ronl/broker/entra-flevoland/endpoint`     |

Access is granted through Entra groups, each assigned one app role:

| Entra group                               | App role    | RBA realm role      |
| ----------------------------------------- | ----------- | ------------------- |
| `flv-role-iou-poc-admin`                  | `IOU_ADMIN` | `admin`             |
| `flv-role-iou-poc-user`                   | `IOU_USER`  | `caseworker`        |
| `Flv-role-IOU-publicAffairs-contributors` | `IOU_PA`    | `public-affairs`    |
| `Flv-role-IOU-infra-contributors`         | `IOU_INFRA` | `infra-projectteam` |

An employee in none of the groups cannot sign in: Entra refuses before Keycloak is involved.

---

## The Keycloak side

The identity provider `entra-flevoland` in realm `ronl` is created by `scripts/keycloak-add-entra-idp.sh`, from the definition in `scripts/keycloak-entra-idp.json`. It is not in the realm export, because it carries a client secret.

Its mappers run on every login (sync mode `FORCE`):

| Mapper                                                             | Effect                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `municipality`                                                     | `municipality = flevoland`                                                        |
| `organisation-type`                                                | `organisation_type = province`                                                    |
| `assurance-level`                                                  | `assurance_level = substantieel`                                                  |
| `role-iou-admin`, `role-iou-user`, `role-iou-pa`, `role-iou-infra` | Add the realm role while the Entra app role is present; remove it once it is gone |

Roles assigned by hand in Keycloak — `pa-author`, `pa-editor`, `pa-admin`, the `rip-*` groups — are not touched by the mappers. Assign them to the brokered user after their first login.

---

## Running the script

The script is idempotent: it creates what is missing and updates what exists. Re-running it is also how a rotated secret goes in.

```bash
KEYCLOAK_URL=https://acc.keycloak.open-regels.nl \
ENTRA_TENANT_ID=95f3a7d8-730c-4f35-a909-867d3fbde8fe \
ENTRA_CLIENT_ID=ef967eb0-3902-408f-8161-4e294c826473 \
  bash scripts/keycloak-add-entra-idp.sh
```

It prompts for the Keycloak admin password and the Entra client secret. The secret is never printed or written to disk. `--dry-run` shows what would be sent, with the secret redacted, without contacting Keycloak.

Before creating anything the script checks that the four mapped realm roles exist, and stops with their names if one is missing.

Locally, run it again after every fresh `--import-realm`.

---

## Rotating the client secret

Flevoland IT issues a new secret before the current one expires. Run the script again with the new secret; it updates the provider in place. Logins fail from the moment the old secret expires until the new one is in.

---

## Troubleshooting

| Symptom                                                                 | Cause                                                                                                                   |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Microsoft shows `AADSTS50011` (redirect URI mismatch)                   | The environment's redirect URI is not registered on the app registration. The script prints the exact URI               |
| Microsoft shows `AADSTS50105` (not assigned)                            | The employee is in none of the four groups                                                                              |
| Keycloak: "Unexpected error when authenticating with identity provider" | Usually an expired or wrong client secret; re-run the script with the current one                                       |
| Signed in, but `403 INSUFFICIENT_ASSURANCE`                             | The `assurance-level` mapper is missing; re-run the script                                                              |
| Signed in, but no tasks or dashboard                                    | The employee's Entra group gives a role that is not the one the dashboard needs; check the token's `realm_access.roles` |
| Several Microsoft accounts in the browser                               | Entra shows its account picker; choose the Flevoland account                                                            |

---

## Related

- [Keycloak (VM)](keycloak.md)
- [Authentication & IAM](../../features/authentication-iam.md)
- [Keycloak Realm Configuration](../../reference/keycloak-realm.md)
````

- [ ] **Step 3: Write the NL page `docs/nl/ronl-business-api/developer/deployment/entra-id.md`**

Translate the EN page from Step 2 into Dutch, with the same sections, tables, code blocks, links and front matter. Title: `# Entra ID (Provincie Flevoland)`. Section headings: "Wat de medewerker ziet", "De Entra-kant", "De Keycloak-kant", "Het script draaien", "Het clientsecret vervangen", "Problemen oplossen", "Gerelateerd". Keep identifiers, role names, URIs and error codes unchanged.

- [ ] **Step 4: Update `authentication-iam.md` (EN) line 16**

Replace the bullet starting "Keycloak can act as an identity broker…" with:

```markdown
- Keycloak can act as an identity broker for an external provider: the browser is redirected to the provider, the provider returns a signed assertion, and Keycloak validates it and issues its own token. Employees of Provincie Flevoland sign in this way through Entra ID (the `entra-flevoland` provider): Keycloak sets their tenant and assurance level and maps their Entra app roles to realm roles — see [Entra ID](../developer/deployment/entra-id.md). The realm export also defines `digid` and `eidas` as SAML providers, both disabled and pointing at placeholder endpoints; it defines no eHerkenning provider. Where the hinted provider is not available, Keycloak shows its own login form.
```

Make the same change to the matching bullet in `docs/nl/ronl-business-api/features/authentication-iam.md`, in Dutch, linking to `../developer/deployment/entra-id.md`.

- [ ] **Step 5: Add the identity-provider section to `keycloak-realm.md` (EN)**

Insert before `## Realm roles`:

```markdown
## Identity provider: `entra-flevoland`

An OIDC provider for Provincie Flevoland's Entra ID, configured by `scripts/keycloak-add-entra-idp.sh` rather than by the realm export, because it carries a client secret. Its mappers set `municipality = flevoland`, `organisation_type = province` and `assurance_level = substantieel`, and map the Entra app roles `IOU_ADMIN`, `IOU_USER`, `IOU_PA` and `IOU_INFRA` to `admin`, `caseworker`, `public-affairs` and `infra-projectteam`, on every login. See [Entra ID](../developer/deployment/entra-id.md).

---
```

Add the Dutch equivalent before the realm-roles section of `docs/nl/ronl-business-api/reference/keycloak-realm.md`.

- [ ] **Step 6: Add a paragraph to `jwt-claims.md` (EN)**

Insert after the paragraph starting "The client maps no `bsn` claim.":

```markdown
For an employee who signs in through Entra ID (the `entra-flevoland` provider), the same client mappers produce the same claims. The values behind them come from identity-provider mappers instead of hand-set user attributes: `municipality` is `flevoland`, `organisation_type` is `province`, `loa` is `substantieel`, and `realm_access.roles` includes the roles mapped from the Entra app roles. `sub` is the Keycloak user's own id, not Entra's. See [Entra ID](../developer/deployment/entra-id.md).
```

Add the Dutch equivalent at the same place in `docs/nl/ronl-business-api/reference/jwt-claims.md`.

- [ ] **Step 7: Add the page to the nav in `mkdocs.yml`**

After line 179 (`- Keycloak (VM): ronl-business-api/developer/deployment/keycloak.md`) add:

```yaml
- Entra ID (Flevoland): ronl-business-api/developer/deployment/entra-id.md
```

- [ ] **Step 8: Build strictly**

Run: `venv/Scripts/mkdocs.exe build --strict` (from `iou-architectuur`)
Expected: the build succeeds with no warnings about the new or changed pages (broken links fail a strict build).

- [ ] **Step 9: Stage and ask to commit**

```bash
git add mkdocs.yml docs/en/ronl-business-api docs/nl/ronl-business-api
git status --short
```

Only the nine files from this task may be staged. Report them and ask the user before committing. Proposed message:

```
docs(rba): document Entra ID sign-in for Provincie Flevoland

New runbook developer/deployment/entra-id.md (EN and NL): the Entra app
registration, redirect URIs, group-to-role mapping, the provisioning
script, secret rotation and troubleshooting. Authentication & IAM, the
realm reference and the JWT claims page describe the brokered provider.
```

---

## After the tasks

- Opening pull requests (RBA `feat/entra-id-brokering` → `acc`; `iou-architectuur` `docs/rba-entra-id` → `acc`) happens only when the user asks. Never merge them.
- ACC rollout (running the script against `https://acc.keycloak.open-regels.nl`) is done by the user after the RBA pull request merges and Flevoland IT has registered the ACC redirect URI.
