// Tests for check-upstream-certs.mjs. Self-contained, like the other
// scripts/*.test.mjs: no test runner, prints a PASS count, exits 1 on any
// failure. No network: probe() is exercised against a closed local port only.
import net from "node:net";
import * as C from "./check-upstream-certs.mjs";

let passed = 0;
const failures = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

const NOW = new Date("2026-11-13T12:00:00Z");
const HOST = "brp-api-mock.open-regels.nl";

// ── the host list ───────────────────────────────────────────────────────────

check("the BRP mock is checked", C.HOSTS.includes(HOST), true);
check("fourteen days' warning", C.MIN_DAYS, 14);

// ── daysUntil ───────────────────────────────────────────────────────────────

check("days until a date", C.daysUntil("Nov 25 09:45:03 2026 GMT", NOW), 11);
check("rounds down", C.daysUntil("Nov 27 11:59:59 2026 GMT", NOW), 13);
check("negative once expired", C.daysUntil("Nov 12 12:00:00 2026 GMT", NOW), -1);

// ── evaluate ────────────────────────────────────────────────────────────────

const good = {
  host: HOST,
  authorized: true,
  validTo: "Feb 11 10:09:12 2027 GMT",
  subjectAltName: `DNS:${HOST}`,
};
check("a valid certificate with time to spare", C.evaluate(good, NOW), {
  host: HOST,
  ok: true,
  reason: "valid",
  daysLeft: 89,
  validTo: good.validTo,
  subjectAltName: good.subjectAltName,
});

// The 13 November 2026 outage, as the probe saw it.
const wrongHost = {
  host: HOST,
  authorized: false,
  authorizationError: "ERR_TLS_CERT_ALTNAME_INVALID",
  validTo: "Jan 15 01:43:46 2027 GMT",
  subjectAltName: "DNS:*.famgort.synology.me, DNS:famgort.synology.me",
};
const outage = C.evaluate(wrongHost, NOW);
check("a certificate for another host fails", outage.ok, false);
check(
  "and says why",
  outage.reason,
  "certificate rejected: ERR_TLS_CERT_ALTNAME_INVALID",
);
check("and shows the names it does carry", outage.subjectAltName, wrongHost.subjectAltName);

check(
  "an expired certificate fails",
  C.evaluate(
    { host: HOST, authorized: false, authorizationError: "CERT_HAS_EXPIRED" },
    NOW,
  ).reason,
  "certificate rejected: CERT_HAS_EXPIRED",
);
check(
  "a rejection without a reason still fails",
  C.evaluate({ host: HOST, authorized: false }, NOW).ok,
  false,
);

const soon = C.evaluate({ ...good, validTo: "Nov 25 09:45:03 2026 GMT" }, NOW);
check("a valid certificate expiring within the window fails", soon.ok, false);
check("with the days left", soon.reason, "expires in 11 day(s), fewer than 14");
check(
  "the window is configurable",
  C.evaluate({ ...good, validTo: "Nov 25 09:45:03 2026 GMT" }, NOW, 7).ok,
  true,
);
check("exactly the window passes", C.evaluate({ ...good, validTo: "Nov 27 12:00:00 2026 GMT" }, NOW).ok, true);

check(
  "a connection failure fails",
  C.evaluate({ host: HOST, error: "ENOTFOUND" }, NOW),
  { host: HOST, ok: false, reason: "could not connect: ENOTFOUND" },
);

// ── report ──────────────────────────────────────────────────────────────────

const md = C.report([C.evaluate(good, NOW), outage]);
check("one row per host, after the header", md.trim().split("\n").length, 4);
check("marks the failure", md.includes("❌ certificate rejected: ERR_TLS_CERT_ALTNAME_INVALID"), true);
check("marks the pass", md.includes("✅ valid"), true);
check(
  "dashes for what a failed connection cannot know",
  C.report([{ host: HOST, ok: false, reason: "could not connect: x" }]).includes("| — | — | — |"),
  true,
);

// ── probe ───────────────────────────────────────────────────────────────────

// A port that was just free: connecting is refused, and probe resolves with
// the error rather than rejecting.
const port = await new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});
const refused = await C.probe(HOST, { port, connectHost: "127.0.0.1", timeoutMs: 2_000 });
check("probe reports a refused connection", refused, { host: HOST, error: "ECONNREFUSED" });

// A server that accepts but never speaks TLS: the timeout settles it.
const silent = net.createServer(() => {});
await new Promise((resolve) => silent.listen(0, "127.0.0.1", resolve));
const timedOut = await C.probe(HOST, {
  port: silent.address().port,
  connectHost: "127.0.0.1",
  timeoutMs: 200,
});
silent.close();
check("probe reports a timeout", timedOut, { host: HOST, error: "timeout" });

// ── result ──────────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`FAIL ${failures.length}, PASS ${passed}\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`PASS ${passed}`);
