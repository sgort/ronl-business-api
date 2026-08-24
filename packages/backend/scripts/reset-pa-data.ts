/**
 * reset-pa-data.ts — put the PA live store back to a known state.
 *
 * Exists because live and mock have to be separable, and by default they were
 * not. Two modules seeded fixture content into the database on every startup:
 * pa-dossiers.db seeded pa_dossiers from the same SEED_DOSSIERS the frontend
 * serves as MOCK_DOSSIERS, and pa-monitoring.db seeded pa_saved_searches from
 * PA_TAXONOMY_SEED. Curation then ran against those seeded criteria and filled
 * pa_signals, so "switch to live" showed a fully populated cockpit built
 * entirely from fixture configuration.
 *
 * Both seeds are now opt-in behind PA_SEED_DEMO_DATA. That stops NEW databases
 * picking them up; this script is how an existing one is cleaned.
 *
 * Modes (all no-ops without --yes, which is the confirmation):
 *
 *   --yes                → full reset. Every row in the six PA tables goes:
 *                          dossiers, versions, saved searches, signals,
 *                          notifications, feed tokens. Then init re-runs, which
 *                          re-seeds demo content only if PA_SEED_DEMO_DATA is
 *                          on. Off, you get a genuinely empty live store.
 *
 *   --drop-demo          → surgical. Deletes only the rows the seeds write —
 *                          DEMO_DOSSIER_IDS and DEMO_SEARCH_IDS — and leaves
 *                          authored dossiers, hand-made searches and signals
 *                          alone. Use on an environment that has real work in it.
 *
 *   --seed-only          → additive. Deletes nothing, just runs the seed. Needs
 *                          PA_SEED_DEMO_DATA=true to do anything, and restores
 *                          demo content without discarding authored work.
 *
 * Signals and notifications are treated as derivations, not authored content:
 * curation regenerates them from the live sources once real criteria exist. The
 * confirm/dismiss decisions on them are human work, but they are decisions about
 * fixture-driven results, which is exactly what a reset is meant to clear.
 *
 * Usage (from packages/backend):
 *   npm run pa:reset-data                                  # dry run, writes nothing
 *   npm run pa:reset-data -- --yes                         # empty live store
 *   npm run pa:reset-data -- --yes --drop-demo             # strip demo, keep authored
 *   PA_SEED_DEMO_DATA=true npm run pa:reset-data -- --yes  # fresh demo environment
 *   PA_SEED_DEMO_DATA=true npm run pa:reset-data -- --yes --seed-only
 */

import { db } from '../src/services/audit.service';
import { initDossiersDb, DEMO_DOSSIER_IDS } from '../src/pa-monitoring/pa-dossiers.db';
import { initPaDb, DEMO_SEARCH_IDS } from '../src/pa-monitoring/pa-monitoring.db';
import { config } from '../src/utils/config';

/** Delete order matters only for readability — none of these carry foreign keys. */
const TABLES = [
  'pa_dossier_versions',
  'pa_dossiers',
  'pa_notifications',
  'pa_signals',
  'pa_saved_searches',
  'pa_feed_tokens',
] as const;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    const row = await db.one<{ count: string }>(`SELECT COUNT(*) AS count FROM ${t}`);
    out[t] = Number(row.count);
  }
  return out;
}

function report(label: string, value: Record<string, number>): void {
  const line = Object.entries(value)
    .map(([k, v]) => `${k.replace('pa_', '')}=${v}`)
    .join('  ');
  console.error(`${label.padEnd(12)}: ${line}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const confirmed = argv.includes('--yes');
  const force = argv.includes('--force');
  const seedOnly = argv.includes('--seed-only');
  const dropDemo = argv.includes('--drop-demo');

  // A reset is unrecoverable and this connects to whatever DATABASE_URL the
  // package would load, so production needs saying twice.
  if (config.deploymentEnv === 'production' && !force) {
    console.error('Refusing to reset a production database. Re-run with --force if you mean it.');
    process.exitCode = 1;
    return;
  }

  const mode = dropDemo
    ? 'drop-demo — removes only seeded rows'
    : seedOnly
      ? 'seed-only — deletes nothing'
      : 'full reset — every PA row';

  console.error(`Target      : ${config.deploymentEnv}`);
  console.error(`Mode        : ${mode}`);
  console.error(
    `Demo seed   : ${config.pa.seedDemoData ? 'ON — will re-seed' : 'off — will stay empty'}`
  );
  report('Before', await counts());

  if (!confirmed) {
    console.error('\nDry run — nothing written. Re-run with --yes to proceed.');
    return;
  }

  if (dropDemo) {
    const dossierIds = [...DEMO_DOSSIER_IDS];
    const searchIds = [...DEMO_SEARCH_IDS];
    await db.none('DELETE FROM pa_dossier_versions WHERE dossier_id IN ($1:csv)', [dossierIds]);
    await db.none('DELETE FROM pa_dossiers WHERE id IN ($1:csv)', [dossierIds]);
    await db.none('DELETE FROM pa_saved_searches WHERE id IN ($1:csv)', [searchIds]);
    console.error(
      `Deleted     : ${dossierIds.length} demo dossiers, ${searchIds.length} demo searches`
    );
  } else if (seedOnly) {
    console.error('Deleted     : nothing (--seed-only)');
  } else {
    for (const t of TABLES) await db.none(`DELETE FROM ${t}`);
    console.error('Deleted     : every row in all six PA tables');
  }

  // Re-create anything missing and re-seed per PA_SEED_DEMO_DATA. initPaDb also
  // owns the pa_signals schema, so it has to run even on an empty reset.
  await initPaDb();
  await initDossiersDb();

  report('After', await counts());
}

main()
  .catch((err: unknown) => {
    console.error('Reset failed:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$pool.end();
  });
