/**
 * reset-pa-dossiers.ts — wipe the PA dossier tables back to a known state.
 *
 * Exists because live and mock have to be separable: the dossier tables were
 * seeded from the same SEED_DOSSIERS the frontend serves as MOCK_DOSSIERS, so
 * any database that has ever been initialised carries those rows and live mode
 * shows mock-plus-authored. Dropping the seed from initDossiersDb (see
 * PA_SEED_DEMO_DOSSIERS) stops NEW databases picking them up; this script is how
 * an existing one is cleaned.
 *
 * It deletes every row from pa_dossiers and pa_dossier_versions — authored
 * dossiers included, which is the point of a reset — and then re-runs
 * initDossiersDb(). That re-creates the tables, re-seeds the template and
 * snippet libraries (you cannot author a dossier without a sjabloon), and seeds
 * the demo dossiers only when PA_SEED_DEMO_DOSSIERS is on. So:
 *
 *   --yes                              → empty dossiers, ready for authoring
 *   PA_SEED_DEMO_DOSSIERS=true --yes   → the demo set, fresh at v3
 *
 * --seed-only skips the delete entirely and just runs the seed, which is how you
 * restore the demo dossiers without discarding authored ones. That matters
 * because the seeded Zoekcriteria and every already-confirmed signal reference
 * dossier ids like 'stikstof' and 'lelystad'; once those dossiers are gone the
 * references dangle, and re-seeding is what repairs them.
 *
 * Note it does NOT touch pa_saved_searches. The seeded Zoekcriteria carry
 * dossier_id values ('stikstof', 'lelystad', 'energie', 'jeugdzorg') with no
 * foreign key behind them, so after an empty reset those criteria — and any
 * signal already tagged to a dossier — point at dossiers that no longer exist.
 * That is survivable and reverses itself if you re-seed, but it is why this is
 * a deliberate script and not something init does on its own.
 *
 * Usage (from packages/backend):
 *   npm run pa:reset-dossiers -- --yes
 *   PA_SEED_DEMO_DOSSIERS=true npm run pa:reset-dossiers -- --yes
 *   PA_SEED_DEMO_DOSSIERS=true npm run pa:reset-dossiers -- --yes --seed-only
 *   npm run pa:reset-dossiers -- --yes --drop-demo   # strip demo, keep authored
 *   npm run pa:reset-dossiers            # dry run: reports, writes nothing
 */

import { db } from '../src/services/audit.service';
import { initDossiersDb, DEMO_DOSSIER_IDS } from '../src/pa-monitoring/pa-dossiers.db';
import { config } from '../src/utils/config';

const TABLES = ['pa_dossiers', 'pa_dossier_versions'] as const;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    const row = await db.one<{ count: string }>(`SELECT COUNT(*) AS count FROM ${t}`);
    out[t] = Number(row.count);
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const confirmed = argv.includes('--yes');
  const force = argv.includes('--force');
  // Additive: seed whatever is missing and leave every existing row alone. The
  // seed INSERTs are ON CONFLICT DO NOTHING, so this is how you restore the demo
  // dossiers to a database that already holds authored ones you want to keep.
  const seedOnly = argv.includes('--seed-only');
  // The inverse of --seed-only: strip the demo rows and keep everything else.
  // This is what makes an environment that already has authored dossiers live-
  // only, without the all-or-nothing of a full reset.
  const dropDemo = argv.includes('--drop-demo');

  // A reset is unrecoverable and this connects to whatever DATABASE_URL the
  // package would load, so production needs saying twice.
  if (config.deploymentEnv === 'production' && !force) {
    console.error('Refusing to reset a production database. Re-run with --force if you mean it.');
    process.exitCode = 1;
    return;
  }

  const before = await counts();
  console.error(`Target      : ${config.deploymentEnv}`);
  console.error(`Before      : ${JSON.stringify(before)}`);
  console.error(
    `Demo seed   : ${config.pa.seedDemoDossiers ? 'ON — will re-seed' : 'off — will stay empty'}`
  );

  const mode = dropDemo
    ? 'drop-demo — removes only the seeded rows'
    : seedOnly
      ? 'seed-only — deletes nothing'
      : 'full reset';
  console.error(`Mode        : ${mode}`);

  if (!confirmed) {
    console.error('\nDry run — nothing written. Re-run with --yes to proceed.');
    return;
  }

  if (dropDemo) {
    const ids = [...DEMO_DOSSIER_IDS];
    await db.none('DELETE FROM pa_dossier_versions WHERE dossier_id IN ($1:csv)', [ids]);
    await db.none('DELETE FROM pa_dossiers WHERE id IN ($1:csv)', [ids]);
    console.error(`Deleted     : demo rows only (${ids.join(', ')})`);
  } else if (seedOnly) {
    console.error('Deleted     : nothing (--seed-only)');
  } else {
    // Versions first: dossier_id has no foreign key, so nothing cascades.
    await db.none('DELETE FROM pa_dossier_versions');
    await db.none('DELETE FROM pa_dossiers');
    console.error('Deleted     : all dossier and version rows');
  }

  await initDossiersDb();

  const after = await counts();
  console.error(`After       : ${JSON.stringify(after)}`);
}

main()
  .catch((err: unknown) => {
    console.error('Reset failed:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$pool.end();
  });
