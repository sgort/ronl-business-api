#!/usr/bin/env bash
# test-doccle-live.sh
# End-to-end smoke test of the Doccle connector against the LIVE v1 mci-rest-app
# API, through the /v1/doccle HTTP surface — the same path real callers use.
#
# Run this AFTER setting DOCCLE_STUB_MODE=false (and DOCCLE_SENDERNAME to a real,
# confirmed technical sender name) and restarting the backend. It proves the XML
# wire format, receiver upsert and document upload all work against the real API.
#
# Usage:
#   CLIENT_SECRET=<secret> bash scripts/test-doccle-live.sh
#
# A Keycloak-free pre-flight runs first: it probes Doccle reachability in-process
# (packages/backend/.env) and aborts BEFORE the token dance / any mutation if
# Doccle is unreachable or still in stub mode. Unlike eDOCS, this API has no
# side-effect-free endpoint, so the pre-flight CANNOT verify DOCCLE_USERNAME /
# DOCCLE_PASSWORD — that only happens once the mutating steps below run.
# For just the reachability answer on its own, use: npm run doccle:health.
#
# Optional overrides:
#   BASE_URL=https://acc.api.open-regels.nl
#   KEYCLOAK_URL=https://acc.keycloak.open-regels.nl
#   CLIENT_ID=operaton-mcp-client
#   SENDER_NAME=ictu                       # technical sender name (all lowercase);
#                                             defaults to DOCCLE_SENDERNAME in .env
#   RECEIVER_REF=SMOKE-<timestamp>         # override to reuse/inspect a receiver
#   DOCUMENT_ID=SMOKE-DOC-<timestamp>
#   SKIP_LOCAL_PROBE=1                     # skip pre-flight (local .env ≠ target)
#   NODE_ENV=development                   # which .env the pre-flight loads
#
# NOTE: a successful run creates a REAL receiver and document on Doccle staging.
# The service exposes no delete, so clean up manually if your sender requires it.
# RECEIVER_REF/DOCUMENT_ID default to timestamps so runs never collide.

set -u

BASE_URL="${BASE_URL:-https://acc.api.open-regels.nl}"
KEYCLOAK_URL="${KEYCLOAK_URL:-https://acc.keycloak.open-regels.nl}"
# For a local live test (backend on localhost pointed at the real Doccle server):
# BASE_URL="${BASE_URL:-http://localhost:3002}"
# KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
CLIENT_ID="${CLIENT_ID:-operaton-mcp-client}"
TS="$(date +%Y%m%d-%H%M%S)"
RECEIVER_REF="${RECEIVER_REF:-SMOKE-$TS}"
DOCUMENT_ID="${DOCUMENT_ID:-SMOKE-DOC-$TS}"

# Repo layout — used to run the Keycloak-free Doccle reachability pre-flight and
# to read DOCCLE_SENDERNAME from the backend's own .env when SENDER_NAME is unset.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/packages/backend"
ENV_FILE="$BACKEND_DIR/.env.${NODE_ENV:-development}"

read_env_var() {
  sed -n -E "s/^$1=//p" "$2" 2>/dev/null | tail -n1 | tr -d '\r' \
    | sed -E 's/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

if [[ -z "${SENDER_NAME:-}" && -f "$ENV_FILE" ]]; then
  SENDER_NAME="$(read_env_var DOCCLE_SENDERNAME "$ENV_FILE")"
fi

# Direct Doccle reachability probe (in-process, no Keycloak/backend). Echoes its
# DOCCLE_HEALTH_RESULT json line. Reflects the LOCAL packages/backend/.env config.
run_doccle_probe() {
  ( cd "$BACKEND_DIR" && NODE_ENV="${NODE_ENV:-development}" \
      npx --no-install tsx scripts/doccle-healthcheck.ts --quiet ) 2>/dev/null \
    | sed -n 's/^DOCCLE_HEALTH_RESULT //p' | tail -n1
}

# ─── Pre-flight: is Doccle reachable? (no Keycloak needed) ───────────────────────
#
# The mutating steps below go through the JWT-gated backend and create a real
# receiver + document, so there is no point starting the Keycloak/token dance if
# Doccle itself is unreachable or still in stub mode. Unlike eDOCS, this API has
# no side-effect-free authenticated endpoint, so reachability is ALL this
# pre-flight can answer — a 401 on the mutating steps below is still possible
# even when this passes. Set SKIP_LOCAL_PROBE=1 if your local .env does not match
# the target backend.
if [[ "${SKIP_LOCAL_PROBE:-0}" != "1" && -d "$BACKEND_DIR" ]] && command -v npx >/dev/null 2>&1; then
  echo ""
  echo "── Pre-flight: Doccle reachability (direct · no Keycloak · local .env) ────"
  PROBE_JSON=$(run_doccle_probe)
  if [[ -z "$PROBE_JSON" ]]; then
    echo "  ~ probe produced no result — skipping pre-flight (run: cd packages/backend && npm run doccle:health)"
  elif [[ "$(echo "$PROBE_JSON" | jq -r '.status')" == "stub" ]]; then
    echo "  ✗ Doccle is in STUB mode locally — set DOCCLE_STUB_MODE=false and retry."
    echo "    (Nothing to smoke-test against a stub. Aborting before the token dance.)"
    exit 1
  else
    p_rch=$(echo "$PROBE_JSON" | jq -r '.reachable')
    if [[ "$p_rch" != "true" ]]; then
      echo "  ✗ Doccle not reachable: $(echo "$PROBE_JSON" | jq -r '.error // "no detail"')"
      echo "    Aborting — the mutating steps would fail. (SKIP_LOCAL_PROBE=1 to override.)"
      exit 1
    fi
    echo "  ✓ Doccle reachable (auth is NOT verified here — see the receiver step below)"
  fi
fi

if [[ -z "${CLIENT_SECRET:-}" ]]; then
  echo "ERROR: CLIENT_SECRET is not set."
  echo "Usage: CLIENT_SECRET=<secret> bash $0"
  exit 1
fi

if [[ -z "${SENDER_NAME:-}" ]]; then
  echo "ERROR: SENDER_NAME is not set and DOCCLE_SENDERNAME was not found in $ENV_FILE."
  echo "Usage: SENDER_NAME=<technical-sender-name> CLIENT_SECRET=<secret> bash $0"
  exit 1
fi

PASS=0
FAIL=0
ERRORS=()

pass() { echo "  ✓ $1"; ((PASS++)); }
fail() { echo "  ✗ $1"; ERRORS+=("$1"); ((FAIL++)); }

check_status() {
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label — expected HTTP $expected, got HTTP $actual"
  fi
}

check_field() {
  local label="$1" body="$2" field="$3" expected="$4" actual
  actual=$(echo "$body" | jq -r "$field" 2>/dev/null || echo "__jq_error__")
  if [[ "$actual" == "$expected" ]]; then
    pass "$label ($field = $expected)"
  else
    fail "$label — expected $field=$expected, got $field=$actual"
  fi
}

# ─── Token ────────────────────────────────────────────────────────────────────

echo ""
echo "── Obtaining token ──────────────────────────────────────────────────────"

TOKEN_RESPONSE=$(curl -s -X POST \
  "${KEYCLOAK_URL}/realms/ronl/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')

if [[ -z "$TOKEN" ]]; then
  echo "FATAL: Failed to obtain token."
  echo "$TOKEN_RESPONSE" | jq . 2>/dev/null || echo "$TOKEN_RESPONSE"
  exit 1
fi
pass "Token obtained"

AUTH=(-H "Authorization: Bearer $TOKEN")

# ─── 1. Status — the switch must be live ──────────────────────────────────────

echo ""
echo "── Doccle status (must be live, not stub) ───────────────────────────────"

STATUS_CODE=$(curl -s -o /tmp/doccle_status.json -w "%{http_code}" \
  "${BASE_URL}/v1/doccle/status" "${AUTH[@]}")
check_status "GET /v1/doccle/status" "$STATUS_CODE" "200"

if [[ "$STATUS_CODE" == "200" ]]; then
  STATUS_BODY=$(cat /tmp/doccle_status.json)
  check_field "stub mode disabled" "$STATUS_BODY" '.data.stubMode' 'false'
  check_field "Doccle reachable" "$STATUS_BODY" '.data.reachable' 'true'
fi

# Abort the mutating steps unless we are live AND reachable — auth itself can
# only be proven by the receiver call below (this API has no safe probe for it).
if [[ "$STATUS_CODE" != "200" ]] || \
   [[ "$(jq -r '.data.stubMode' /tmp/doccle_status.json 2>/dev/null)" != "false" ]] || \
   [[ "$(jq -r '.data.reachable' /tmp/doccle_status.json 2>/dev/null)" != "true" ]]; then
  echo ""
  echo "  ! Skipping receiver/document steps — status pre-flight did not pass."
  echo ""
  echo "  Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ─── 2. Create/update a receiver ──────────────────────────────────────────────
#
# This is the FIRST call that actually proves DOCCLE_USERNAME/DOCCLE_PASSWORD —
# a 401 here means the credentials (or their "{app-user}@{sender-name}" format)
# are wrong, not that anything else is broken.

echo ""
echo "── Create/update receiver ($RECEIVER_REF, sender=$SENDER_NAME) ────────────"

REC_CODE=$(curl -s -o /tmp/doccle_receiver.json -w "%{http_code}" \
  -X PUT "${BASE_URL}/v1/doccle/senders/${SENDER_NAME}/receivers/${RECEIVER_REF}" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"${RECEIVER_REF}\",\"labels\":{\"labelDefault\":\"Doccle CLI smoke test\"},\"personalInformation\":{\"firstName\":\"Smoke\",\"lastName\":\"Test\"},\"contactDetails\":{\"languageISO\":\"nl\"}}")
check_status "PUT /v1/doccle/senders/:senderName/receivers/:externalReference" "$REC_CODE" "200"

if [[ "$REC_CODE" == "200" ]]; then
  check_field "receiver body" "$(cat /tmp/doccle_receiver.json)" '.success' 'true'
  pass "receiver created=$(jq -r '.data.created' /tmp/doccle_receiver.json)"
elif [[ "$REC_CODE" != "200" ]]; then
  echo "  · body: $(cat /tmp/doccle_receiver.json)"
fi

# ─── 3. Send a document ───────────────────────────────────────────────────────

echo ""
echo "── Send document ($DOCUMENT_ID) ─────────────────────────────────────────"

if [[ "$REC_CODE" == "200" ]]; then
  CONTENT_B64=$(printf '%s' "Doccle CLI smoke test — ${DOCUMENT_ID} — $(date -u +%FT%TZ)" | base64 | tr -d '\n')
  DOC_CODE=$(curl -s -o /tmp/doccle_doc.json -w "%{http_code}" \
    -X POST "${BASE_URL}/v1/doccle/senders/${SENDER_NAME}/receivers/${RECEIVER_REF}/documents/${DOCUMENT_ID}" \
    "${AUTH[@]}" -H "Content-Type: application/json" \
    -d "{\"senderDocumentType\":\"INFO\",\"classificationLevel\":\"Confidential\",\"documentDisplay\":{\"name\":[{\"value\":\"CLI smoke test document\",\"lang\":\"nl\",\"defaultLang\":true}]},\"documentFile\":{\"reference\":\"smoke-test.txt\",\"contentBase64\":\"${CONTENT_B64}\",\"mimeType\":\"text/plain\"}}")
  check_status "POST /v1/doccle/senders/:senderName/receivers/:id/documents/:id" "$DOC_CODE" "200"
  if [[ "$DOC_CODE" == "200" ]]; then
    DOC_URI=$(jq -r '.data.documentUri // empty' /tmp/doccle_doc.json)
    [[ -n "$DOC_URI" ]] \
      && pass "document sent (documentUri=$DOC_URI)" \
      || fail "putDocument returned no documentUri"
  else
    echo "  · body: $(cat /tmp/doccle_doc.json)"
  fi

  # ─── 4. Mark it paid (idempotent — safe on our own disposable document) ─────
  echo ""
  echo "── Mark document paid ───────────────────────────────────────────────────"
  PAID_CODE=$(curl -s -o /tmp/doccle_paid.json -w "%{http_code}" \
    -X POST "${BASE_URL}/v1/doccle/senders/${SENDER_NAME}/receivers/${RECEIVER_REF}/documents/${DOCUMENT_ID}/paid" \
    "${AUTH[@]}")
  check_status "POST .../paid" "$PAID_CODE" "200"
else
  echo "  ~ document send + mark-paid skipped — receiver step did not pass"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  Results: $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "  Failures:"
  for e in "${ERRORS[@]}"; do echo "    - $e"; done
  echo ""
  exit 1
fi

echo ""
rm -f /tmp/doccle_status.json /tmp/doccle_receiver.json /tmp/doccle_doc.json /tmp/doccle_paid.json
exit 0
