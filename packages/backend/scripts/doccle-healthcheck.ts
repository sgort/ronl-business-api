/**
 * doccle-healthcheck.ts — direct Doccle reachability probe.
 *
 * Answers the one Layer-2 question the live smoke suite can ask without
 * mutating anything — can we REACH the Doccle mci-rest-app host? — by running
 * DoccleService.healthCheck() in-process against the LOCAL backend config
 * (.env.<NODE_ENV>, default development).
 *
 * Unlike eDOCS, the Doccle v1 API has no side-effect-free authenticated
 * endpoint, so this can only prove the host responds — it does NOT verify
 * DOCCLE_USERNAME/DOCCLE_PASSWORD. For that, see scripts/test-doccle-live.sh,
 * which exercises the real receiver-upsert + put-document path.
 *
 * Unlike the GET /v1/doccle/status HTTP route, this needs NO running backend, NO
 * Keycloak token and NO CLIENT_SECRET: it is not behind the JWT gate. It reflects
 * whatever DOCCLE_* the backend package would load, independent of any TARGET.
 *
 * Usage:
 *   cd packages/backend && npx tsx scripts/doccle-healthcheck.ts
 *   npm run doccle:health                       # from packages/backend
 *   npm run doccle:health -- --quiet            # sentinel line only (for scripts)
 *
 * Output:
 *   - human summary on stderr (suppressed with --quiet)
 *   - one machine-readable line on stdout: `DOCCLE_HEALTH_RESULT {json}`
 *
 * Exit codes: 0 ok/stub/reachable · 4 unreachable · 1 error
 */
import { config } from '@utils/config';
import { doccleService } from '@services/doccle.service';

const quiet = process.argv.includes('--quiet');
const err = (msg: string): void => {
  if (!quiet) process.stderr.write(msg + '\n');
};

/** Emit the sentinel line, then exit only once stdout has drained (Windows-safe). */
function emitAndExit(result: unknown, code: number): void {
  process.stdout.write('DOCCLE_HEALTH_RESULT ' + JSON.stringify(result) + '\n', () => {
    // Force exit — winston's DailyRotateFile transport keeps timers alive otherwise.
    process.exit(code);
  });
}

async function main(): Promise<void> {
  err(`[doccle-healthcheck] apiBaseUrl : ${config.doccle.apiBaseUrl || '(unset)'}`);
  err(
    `[doccle-healthcheck] username    : ${config.doccle.username || '(unset)'}  stubMode: ${
      config.doccle.stubMode
    }`
  );

  const health = await doccleService.healthCheck();

  if (health.status === 'stub') {
    err('  ~ stub mode enabled — set DOCCLE_STUB_MODE=false to probe the real server');
    return emitAndExit(health, 0);
  }

  err(`  reachable : ${health.reachable}${health.error ? `  (${health.error})` : ''}`);
  if (health.latency !== undefined) err(`  latency   : ${health.latency} ms`);
  if (health.note) err(`  note      : ${health.note}`);

  if (!health.reachable) return emitAndExit(health, 4);
  return emitAndExit(health, 0);
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  err('  ✗ probe crashed: ' + message);
  emitAndExit({ status: 'down', reachable: false, error: message }, 1);
});
