#!/usr/bin/env bash
# test-smoke-live.sh
# Thin, gated live smoke test of the critical CROSS-APP seams that the Jest unit
# suite deliberately mocks out — the backend's real links to Operaton, Keycloak,
# the Linked Data Explorer, TriplyDB (SPARQL), CPRMV, the media store, eDOCS and
# the MCP provider layer.
#
# This is a developer / pre-deploy check. It is NOT wired into `npm test` and hits
# running services over the network. It never mutates anything — the eDOCS check
# is status-only (the mutating workspace/upload path lives in test-edocs-live.sh).
#
# ── Usage ─────────────────────────────────────────────────────────────────────
#   bash scripts/test-smoke-live.sh                     # localhost: full run
#   CLIENT_SECRET=<secret> bash scripts/test-smoke-live.sh          # explicit creds
#   TARGET=acc CLIENT_SECRET=<secret> bash scripts/test-smoke-live.sh   # acc env
#
# On TARGET=local, Tier 2 credentials are taken from KEYCLOAK_CLIENT_ID /
# KEYCLOAK_CLIENT_SECRET in packages/backend/.env.<NODE_ENV> when CLIENT_SECRET is
# not already set, so a plain `bash scripts/test-smoke-live.sh` runs everything.
#
# eDOCS gets TWO checks: 1/2 direct (in-process, packages/backend/.env, no
# Keycloak — always runs) and 2/2 JWT-gated (running backend via /v1/edocs/status,
# needs CLIENT_SECRET). Comparing them exposes backend-vs-.env config drift.
#
# ── Config ────────────────────────────────────────────────────────────────────
#   TARGET=local|acc     picks a preset pair of URLs (default: local)
#                          local → http://localhost:3002  + http://localhost:8080
#                          acc   → https://acc.api.open-regels.nl
#                                  + https://acc.keycloak.open-regels.nl
#   BASE_URL / KEYCLOAK_URL   set either explicitly to override the TARGET preset
#   Tier 2a — CLIENT flow (M2M) → eDOCS 2/2 gated status:
#     CLIENT_ID          confidential client (default: .env KEYCLOAK_CLIENT_ID on
#                          local, else operaton-mcp-client)
#     CLIENT_SECRET      its secret; on local, auto-loaded from .env
#                          KEYCLOAK_CLIENT_SECRET when not exported
#   Tier 2b — USER flow (role) → MCP /sources:
#     USER_CLIENT_ID     public client for the password grant (default: ronl-business-api)
#     SMOKE_USER         role-bearing user (default: test-caseworker-flevoland)
#     SMOKE_PASSWORD     its password; on local, auto-loaded from .env
#                          SMOKE_TEST_PASSWORD when not exported
#   NODE_ENV             picks the .env for creds + the eDOCS probe (default: development)
#   PYTHON_MCP_POC_URL   MCP streamable-HTTP endpoint for the local Python MCP POC
#                          container (default: http://localhost:8765/mcp). Only
#                          checked on TARGET=local — it's a local-only proof of
#                          concept (see docs/Python-MCP-server.md), not deployed to acc.
#
# Exit code: 0 when nothing failed, 1 when any check failed (skips never fail).

set -u

# ── Target presets ────────────────────────────────────────────────────────────

TARGET="${TARGET:-local}"
case "$(echo "$TARGET" | tr '[:upper:]' '[:lower:]')" in
  local)
    DEFAULT_BASE_URL="http://localhost:3002"
    DEFAULT_KEYCLOAK_URL="http://localhost:8080"
    ;;
  acc)
    DEFAULT_BASE_URL="https://acc.api.open-regels.nl"
    DEFAULT_KEYCLOAK_URL="https://acc.keycloak.open-regels.nl"
    ;;
  *)
    echo "ERROR: unknown TARGET='$TARGET' (expected 'local' or 'acc')."
    exit 1
    ;;
esac

# Explicit BASE_URL / KEYCLOAK_URL always win over the preset.
BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"
KEYCLOAK_URL="${KEYCLOAK_URL:-$DEFAULT_KEYCLOAK_URL}"

# Repo layout — used to run the Keycloak-free eDOCS probe in-process.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/packages/backend"

# Read a single KEY=value from an env file — stripped of CR, surrounding quotes,
# and trailing space. Only the first `=` is treated as the separator.
read_env_var() {
  sed -n -E "s/^$1=//p" "$2" 2>/dev/null | tail -n1 | tr -d '\r' \
    | sed -E 's/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# On localhost, fall back to the backend's own Keycloak client credentials from
# packages/backend/.env.<NODE_ENV> so Tier 2 runs without exporting a secret.
# An explicit CLIENT_SECRET from the environment always wins; the .env fallback is
# never used for TARGET=acc (those creds belong to the local realm).
ENV_FILE="$BACKEND_DIR/.env.${NODE_ENV:-development}"
CREDS_SOURCE="environment"
if [[ "$(echo "$TARGET" | tr '[:upper:]' '[:lower:]')" == "local" && -f "$ENV_FILE" && -z "${CLIENT_SECRET:-}" ]]; then
  _env_secret="$(read_env_var KEYCLOAK_CLIENT_SECRET "$ENV_FILE")"
  if [[ -n "$_env_secret" && "$_env_secret" != "your-client-secret-here" ]]; then
    CLIENT_SECRET="$_env_secret"
    CLIENT_ID="${CLIENT_ID:-$(read_env_var KEYCLOAK_CLIENT_ID "$ENV_FILE")}"
    CREDS_SOURCE="$ENV_FILE"
  fi
fi
CLIENT_ID="${CLIENT_ID:-operaton-mcp-client}"

# ── User (password-grant) credentials for the ROLE-gated seam ─────────────────
# Two Keycloak flows, two purposes:
#   • a confidential CLIENT + secret (above) authenticates M2M — used for eDOCS.
#   • a USER + password carries a ROLE (caseworker) — used for MCP /sources.
# USER_CLIENT_ID is the public client the password grant runs through (direct
# access grants enabled). On localhost the password is taken from .env
# (SMOKE_TEST_PASSWORD) when not exported.
USER_CLIENT_ID="${USER_CLIENT_ID:-ronl-business-api}"
SMOKE_USER="${SMOKE_USER:-test-caseworker-flevoland}"
if [[ "$(echo "$TARGET" | tr '[:upper:]' '[:lower:]')" == "local" && -f "$ENV_FILE" && -z "${SMOKE_PASSWORD:-}" ]]; then
  SMOKE_PASSWORD="$(read_env_var SMOKE_TEST_PASSWORD "$ENV_FILE")"
fi

# Run the direct eDOCS health probe (packages/backend/scripts/edocs-healthcheck.ts)
# and echo just its EDOCS_HEALTH_RESULT json line. Needs no Keycloak/backend — it
# reflects the LOCAL packages/backend/.env.<NODE_ENV> config, not the TARGET backend.
run_edocs_probe() {
  ( cd "$BACKEND_DIR" && NODE_ENV="${NODE_ENV:-development}" \
      npx --no-install tsx scripts/edocs-healthcheck.ts --quiet ) 2>/dev/null \
    | sed -n 's/^EDOCS_HEALTH_RESULT //p' | tail -n1
}

# Run the direct Doccle reachability probe (packages/backend/scripts/doccle-healthcheck.ts)
# and echo just its DOCCLE_HEALTH_RESULT json line. Needs no Keycloak/backend — it
# reflects the LOCAL packages/backend/.env.<NODE_ENV> config, not the TARGET backend.
# Unlike eDOCS this can only answer reachability, never "authenticated" — the v1
# Doccle API has no side-effect-free endpoint to verify credentials.
run_doccle_probe() {
  ( cd "$BACKEND_DIR" && NODE_ENV="${NODE_ENV:-development}" \
      npx --no-install tsx scripts/doccle-healthcheck.ts --quiet ) 2>/dev/null \
    | sed -n 's/^DOCCLE_HEALTH_RESULT //p' | tail -n1
}

# ── Result helpers ────────────────────────────────────────────────────────────

PASS=0
FAIL=0
SKIP=0
ERRORS=()

pass() { echo "  ✓ $1"; ((PASS++)); }
fail() { echo "  ✗ $1"; ERRORS+=("$1"); ((FAIL++)); }
skip() { echo "  ~ $1"; ((SKIP++)); }

check_status() {
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label — expected HTTP $expected, got HTTP $actual"
  fi
}

# GET a URL, writing the body to $1 and echoing the HTTP status code.
get() {
  local out="$1" url="$2"
  shift 2
  curl -s -o "$out" -w "%{http_code}" "$url" "$@"
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "FATAL: jq is required but not installed."
    exit 1
  fi
}

# Echo an access token for the M2M client (client_credentials), or empty on failure.
get_client_token() {
  curl -s -X POST "${KEYCLOAK_URL}/realms/ronl/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials" \
    -d "client_id=${CLIENT_ID}" \
    -d "client_secret=${CLIENT_SECRET}" | jq -r '.access_token // empty'
}

# Echo an access token for the role-bearing user (password grant), or empty on failure.
get_user_token() {
  curl -s -X POST "${KEYCLOAK_URL}/realms/ronl/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=password" \
    -d "client_id=${USER_CLIENT_ID}" \
    -d "username=${SMOKE_USER}" \
    -d "password=${SMOKE_PASSWORD}" | jq -r '.access_token // empty'
}

# Perform a full MCP streamable-HTTP handshake against $1 (initialize →
# notifications/initialized → tools/list), writing the tools/list JSON-RPC
# response (SSE-framed, "data: {...}") to $2. Returns 1 on any curl failure,
# non-200 initialize response, or a missing Mcp-Session-Id header — 0 otherwise.
# No auth involved; this only proves the MCP server itself is alive and
# advertising the tools it should, independent of the Node backend.
mcp_list_tools() {
  local url="$1" out="$2"
  local init_headers="$TMP/mcp_init_headers.txt" init_body="$TMP/mcp_init_body.txt" session_id

  curl -s -D "$init_headers" -o "$init_body" --max-time 5 -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0.0"}}}' \
    2>/dev/null || return 1

  grep -qi "^HTTP/[0-9.]* 200" "$init_headers" || return 1
  session_id=$(grep -i "^mcp-session-id:" "$init_headers" | tr -d '\r' \
    | sed -E 's/^[Mm]cp-[Ss]ession-[Ii]d:[[:space:]]*//')
  [[ -z "$session_id" ]] && return 1

  curl -s -o /dev/null --max-time 5 -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $session_id" \
    -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    2>/dev/null

  curl -s --max-time 5 -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $session_id" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
    > "$out" 2>/dev/null
}

echo ""
echo "═════════════════════════════════════════════════════════════════════════"
echo "  Cross-app smoke test  ·  TARGET=$TARGET"
echo "  backend : $BASE_URL"
echo "  keycloak: $KEYCLOAK_URL"
echo "═════════════════════════════════════════════════════════════════════════"

require_jq

TMP=$(mktemp -d 2>/dev/null || echo "/tmp/smoke-$$")
mkdir -p "$TMP"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# ── Gate: backend must be alive ───────────────────────────────────────────────

echo ""
echo "── Liveness gate ─────────────────────────────────────────────────────────"

LIVE_CODE=$(get "$TMP/live.json" "${BASE_URL}/v1/health/live")
if [[ "$LIVE_CODE" != "200" ]]; then
  echo "  ✗ backend not live at ${BASE_URL} (HTTP $LIVE_CODE)"
  echo ""
  echo "  Is the backend running? For local dev start it, or pass TARGET=acc."
  echo "  Results: 0 passed, 1 failed"
  exit 1
fi
pass "backend live (GET /v1/health/live)"

# ── Tier 1 — open cross-app health (no secret needed) ─────────────────────────

echo ""
echo "── Operaton + Keycloak (GET /v1/health) ──────────────────────────────────"

# /v1/health is 200 healthy / 503 degraded — inspect the dependency block either way.
get "$TMP/health.json" "${BASE_URL}/v1/health" >/dev/null
for dep in operaton keycloak; do
  st=$(jq -r ".data.dependencies.${dep}.status // \"unknown\"" "$TMP/health.json" 2>/dev/null)
  if [[ "$st" == "up" ]]; then
    pass "dependency ${dep} up"
  else
    fail "dependency ${dep} not up (status=$st)"
  fi
done

echo ""
echo "── Cross-app reachability (GET /v1/health/external) ──────────────────────"

EXT_CODE=$(get "$TMP/external.json" "${BASE_URL}/v1/health/external")
check_status "GET /v1/health/external" "$EXT_CODE" "200"
if [[ "$EXT_CODE" == "200" ]]; then
  for id in lde triplydb cprmv; do
    st=$(jq -r ".data.${id}.status // \"unknown\"" "$TMP/external.json" 2>/dev/null)
    lat=$(jq -r ".data.${id}.latency // \"?\"" "$TMP/external.json" 2>/dev/null)
    if [[ "$st" == "up" ]]; then
      pass "${id} reachable (${lat} ms)"
    else
      fail "${id} not reachable (status=$st)"
    fi
  done
fi

echo ""
echo "── Media path (GET /v1/media-aggregator/health) ──────────────────────────"

MEDIA_CODE=$(get "$TMP/media.json" "${BASE_URL}/v1/media-aggregator/health")
if [[ "$MEDIA_CODE" == "200" ]]; then
  cached=$(jq -r '.cached // 0' "$TMP/media.json" 2>/dev/null)
  pass "media store healthy (cached=$cached articles)"
else
  fail "media-aggregator health — HTTP $MEDIA_CODE"
fi

# ── eDOCS check 1/2 — DIRECT (in-process · no Keycloak · local .env) ──────────
#
# eDOCS gets two checks that answer deliberately different questions:
#   1/2 (here)  — DIRECT: runs EdocsService.healthCheck() in-process. No backend,
#                 no Keycloak, no CLIENT_SECRET. Reflects the LOCAL
#                 packages/backend/.env config (independent of TARGET).
#   2/2 (Tier 2) — JWT-GATED: asks the RUNNING backend via /v1/edocs/status. Needs
#                 a token, and reflects the backend PROCESS's config — which can
#                 differ from local .env if it was started before an edit.
# Comparing the two exposes config drift (e.g. a backend still on the test library
# while local .env already points at prod).

echo ""
echo "── eDOCS check 1/2 — direct (in-process · no Keycloak · local .env) ───────"

if [[ ! -d "$BACKEND_DIR" ]]; then
  skip "eDOCS probe — backend package not found at $BACKEND_DIR"
elif ! command -v npx >/dev/null 2>&1; then
  skip "eDOCS probe — npx/tsx not available"
else
  EDOCS_JSON=$(run_edocs_probe)
  if [[ -z "$EDOCS_JSON" ]]; then
    fail "eDOCS probe produced no result — run manually: (cd packages/backend && npm run edocs:health)"
  elif [[ "$(echo "$EDOCS_JSON" | jq -r '.status')" == "stub" ]]; then
    skip "eDOCS — stub mode enabled locally (EDOCS_STUB_MODE=true)"
  else
    rch=$(echo "$EDOCS_JSON" | jq -r '.reachable')
    aut=$(echo "$EDOCS_JSON" | jq -r '.authenticated')
    lat=$(echo "$EDOCS_JSON" | jq -r '.latency // "?"')
    if [[ "$rch" == "true" ]]; then
      pass "eDOCS reachable (${lat} ms)"
    else
      fail "eDOCS not reachable: $(echo "$EDOCS_JSON" | jq -r '.error // "no detail"')"
    fi
    if [[ "$aut" == "true" ]]; then
      pass "eDOCS authenticated (login OK)"
    else
      fail "eDOCS login failed: $(echo "$EDOCS_JSON" | jq -r '.error // "no detail (see backend logs / rapi_details)"')"
    fi
  fi
fi

# ── Doccle check — DIRECT (in-process · no Keycloak · local .env) ─────────────
#
# Unlike eDOCS, the v1 Doccle API (mci-rest-app) has no side-effect-free
# endpoint, so this can only prove reachability — never "authenticated". Real
# credential verification only happens via the mutating scripts/test-doccle-live.sh.

echo ""
echo "── Doccle check — direct (in-process · no Keycloak · local .env) ──────────"

if [[ ! -d "$BACKEND_DIR" ]]; then
  skip "Doccle probe — backend package not found at $BACKEND_DIR"
elif ! command -v npx >/dev/null 2>&1; then
  skip "Doccle probe — npx/tsx not available"
else
  DOCCLE_JSON=$(run_doccle_probe)
  if [[ -z "$DOCCLE_JSON" ]]; then
    fail "Doccle probe produced no result — run manually: (cd packages/backend && npm run doccle:health)"
  elif [[ "$(echo "$DOCCLE_JSON" | jq -r '.status')" == "stub" ]]; then
    skip "Doccle — stub mode enabled locally (DOCCLE_STUB_MODE=true)"
  else
    rch=$(echo "$DOCCLE_JSON" | jq -r '.reachable')
    lat=$(echo "$DOCCLE_JSON" | jq -r '.latency // "?"')
    if [[ "$rch" == "true" ]]; then
      pass "Doccle reachable (${lat} ms) — auth not verified (see test-doccle-live.sh)"
    else
      fail "Doccle not reachable: $(echo "$DOCCLE_JSON" | jq -r '.error // "no detail"')"
    fi
  fi
fi

# ── Python MCP POC check — DIRECT (streamable HTTP · no Keycloak · local-only) ─
#
# Proof-of-concept container (docs/Python-MCP-server.md) — a Python-SDK MCP
# server reachable over streamable HTTP, independent of the Node backend. This
# talks to it directly, the same way the Node PythonPocMcpProvider does, so it
# catches "container not built/started" or "tools changed" before the backend
# is even involved. Local-only: not deployed to acc.

echo ""
echo "── Python MCP POC (proof of concept, direct streamable HTTP) ─────────────"

PYTHON_MCP_POC_URL="${PYTHON_MCP_POC_URL:-http://localhost:8765/mcp}"

if [[ "$(echo "$TARGET" | tr '[:upper:]' '[:lower:]')" != "local" ]]; then
  skip "Python MCP POC — local-only proof of concept, not deployed to $TARGET"
elif ! mcp_list_tools "$PYTHON_MCP_POC_URL" "$TMP/python_poc_tools.txt"; then
  skip "Python MCP POC — not reachable at $PYTHON_MCP_POC_URL (start with: docker compose up -d python-mcp-poc)"
else
  pass "Python MCP POC reachable (MCP initialize handshake OK, $PYTHON_MCP_POC_URL)"
  PP_TOOLS=$(sed -n 's/^data: //p' "$TMP/python_poc_tools.txt" | tail -n1 \
    | jq -r '.result.tools[]?.name' 2>/dev/null | tr -d '\r' | sort | paste -sd, -)
  if echo ",$PP_TOOLS," | grep -q ",process_list," && echo ",$PP_TOOLS," | grep -q ",process_status,"; then
    pass "Python MCP POC tools present (process_list, process_status)"
  else
    fail "Python MCP POC tools/list missing expected tools — got: ${PP_TOOLS:-<none>}"
  fi
fi

# ── Tier 2 — authenticated seams (two Keycloak flows) ─────────────────────────
#
# 2a — CLIENT flow (client_credentials): a confidential client + secret. M2M, no
#      human, no role. Used for the eDOCS 2/2 gated status check.
# 2b — USER flow (password grant): a user + password whose ROLE (caseworker) gates
#      /v1/mcp/sources. Used for the MCP layer check.

echo ""
echo "── Tier 2a — client flow (M2M) → eDOCS 2/2 JWT-gated ──────────────────────"

if [[ -z "${CLIENT_SECRET:-}" ]]; then
  skip "eDOCS 2/2 (JWT-gated, M2M client) — no CLIENT_SECRET (export it, or add KEYCLOAK_CLIENT_SECRET to $ENV_FILE for TARGET=local; direct check 1/2 ran above)"
else
  [[ "$CREDS_SOURCE" != "environment" ]] && \
    echo "  · CLIENT_SECRET loaded from $(basename "$CREDS_SOURCE") (client: ${CLIENT_ID})"
  M2M_TOKEN=$(get_client_token)
  if [[ -z "$M2M_TOKEN" ]]; then
    fail "client token (client_credentials, ${CLIENT_ID}) — no access_token returned"
  else
    pass "client token obtained (${CLIENT_ID}, client_credentials)"
    AUTH_M2M=(-H "Authorization: Bearer $M2M_TOKEN")

    # eDOCS check 2/2 — JWT-GATED: the RUNNING backend's own reach/login via the
    # protected /v1/edocs/status route. Contrast with the direct probe (1/2): this
    # reflects the backend PROCESS's config, so watch the reported library — if it
    # differs from local .env, the backend is on stale config (needs a restart).
    ES_CODE=$(get "$TMP/edocs.json" "${BASE_URL}/v1/edocs/status" "${AUTH_M2M[@]}")
    check_status "GET /v1/edocs/status" "$ES_CODE" "200"
    if [[ "$ES_CODE" == "200" ]]; then
      es_lib=$(jq -r '.data.library // "?"' "$TMP/edocs.json" 2>/dev/null)
      if [[ "$(jq -r '.data.stubMode' "$TMP/edocs.json" 2>/dev/null)" == "true" ]]; then
        skip "eDOCS (backend) — stub mode enabled (EDOCS_STUB_MODE)"
      else
        rch=$(jq -r '.data.reachable' "$TMP/edocs.json" 2>/dev/null)
        [[ "$rch" == "true" ]] \
          && pass "eDOCS reachable via backend (library=$es_lib)" \
          || fail "eDOCS not reachable via backend: $(jq -r '.data.error // "no detail"' "$TMP/edocs.json")"
        aut=$(jq -r '.data.authenticated' "$TMP/edocs.json" 2>/dev/null)
        if [[ "$aut" == "true" ]]; then
          pass "eDOCS authenticated via backend"
        else
          fail "eDOCS login failed via backend: $(jq -r '.data.error // "no detail"' "$TMP/edocs.json")"
        fi
      fi
    fi

    # Doccle gated status — reuses the same M2M token. Reachability only, same
    # caveat as the direct probe above: this API cannot prove authentication
    # without a mutating call (see scripts/test-doccle-live.sh).
    DS_CODE=$(get "$TMP/doccle.json" "${BASE_URL}/v1/doccle/status" "${AUTH_M2M[@]}")
    check_status "GET /v1/doccle/status" "$DS_CODE" "200"
    if [[ "$DS_CODE" == "200" ]]; then
      if [[ "$(jq -r '.data.stubMode' "$TMP/doccle.json" 2>/dev/null)" == "true" ]]; then
        skip "Doccle (backend) — stub mode enabled (DOCCLE_STUB_MODE)"
      else
        rch=$(jq -r '.data.reachable' "$TMP/doccle.json" 2>/dev/null)
        [[ "$rch" == "true" ]] \
          && pass "Doccle reachable via backend" \
          || fail "Doccle not reachable via backend: $(jq -r '.data.error // "no detail"' "$TMP/doccle.json")"
      fi
    fi
  fi
fi

echo ""
echo "── Tier 2b — user flow (role) → MCP /sources ─────────────────────────────"

if [[ -z "${SMOKE_PASSWORD:-}" ]]; then
  skip "MCP layer (role-gated) — no user password (export SMOKE_PASSWORD, or add SMOKE_TEST_PASSWORD to $ENV_FILE for TARGET=local)"
else
  USER_TOKEN=$(get_user_token)
  if [[ -z "$USER_TOKEN" ]]; then
    fail "user token (password grant, ${SMOKE_USER} via ${USER_CLIENT_ID}) — no access_token returned"
  else
    pass "user token obtained (${SMOKE_USER}, password grant via ${USER_CLIENT_ID})"
    AUTH_USER=(-H "Authorization: Bearer $USER_TOKEN")

    # MCP provider layer (LDE / TriplyDB / CPRMV / Operaton) — gated by the
    # caseworker/admin role the user carries.
    MCP_CODE=$(get "$TMP/mcp.json" "${BASE_URL}/v1/mcp/sources" "${AUTH_USER[@]}")
    if [[ "$MCP_CODE" == "200" ]]; then
      n=$(jq -r '.data | length' "$TMP/mcp.json" 2>/dev/null)
      if [[ "$n" =~ ^[0-9]+$ ]] && [[ "$n" -gt 0 ]]; then
        pass "MCP layer reachable ($n provider(s): $(jq -rc '[.data[].id] // [.data[].name]' "$TMP/mcp.json" 2>/dev/null))"
      else
        skip "MCP layer — no providers advertised (MCP disabled by config?)"
      fi

      # python-poc specifically — the backend's own connection to the Python MCP
      # POC (compare against the direct check above: this reflects the running
      # backend PROCESS's config, which can differ if it started before an edit).
      pp_connected=$(jq -r '.data[] | select(.id=="python-poc") | .connected' "$TMP/mcp.json" 2>/dev/null)
      if [[ "$pp_connected" == "true" ]]; then
        pass "python-poc provider connected (via backend GET /v1/mcp/sources)"
      elif [[ "$pp_connected" == "false" ]]; then
        fail "python-poc provider registered but not connected (via backend GET /v1/mcp/sources)"
      else
        skip "python-poc provider not registered on the backend (PYTHON_MCP_POC_ENABLED=false?)"
      fi
    elif [[ "$MCP_CODE" == "401" || "$MCP_CODE" == "403" ]]; then
      fail "MCP /sources — HTTP $MCP_CODE: user '${SMOKE_USER}' lacks the caseworker/admin role"
    else
      fail "GET /v1/mcp/sources — HTTP $MCP_CODE"
    fi
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  Results: $PASS passed, $FAIL failed, $SKIP skipped"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "  Failures:"
  for e in "${ERRORS[@]}"; do echo "    - $e"; done
  echo ""
  exit 1
fi

echo ""
exit 0
