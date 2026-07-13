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
#   bash scripts/test-smoke-live.sh                     # Tier 1 + eDOCS probe
#   CLIENT_SECRET=<secret> bash scripts/test-smoke-live.sh          # + Tier 2 (MCP)
#   TARGET=acc CLIENT_SECRET=<secret> bash scripts/test-smoke-live.sh   # acc env
#
# The eDOCS reachable+login check runs in-process (packages/backend/.env, no
# Keycloak) so it needs no CLIENT_SECRET; Tier 2 now only covers the MCP layer.
#
# ── Config ────────────────────────────────────────────────────────────────────
#   TARGET=local|acc     picks a preset pair of URLs (default: local)
#                          local → http://localhost:3002  + http://localhost:8080
#                          acc   → https://acc.api.open-regels.nl
#                                  + https://acc.keycloak.open-regels.nl
#   BASE_URL / KEYCLOAK_URL   set either explicitly to override the TARGET preset
#   CLIENT_ID            Keycloak client (default: operaton-mcp-client)
#   CLIENT_SECRET        if set, enables Tier 2 (token → MCP layer)
#   NODE_ENV             picks the .env the eDOCS probe loads (default: development)
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
CLIENT_ID="${CLIENT_ID:-operaton-mcp-client}"

# Repo layout — used to run the Keycloak-free eDOCS probe in-process.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/packages/backend"

# Run the direct eDOCS health probe (packages/backend/scripts/edocs-healthcheck.ts)
# and echo just its EDOCS_HEALTH_RESULT json line. Needs no Keycloak/backend — it
# reflects the LOCAL packages/backend/.env.<NODE_ENV> config, not the TARGET backend.
run_edocs_probe() {
  ( cd "$BACKEND_DIR" && NODE_ENV="${NODE_ENV:-development}" \
      npx --no-install tsx scripts/edocs-healthcheck.ts --quiet ) 2>/dev/null \
    | sed -n 's/^EDOCS_HEALTH_RESULT //p' | tail -n1
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

# ── eDOCS reachability + login (direct probe — no Keycloak) ───────────────────
#
# eDOCS's two health aspects — reachable + authenticated — are answered by running
# EdocsService.healthCheck() in-process, NOT through the JWT-gated /v1/edocs/status
# route. So this needs no CLIENT_SECRET and no running backend. It reflects the
# LOCAL packages/backend/.env config (independent of TARGET), which is exactly the
# config a local dev backend would use.

echo ""
echo "── eDOCS reachability + login (direct · no Keycloak · local .env) ─────────"

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

# ── Tier 2 — authenticated seams (only with a CLIENT_SECRET) ──────────────────

echo ""
echo "── Authenticated seams (Tier 2) ──────────────────────────────────────────"

if [[ -z "${CLIENT_SECRET:-}" ]]; then
  skip "MCP layer — no CLIENT_SECRET set (eDOCS covered above without Keycloak)"
else
  TOKEN_RESPONSE=$(curl -s -X POST \
    "${KEYCLOAK_URL}/realms/ronl/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials" \
    -d "client_id=${CLIENT_ID}" \
    -d "client_secret=${CLIENT_SECRET}")
  TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

  if [[ -z "$TOKEN" ]]; then
    fail "Keycloak token (client_credentials, ${CLIENT_ID}) — no access_token returned"
  else
    pass "Keycloak token obtained (${CLIENT_ID})"
    AUTH=(-H "Authorization: Bearer $TOKEN")

    # MCP provider layer wired (LDE / TriplyDB / CPRMV / Operaton behind the backend).
    MCP_CODE=$(get "$TMP/mcp.json" "${BASE_URL}/v1/mcp/sources" "${AUTH[@]}")
    if [[ "$MCP_CODE" == "200" ]]; then
      n=$(jq -r '.data | length' "$TMP/mcp.json" 2>/dev/null)
      if [[ "$n" =~ ^[0-9]+$ ]] && [[ "$n" -gt 0 ]]; then
        pass "MCP layer reachable ($n provider(s): $(jq -rc '[.data[].id] // [.data[].name]' "$TMP/mcp.json" 2>/dev/null))"
      else
        skip "MCP layer — no providers advertised (MCP disabled by config?)"
      fi
    elif [[ "$MCP_CODE" == "401" || "$MCP_CODE" == "403" ]]; then
      skip "MCP /sources — token lacks caseworker/admin role (HTTP $MCP_CODE)"
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
