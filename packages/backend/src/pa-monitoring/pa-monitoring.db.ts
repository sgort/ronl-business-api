/**
 * PA Monitoring — database init and seed.
 * Tables created inline (no migration framework, matches audit.service pattern).
 * Seeded with Flevoland PA taxonomy on first run.
 */

import { db } from '@services/audit.service';
import { createLogger } from '@utils/logger';

const logger = createLogger('pa-monitoring-db');

const PA_TAXONOMY_SEED = [
  {
    id: 'stikstof',
    query: 'stikstof OR gebiedsproces OR reductiekader',
    tags: ['stikstof', 'landbouw', 'natuur'],
    bronnen: ['tk', 'ob'],
  },
  {
    id: 'lelystad',
    query: 'Lelystad Airport OR laagvliegroutes OR luchthavenbesluit',
    tags: ['luchtvaart', 'lelystad'],
    bronnen: ['tk', 'ob'],
  },
  {
    id: 'energie',
    query: 'netcongestie OR netcapaciteit OR "energy hub"',
    tags: ['energie', 'netcongestie'],
    bronnen: ['tk', 'ob'],
  },
  {
    id: 'jeugdzorg',
    query: 'jeugdzorg OR hervormingsagenda jeugd',
    tags: ['jeugdzorg', 'zorg'],
    bronnen: ['tk', 'ob'],
  },
];

export async function initPaDb(): Promise<void> {
  try {
    await db.none(`
      CREATE TABLE IF NOT EXISTS pa_saved_searches (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL,
        user_id     TEXT,
        scope       TEXT NOT NULL DEFAULT 'tenant',
        dossier_id  TEXT,
        query       JSONB NOT NULL,
        tags        TEXT[] NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pa_signals (
        id            TEXT PRIMARY KEY,
        tab           TEXT NOT NULL,
        dossier_id    TEXT,
        title         TEXT NOT NULL,
        src           TEXT NOT NULL,
        bron          TEXT,
        ref           JSONB,
        rel           INTEGER NOT NULL DEFAULT 5,
        impact        TEXT,
        impact_label  TEXT,
        duiding       TEXT,
        status        TEXT NOT NULL DEFAULT 'candidate',
        ai_draft      JSONB,
        confirmed_by  TEXT,
        confirmed_at  TIMESTAMPTZ,
        source_key    TEXT UNIQUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    logger.info('PA monitoring tables ready');
    await seedTaxonomy();
  } catch (err) {
    logger.warn('PA monitoring DB init failed — will retry on next request', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function seedTaxonomy(): Promise<void> {
  for (const entry of PA_TAXONOMY_SEED) {
    try {
      await db.none(
        `INSERT INTO pa_saved_searches (id, tenant_id, scope, dossier_id, query, tags)
         VALUES ($1, 'flevoland', 'tenant', $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [
          `seed-${entry.id}`,
          entry.id,
          JSON.stringify({ q: entry.query, types: [], source: entry.bronnen }),
          entry.tags,
        ]
      );
    } catch (err) {
      logger.warn('PA taxonomy seed failed for dossier', {
        dossier: entry.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  logger.info('PA taxonomy seed complete');
}
