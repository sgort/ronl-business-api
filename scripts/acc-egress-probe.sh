#!/usr/bin/env bash
# acc-egress-probe.sh
# Measures what an Azure App Service can actually reach FROM ITS OWN OUTBOUND IP,
# by running the probe inside the app's Kudu container rather than from a laptop.
#
# Why this exists: a host can serve your workstation and refuse the deployed app,
# and the refusal need not look like one. europarl.europa.eu answers ACC's
# outbound range with HTTP 202 and a zero-byte text/html body -- which passes
# res.ok, parses to zero items, and reports success. From a laptop the same URL
# returns 200 and the feed. Only a probe from the real origin can tell the two
# apart. See issues #54 and #55.
#
# Usage:
#   bash scripts/acc-egress-probe.sh                        # default URL set
#   bash scripts/acc-egress-probe.sh URL [URL ...]          # probe these instead
#   bash scripts/acc-egress-probe.sh --app <name> URL ...   # another App Service
#
# Optional overrides (env vars):
#   ACC_APP      App Service name (default: ronl-business-api-acc)
#   PROBE_UA     User-Agent to send (default: the backend's EU client UA)
#
# Requires: az (logged in) and python3/python. No secrets are read from disk and
# none are printed -- auth is a short-lived AAD token minted from your az session.
#
# ── Three traps this script exists to have already solved ────────────────────
#
# 1. SCM basic auth is DISABLED on these sites
#    (basicPublishingCredentialsPolicies/scm -> allow:false), so publish-profile
#    credentials return 401. Kudu also accepts an AAD bearer token; that is the
#    route used here.
#
# 2. Kudu's Linux /api/command endpoint is NOT a shell. It splits the string and
#    execs it, so nothing shell-ish survives:
#      - quotes pass through literally, and  node -e '...'  makes node die on
#        `SyntaxError: Invalid or unexpected token`;
#      - `;` does not chain: `echo A; node -v` prints the literal "A; node -v",
#        which is how a naive substring check passes without node ever running;
#      - `VAR=x cmd` is read as a path: "No such file or directory".
#    Hence one command per call, no chaining, no env prefixes, and the probe
#    uploaded as a FILE through the VFS API rather than passed as an argument.
#    Anything variable (the User-Agent) is baked into that file.
#
# 3. The VFS root is /home, not /. `PUT /api/vfs/tmp/probe.js` lands the file at
#    /home/tmp/probe.js, and running `node /tmp/probe.js` gives MODULE_NOT_FOUND.
#
# Two earlier attempts at this measurement were discarded because they reported
# numbers produced by their own broken escaping -- one control against a
# known-good host came back 405. Hence the controls below: the probe prints the
# egress IP it is leaving through and checks two hosts known to work BEFORE any
# result about the host under investigation is worth believing. A probe that
# cannot reproduce a known-good answer is measuring itself.

set -uo pipefail

# On Windows, `python3` is usually the Microsoft Store stub: it resolves on PATH
# and then refuses to run, so testing for its presence is not enough -- it has to
# be executed. Git Bash installs commonly ship `python` only.
PY_BIN=""
for candidate in python3 python py; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'print(1)' >/dev/null 2>&1; then
    PY_BIN="$candidate"
    break
  fi
done
if [ -z "$PY_BIN" ]; then
  echo "ERROR: no working python interpreter found (tried python3, python, py)." >&2
  exit 1
fi

ACC_APP="${ACC_APP:-ronl-business-api-acc}"
PROBE_UA="${PROBE_UA:-Mozilla/5.0 (compatible; ronl-business-api/1.0; +https://open-regels.nl)}"

URLS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --app) ACC_APP="$2"; shift 2 ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) URLS+=("$1"); shift ;;
  esac
done

# Default set: the two EU sources plus the EP Open Data API that replaced the
# first of them, so a single run shows both the block and the way around it.
if [ ${#URLS[@]} -eq 0 ]; then
  URLS=(
    "https://www.europarl.europa.eu/rss/doc/plenary/nl.xml"
    "https://www.europarl.europa.eu/plenary/nl/texts-submitted.html"
    "https://data.europarl.europa.eu/api/v2/plenary-documents/feed"
  )
fi

SCM_HOST="${ACC_APP}.scm.azurewebsites.net"

echo "probing from inside ${ACC_APP}"
echo

TOKEN="$(az account get-access-token --resource https://management.core.windows.net/ \
         --query accessToken -o tsv 2>/dev/null | tr -d '\r')"
if [ -z "$TOKEN" ]; then
  echo "ERROR: could not mint an AAD token. Run 'az login' first." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

kudu_cmd() {
  # $1 = command to run in the Kudu container. Prints its stdout.
  "$PY_BIN" - "$SCM_HOST" "$TOKEN" "$1" <<'PY'
import json, ssl, sys, urllib.request
host, token, cmd = sys.argv[1], sys.argv[2], sys.argv[3]
req = urllib.request.Request('https://%s/api/command' % host,
    data=json.dumps({'command': cmd, 'dir': '/'}).encode(),
    headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
    method='POST')
try:
    with urllib.request.urlopen(req, timeout=300,
                                context=ssl.create_default_context()) as r:
        d = json.loads(r.read().decode())
except Exception as e:                      # noqa: BLE001 - surfaced to the caller
    print('KUDU_ERROR %s' % e); sys.exit(0)
out = (d.get('Output') or '').strip('\r\n')
err = (d.get('Error') or '').strip()
sys.stdout.reconfigure(newline='')          # no CRLF: this output is parsed
print(out)
if err:
    print('\n[stderr] ' + err[:400])
PY
}

# ── 1. Channel check ─────────────────────────────────────────────────────────
# Commands whose correct output is known. If these do not answer as expected the
# run stops: a broken channel produces plausible-looking failures for every URL.
echo "== 1. channel check =="
# One command per call, and an EXACT match on each. Chaining these with `;` and
# testing for a substring is how an earlier version of this script passed its own
# check while running nothing: /api/command is not a shell, so it echoed the
# literal "CHANNEL_OK; node -v" -- which contains the string being grepped for.
ECHOED="$(kudu_cmd 'echo CHANNEL_OK' | tr -d '\r\n')"
if [ "$ECHOED" != "CHANNEL_OK" ]; then
  echo "   FAILED -- echo returned '$ECHOED', expected exactly 'CHANNEL_OK'."
  echo "   Not reporting probe results from an unverified channel."
  exit 1
fi
NODE_V="$(kudu_cmd 'node -v' | tr -d '\r\n')"
case "$NODE_V" in
  v[0-9]*) ;;
  *)
    echo "   FAILED -- 'node -v' returned '$NODE_V'."
    echo "   Not reporting results from a container with no usable node."
    exit 1
    ;;
esac
printf '   ok (node %s)\n\n' "$NODE_V"

# ── 2. Build the probe and upload it as a file ───────────────────────────────
{
  # Baked in, not passed: `VAR=x node ...` is read as a path by /api/command.
  printf "const UA = '%s';\n" "$(printf '%s' "$PROBE_UA" | sed "s/'/\\\\'/g")"
  echo "const P = ["
  echo "  ['EGRESS IP (as the internet sees us)', 'https://api.ipify.org?format=json'],"
  echo "  ['CONTROL tweedekamer', 'https://gegevensmagazijn.tweedekamer.nl/OData/v4/2.0/Document?\$top=1'],"
  echo "  ['CONTROL overheid.nl', 'https://repository.overheid.nl/sru?operation=searchRetrieve&version=2.0&maximumRecords=1&query=c.product-area==officielepublicaties'],"
  for u in "${URLS[@]}"; do
    printf "  [%s, %s],\n" "'${u#https://}'" "'$u'"
  done
  cat <<'JS'
];
(async () => {
  for (const [label, url] of P) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 25000);
    try {
      const r = await fetch(url, {
        signal: c.signal,
        headers: {
          'User-Agent': UA,
          Accept: 'application/atom+xml, application/rss+xml, application/xml, application/ld+json, text/xml, application/json, text/html',
        },
      });
      const b = await r.text();
      const ct = (r.headers.get('content-type') || '-').split(';')[0];
      console.log(
        '  ' + label.slice(0, 52).padEnd(54) +
        'HTTP ' + r.status + '  len=' + String(b.length).padStart(7) +
        '  ' + ct.padEnd(24) + JSON.stringify(b.slice(0, 30).replace(/\s+/g, ' ')),
      );
    } catch (e) {
      console.log('  ' + label.slice(0, 52).padEnd(54) + 'FETCH_ERROR ' + e.name + ': ' + e.message);
    } finally {
      clearTimeout(t);
    }
  }
})();
JS
} > "$TMP/probe.js"

echo "== 2. upload probe via VFS (never through argv) =="
"$PY_BIN" - "$SCM_HOST" "$TOKEN" "$TMP/probe.js" <<'PY'
import ssl, sys, urllib.error, urllib.request
host, token, path = sys.argv[1], sys.argv[2], sys.argv[3]
body = open(path, 'rb').read()
ctx = ssl.create_default_context()

def call(method, data=None, extra=None):
    h = {'Authorization': 'Bearer ' + token}
    if extra:
        h.update(extra)
    r = urllib.request.Request('https://%s/api/vfs/tmp/probe.js' % host,
                               data=data, headers=h, method=method)
    with urllib.request.urlopen(r, timeout=120, context=ctx) as resp:
        return resp.status, resp.read()

try:
    st, _ = call('PUT', body, {'Content-Type': 'application/octet-stream', 'If-Match': '*'})
except urllib.error.HTTPError as e:
    sys.exit('   PUT failed: HTTP %s %s' % (e.code, e.read()[:200]))
st2, back = call('GET')
same = back.replace(b'\r\n', b'\n') == body.replace(b'\r\n', b'\n')
print('   PUT %s, GET %s, %d bytes, content %s'
      % (st, st2, len(back), 'IDENTICAL' if same else 'DIFFERS'))
if not same:
    sys.exit('   uploaded file does not match -- refusing to trust its output')
PY
[ $? -ne 0 ] && exit 1

# ── 3. Run it ────────────────────────────────────────────────────────────────
# node's global fetch, deliberately: it is the client the backend itself uses,
# so a result here is a result for the real code path. curl could differ.
echo
echo "== 3. outbound reachability (node fetch, the backend's own client) =="
kudu_cmd 'node /home/tmp/probe.js'

kudu_cmd 'rm -f /home/tmp/probe.js' > /dev/null

cat <<'EOF'

Reading the result:
  * EGRESS IP must appear, and the two CONTROL rows must be 200. If they are
    not, the run says nothing about the URLs below them.
  * HTTP 202 with len=0 and text/html is a soft block, not an outage: it passes
    res.ok, so a client without an explicit non-XML guard records it as success.
EOF
