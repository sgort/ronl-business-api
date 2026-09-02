#!/usr/bin/env bash
# rip-purge-instances.sh
# Removes every runtime and history record of the RIP phase processes from an
# Operaton engine, leaving the deployed process definitions in place. This is
# the "start the walkthrough from nothing" reset: after it, the Faseladder's
# LIVE figures are all zero and the Starten tabs offer nothing, so a run
# through R2.1 -> R2.2 -> ... begins from a known state.
#
# Scoped by process-definition key. Every other process on the engine
# (AwbShellProcess, the E2E sub-processes, ...) is untouched, and the script
# prints what remains deployed afterwards so you can see that it was.
#
# Deleting a running instance produces a history entry, so history is listed
# again AFTER the runtime deletions rather than before — otherwise the
# instances cancelled by this very script would survive in history.
#
# Usage:
#   bash scripts/rip-purge-instances.sh                 # purge, with confirmation
#   bash scripts/rip-purge-instances.sh --yes           # no confirmation
#   bash scripts/rip-purge-instances.sh --dry-run       # list what would go
#
# Optional overrides (env vars):
#   OPERATON_URL   engine REST base (default: http://localhost:8081/engine-rest)
#   RIP_KEYS       comma-separated process-definition keys
#                  (default: every RipR* key deployed on the engine, discovered)
#
# ACC: OPERATON_URL=https://operaton.open-regels.nl/engine-rest bash scripts/rip-purge-instances.sh
# Think twice before doing that — ACC history is not yours alone.
#
# Note on Windows: python opens stdout in text mode, so a bare print() emits
# CRLF and every id would carry a trailing CR straight into the request URL,
# where curl reports HTTP 000 rather than anything you can act on. Hence the
# reconfigure(newline='') below. Same trap as jq on this machine.

set -uo pipefail

OPERATON_URL="${OPERATON_URL:-http://localhost:8081/engine-rest}"
# Discovered from the engine rather than listed. A hardcoded default lagged the
# ladder twice -- once at R2.3 and again at R5.1 -- and each time the failure
# was silent in the worst way: the script reported "Clean." having left the
# phases it did not know about untouched. Set RIP_KEYS explicitly to narrow it.
RIP_KEYS="${RIP_KEYS:-}"

ASSUME_YES=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y)  ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

PY_BIN="$(command -v python || command -v python3 || true)"
if [ -z "$PY_BIN" ]; then
  echo "python is required (used to parse the engine's JSON)." >&2
  exit 1
fi

# ["RipR21Process","RipR22Process"] from the comma-separated list.
KEYS_JSON=$(printf '%s' "$RIP_KEYS" | "$PY_BIN" -c \
  "import sys,json;print(json.dumps([k.strip() for k in sys.stdin.read().split(',') if k.strip()]))")

PY_IDS="import sys,json;sys.stdout.reconfigure(newline='');[print(i['id']) for i in json.load(sys.stdin)]"

if ! curl -sf -o /dev/null "$OPERATON_URL/version"; then
  echo "Operaton not reachable at $OPERATON_URL" >&2
  exit 1
fi

if [ -z "$RIP_KEYS" ]; then
  RIP_KEYS=$(curl -s "$OPERATON_URL/process-definition?latestVersion=true" | "$PY_BIN" -c \
    "import sys,json;print(','.join(sorted(d['key'] for d in json.load(sys.stdin) if d['key'].startswith('RipR'))))")
  if [ -z "$RIP_KEYS" ]; then
    echo "No RipR* process definitions deployed on $OPERATON_URL -- nothing to purge." >&2
    exit 0
  fi
fi

query_ids() { # $1 = '' for runtime, 'history/' for history
  curl -s -X POST "$OPERATON_URL/${1}process-instance" \
    -H 'Content-Type: application/json' \
    -d "{\"processDefinitionKeyIn\":$KEYS_JSON}" | "$PY_BIN" -c "$PY_IDS"
}

count() { # $1 = '' | 'history/', $2 = key
  curl -s -X POST "$OPERATON_URL/${1}process-instance/count" \
    -H 'Content-Type: application/json' -d "{\"processDefinitionKey\":\"$2\"}" |
    "$PY_BIN" -c "import sys,json;print(json.load(sys.stdin)['count'])"
}

# Report anything other than success or an already-absent record. A silent
# delete loop that swallows a 500 leaves you believing the engine is clean.
del() { # $1 = url, $2 = label
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$1")
  case "$code" in
    200|204) echo "  ok      $2" ;;
    404)     echo "  gone    $2 (already absent)" ;;
    *)       echo "  FAILED  $2 -> HTTP $code"; FAILURES=$((FAILURES + 1)) ;;
  esac
}

echo "Engine: $OPERATON_URL"
echo "Keys  : $RIP_KEYS"
echo
echo "Current state:"
for k in ${RIP_KEYS//,/ }; do
  echo "  $k  runtime=$(count '' "$k")  history=$(count 'history/' "$k")"
done
echo

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run — would delete:"
  for id in $(query_ids ''); do echo "  runtime $id"; done
  for id in $(query_ids 'history/'); do echo "  history $id"; done
  exit 0
fi

if [ "$ASSUME_YES" -eq 0 ]; then
  printf 'Delete all runtime and history records for these keys? [y/N] '
  read -r reply
  case "$reply" in [yY]*) ;; *) echo "Aborted."; exit 0 ;; esac
fi

FAILURES=0

echo "== runtime instances =="
RUN_IDS=$(query_ids '')
[ -z "$RUN_IDS" ] && echo "  (none)"
for id in $RUN_IDS; do
  del "$OPERATON_URL/process-instance/$id?skipCustomListeners=true&skipIoMappings=true" "runtime $id"
done

echo "== history (re-listed, so it includes what was just cancelled) =="
HIST_IDS=$(query_ids 'history/')
[ -z "$HIST_IDS" ] && echo "  (none)"
for id in $HIST_IDS; do
  del "$OPERATON_URL/history/process-instance/$id" "history $id"
done

echo
echo "== verification =="
REMAINING=0
for k in ${RIP_KEYS//,/ }; do
  r=$(count '' "$k")
  h=$(count 'history/' "$k")
  echo "  $k  runtime=$r  history=$h"
  REMAINING=$((REMAINING + r + h))
done

echo
echo "== still deployed, untouched =="
curl -s "$OPERATON_URL/process-definition?latestVersion=true" | "$PY_BIN" -c \
  "import sys,json;[print('  ',d['key'],'tenant='+str(d['tenantId'])) for d in json.load(sys.stdin)]"

if [ "$FAILURES" -gt 0 ] || [ "$REMAINING" -gt 0 ]; then
  echo
  echo "NOT clean: $FAILURES delete failure(s), $REMAINING record(s) remaining." >&2
  exit 1
fi

echo
echo "Clean."
