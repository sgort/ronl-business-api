/**
 * edocs-healthcheck.ts — direct eDOCS reachability + login probe.
 *
 * Answers the two Layer-2 questions the live smoke suite cares about —
 *   1. can we REACH eDOCS?        (unauthenticated GET /libraries)
 *   2. can the creds LOG IN?      (throttled POST /connect)
 * — by running EdocsService.healthCheck() in-process against the LOCAL backend
 * config (.env.<NODE_ENV>, default development).
 *
 * Unlike the GET /v1/edocs/status HTTP route, this needs NO running backend, NO
 * Keycloak token and NO CLIENT_SECRET: it is not behind the JWT gate. It reflects
 * whatever EDOCS_* the backend package would load, independent of any TARGET.
 *
 * The login probe is rate-limited inside the service (30s cache) so repeated runs
 * cannot hammer the DM login endpoint and lock the account out.
 *
 * Usage:
 *   cd packages/backend && npx tsx scripts/edocs-healthcheck.ts
 *   npm run edocs:health                       # from packages/backend
 *   npm run edocs:health -- --quiet            # sentinel line only (for scripts)
 *
 * Output:
 *   - human summary on stderr (suppressed with --quiet)
 *   - one machine-readable line on stdout: `EDOCS_HEALTH_RESULT {json}`
 *
 * Exit codes: 0 ok/stub · 3 reachable-but-login-failed · 4 unreachable · 1 error
 */
import { config } from '@utils/config';
import { edocsService } from '@services/edocs.service';

const quiet = process.argv.includes('--quiet');
const err = (msg: string): void => {
  if (!quiet) process.stderr.write(msg + '\n');
};

/** Emit the sentinel line, then exit only once stdout has drained (Windows-safe). */
function emitAndExit(result: unknown, code: number): void {
  process.stdout.write('EDOCS_HEALTH_RESULT ' + JSON.stringify(result) + '\n', () => {
    // Force exit — winston's DailyRotateFile transport keeps timers alive otherwise.
    process.exit(code);
  });
}

async function main(): Promise<void> {
  err(`[edocs-healthcheck] baseUrl : ${config.edocs.baseUrl || '(unset)'}`);
  err(
    `[edocs-healthcheck] library : ${config.edocs.library}  user: ${
      config.edocs.userId || '(unset)'
    }  stubMode: ${config.edocs.stubMode}`
  );

  const health = await edocsService.healthCheck();

  if (health.status === 'stub') {
    err('  ~ stub mode enabled — set EDOCS_STUB_MODE=false to probe the real server');
    return emitAndExit(health, 0);
  }

  err(`  reachable     : ${health.reachable}`);
  err(`  authenticated : ${health.authenticated}${health.error ? `  (${health.error})` : ''}`);
  if (health.latency !== undefined) err(`  latency       : ${health.latency} ms`);

  if (!health.reachable) return emitAndExit(health, 4);
  if (!health.authenticated) return emitAndExit(health, 3);
  return emitAndExit(health, 0);
}

main().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  err('  ✗ probe crashed: ' + message);
  emitAndExit({ status: 'down', reachable: false, authenticated: false, error: message }, 1);
});
