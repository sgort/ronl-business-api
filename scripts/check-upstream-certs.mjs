#!/usr/bin/env node
// Checks the TLS certificate of each upstream this API depends on but does
// not host: that it validates for the hostname, and that it does not expire
// within MIN_DAYS. Run daily by .github/workflows/upstream-certs.yml.
//
// Why it exists: on 13 November 2026 the BRP mock's reverse proxy stopped
// presenting the certificate for brp-api-mock.open-regels.nl and served the
// NAS's default one instead. A valid certificate for the hostname existed the
// whole time; it was just not the one being served. Every handshake failed
// with ERR_TLS_CERT_ALTNAME_INVALID and the citizen timeline went blank on
// ACC and PROD. Nothing here noticed: the health check did not look at the
// upstream, and the API answered a bare 500. /v1/health now reports it
// (dependencies.brp), but only once it has broken. This warns before
// expiry, and within a day of a wrong certificate.
//
// Usage: node scripts/check-upstream-certs.mjs [host ...]
// Exit 0 when every certificate is fine, 1 when any is not.
// CERT_REPORT_FILE, when set, receives the Markdown report as well as stdout
// (and GITHUB_STEP_SUMMARY, when set).

import tls from "node:tls";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** Hosts we depend on and someone outside Azure serves. Add to this list. */
export const HOSTS = ["brp-api-mock.open-regels.nl"];

/** Fail when fewer days than this remain: time to notice a failed renewal. */
export const MIN_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `now` until `validTo` (a certificate's valid_to string). */
export function daysUntil(validTo, now) {
  return Math.floor((new Date(validTo).getTime() - now.getTime()) / DAY_MS);
}

/**
 * Judge one probe result.
 * @param {{host: string, authorized?: boolean, authorizationError?: string,
 *          validTo?: string, subjectAltName?: string, error?: string}} probe
 * @returns {{host: string, ok: boolean, reason: string, daysLeft?: number,
 *            validTo?: string, subjectAltName?: string}}
 */
export function evaluate(probe, now, minDays = MIN_DAYS) {
  const { host, validTo, subjectAltName } = probe;
  if (probe.error) {
    return { host, ok: false, reason: `could not connect: ${probe.error}` };
  }
  if (!probe.authorized) {
    return {
      host,
      ok: false,
      reason: `certificate rejected: ${probe.authorizationError ?? "unknown reason"}`,
      validTo,
      subjectAltName,
    };
  }
  const daysLeft = daysUntil(validTo, now);
  if (daysLeft < minDays) {
    return {
      host,
      ok: false,
      reason: `expires in ${daysLeft} day(s), fewer than ${minDays}`,
      daysLeft,
      validTo,
      subjectAltName,
    };
  }
  return { host, ok: true, reason: "valid", daysLeft, validTo, subjectAltName };
}

/** A Markdown report of evaluated results. */
export function report(results) {
  const lines = [
    "| Host | Result | Expires | Days left | Names on the certificate |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const r of results) {
    lines.push(
      `| \`${r.host}\` | ${r.ok ? "✅" : "❌"} ${r.reason} | ${r.validTo ?? "—"} | ${
        r.daysLeft ?? "—"
      } | ${r.subjectAltName ?? "—"} |`,
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Open a TLS connection and read the certificate. rejectUnauthorized is off
 * so a bad certificate can still be described; `authorized` and
 * `authorizationError` carry Node's verdict, hostname check included.
 * Never rejects.
 */
export function probe(host, { port = 443, connectHost = host, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ host, ...result });
    };
    const socket = tls.connect(
      { host: connectHost, port, servername: host, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate();
        done({
          authorized: socket.authorized,
          authorizationError: socket.authorizationError
            ? String(socket.authorizationError)
            : undefined,
          validTo: cert.valid_to,
          subjectAltName: cert.subjectaltname,
        });
      },
    );
    socket.setTimeout(timeoutMs, () => done({ error: "timeout" }));
    socket.on("error", (e) => done({ error: e.code ?? e.message }));
  });
}

async function main(hosts) {
  const now = new Date();
  const results = [];
  for (const host of hosts) results.push(evaluate(await probe(host), now));
  const md = report(results);
  process.stdout.write(md);
  for (const file of [process.env.CERT_REPORT_FILE, process.env.GITHUB_STEP_SUMMARY]) {
    if (file) fs.appendFileSync(file, md);
  }
  return results.every((r) => r.ok) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hosts = process.argv.length > 2 ? process.argv.slice(2) : HOSTS;
  process.exitCode = await main(hosts);
}
