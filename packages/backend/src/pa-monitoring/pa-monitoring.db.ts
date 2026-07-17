/**
 * PA Monitoring — database init and seed.
 * Tables created inline (no migration framework, matches audit.service pattern).
 * Seeded with Flevoland PA taxonomy on first run.
 */

import { db } from '@services/audit.service';
import { createLogger } from '@utils/logger';

const logger = createLogger('pa-monitoring-db');

interface SeedEntry {
  id: string;
  /** Dossier to link matched signals to. Null for topic-searches not tied to a dossier. */
  dossierId?: string | null;
  query: string;
  tags: string[];
  bronnen: string[];
}

const PA_TAXONOMY_SEED: SeedEntry[] = [
  {
    id: 'stikstof',
    query: 'stikstof OR gebiedsproces OR reductiekader OR natuurherstelverordening',
    tags: ['stikstof', 'landbouw', 'natuur'],
    bronnen: ['tk', 'ob', 'eu'],
  },
  {
    id: 'lelystad',
    query: 'Lelystad Airport OR laagvliegroutes OR luchthavenbesluit',
    tags: ['luchtvaart', 'lelystad'],
    bronnen: ['tk', 'ob'],
  },
  {
    id: 'energie',
    query: 'netcongestie OR netcapaciteit OR "energy hub" OR flexibiliteit',
    tags: ['energie', 'netcongestie'],
    bronnen: ['tk', 'ob', 'eu'],
  },
  {
    id: 'jeugdzorg',
    query: 'jeugdzorg OR hervormingsagenda jeugd',
    tags: ['jeugdzorg', 'zorg'],
    bronnen: ['tk', 'ob'],
  },
  // EU-specific searches — English vocabulary that directly matches EP plenary titles.
  // TK/OB documents are in Dutch so these terms do not create cross-source noise.
  // dossierId is null: these are topic filters, not linked to a specific dossier.
  {
    id: 'eu-klimaat',
    dossierId: null,
    query: 'climate OR carbon OR emissions OR "green deal" OR "net zero"',
    tags: ['klimaat', 'emissies', 'duurzaamheid'],
    bronnen: ['eu'],
  },
  {
    id: 'eu-landbouw',
    dossierId: null,
    query: 'agriculture OR farming OR farmers OR pesticide OR "plant protection" OR "food safety"',
    tags: ['landbouw', 'voedsel', 'agrarisch'],
    bronnen: ['eu'],
  },
  {
    id: 'eu-energie',
    dossierId: null,
    query: 'energy OR electricity OR nuclear OR hydrogen OR renewable',
    tags: ['energie', 'energietransitie'],
    bronnen: ['eu'],
  },
  // Catch-all: EP document titles always start with "REPORT on...", "MOTION FOR A RESOLUTION...",
  // or "RECOMMENDATION on..." — these English structural words never appear in Dutch TK/OB docs.
  {
    id: 'eu-plenary',
    dossierId: null,
    query: 'REPORT OR MOTION OR RECOMMENDATION OR RESOLUTION OR OPINION',
    tags: [],
    bronnen: ['eu'],
  },
  // Media seed searches — region-scoped to Flevoland via the news-aggregator GET /search.
  // source:['media'] keeps these from hitting TK/OB/EU. The region gazetteer provides
  // the "geen ruis" filter; without it a national firehose adds noise.
  {
    id: 'media-flevoland',
    dossierId: null,
    query:
      'Flevoland OR Almere OR Lelystad OR Dronten OR Noordoostpolder OR Urk OR Zeewolde OR Zuiderzeeland',
    tags: ['flevoland', 'provincie'],
    bronnen: ['media'],
  },
  {
    id: 'media-stikstof',
    dossierId: 'stikstof',
    query: 'stikstof OR gebiedsproces OR reductiekader OR natuurherstel',
    tags: ['stikstof', 'landbouw', 'natuur'],
    bronnen: ['media'],
  },
  {
    id: 'media-lelystad',
    dossierId: 'lelystad',
    query: 'Lelystad Airport OR laagvliegroutes OR luchthavenbesluit',
    tags: ['luchtvaart', 'lelystad'],
    bronnen: ['media'],
  },
  {
    id: 'media-energie',
    dossierId: 'energie',
    query: 'netcongestie OR netcapaciteit OR "energy hub" OR flexibiliteit',
    tags: ['energie', 'netcongestie'],
    bronnen: ['media'],
  },
  // Per-gemeente watchlist searches — dossierId null so signals land on the watchlist.
  // Curators can link individual signals to a dossier during review.
  {
    id: 'media-gemeente-almere',
    dossierId: null,
    query: 'Almere',
    tags: ['almere', 'gemeente'],
    bronnen: ['media'],
  },
  {
    id: 'media-gemeente-lelystad',
    dossierId: null,
    query: 'Lelystad',
    tags: ['lelystad', 'gemeente'],
    bronnen: ['media'],
  },
  {
    id: 'media-gemeente-dronten',
    dossierId: null,
    query: 'Dronten OR Swifterbant OR Biddinghuizen',
    tags: ['dronten', 'gemeente'],
    bronnen: ['media'],
  },
  {
    id: 'media-gemeente-noordoostpolder',
    dossierId: null,
    query: 'Noordoostpolder OR Emmeloord',
    tags: ['noordoostpolder', 'gemeente'],
    bronnen: ['media'],
  },
  {
    id: 'media-gemeente-urk',
    dossierId: null,
    query: 'Urk',
    tags: ['urk', 'gemeente'],
    bronnen: ['media'],
  },
  {
    id: 'media-gemeente-zeewolde',
    dossierId: null,
    query: 'Zeewolde',
    tags: ['zeewolde', 'gemeente'],
    bronnen: ['media'],
  },
  {
    id: 'media-waterschap-zuiderzeeland',
    dossierId: null,
    query: 'Waterschap Zuiderzeeland OR Zuiderzeeland',
    tags: ['waterschap', 'zuiderzeeland'],
    bronnen: ['media'],
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
        subbron       TEXT,
        commissie     TEXT,
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

      ALTER TABLE pa_signals ADD COLUMN IF NOT EXISTS subbron TEXT;
      ALTER TABLE pa_signals ADD COLUMN IF NOT EXISTS commissie TEXT;
      ALTER TABLE pa_signals ADD COLUMN IF NOT EXISTS routing TEXT;
      ALTER TABLE pa_signals ADD COLUMN IF NOT EXISTS regio TEXT;
      ALTER TABLE pa_signals ADD COLUMN IF NOT EXISTS sentiment TEXT;
    `);

    // Backfill: all EU signals created before the subbron column existed came from
    // the EP plenary RSS feed. Tag them so EpMeta badges appear for existing signals.
    await db.none(`UPDATE pa_signals SET subbron = 'ep-rss' WHERE bron = 'eu' AND subbron IS NULL`);

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
    // dossierId: explicit null for EU topic-searches; falls back to entry.id for dossier-linked searches
    const dossierId = 'dossierId' in entry ? entry.dossierId : entry.id;
    try {
      await db.none(
        `INSERT INTO pa_saved_searches (id, tenant_id, scope, dossier_id, query, tags)
         VALUES ($1, 'flevoland', 'tenant', $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET dossier_id = EXCLUDED.dossier_id,
               query = EXCLUDED.query,
               tags = EXCLUDED.tags,
               updated_at = NOW()`,
        [
          `seed-${entry.id}`,
          dossierId,
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
