/**
 * PA Dossierbeheer — database init, seed and row mappers.
 *
 * The Beheer → Strategisch kompas → Dossierbeheer surface is the authoring
 * SOURCE for /pa/dossiers. This module owns the four tables behind it.
 *
 * Live and mock are strictly separate: the cockpit in mock mode renders the
 * frontend's own MOCK_DOSSIERS fixture and never calls this module, while live
 * mode serves whatever the database holds — which is only what someone
 * authored, since the SEED_DOSSIERS demo rows are opt-in (see seedDossiers).
 *
 * Tables created inline (no migration framework, matches pa-monitoring.db.ts):
 *   pa_dossiers         — governance columns + kompas/md/body JSONB
 *   pa_dossier_versions — immutable, one row appended per write
 *   pa_templates        — template library
 *   pa_snippets         — snippet library
 */

import { db } from '@services/audit.service';
import { createLogger } from '@utils/logger';
import { config } from '@utils/config';
import { SEED_DOSSIERS, SEED_DOSSIER_IDS, type SeedDossierId } from '@ronl/shared';
import type {
  Dossier,
  AdminDossier,
  AdminDossierStatus,
  DossierArchief,
  DossierMarkdown,
  DossierTemplate,
  DossierSnippet,
  DossierVersion,
  KompasCriterionKey,
  KompasScores,
  Momentum,
  PartialKompasScores,
} from '@ronl/shared';

const logger = createLogger('pa-dossiers-db');

const TENANT = 'flevoland';

// The 8 Kompas criteria. Authored dossiers may score only some of them, but the
// cockpit's Issuekaart scorecard indexes every criterion — so the served Dossier
// must always carry a complete Kompas (missing criteria default to score 0).
const KOMPAS_KEYS: KompasCriterionKey[] = [
  'opgaven',
  'momentum',
  'coalitie',
  'uitvoering',
  'reputatie',
  'synergie',
  'opbrengst',
  'risico',
];

export function completeKompas(partial: PartialKompasScores | undefined | null): KompasScores {
  const p = partial ?? {};
  const out = {} as KompasScores;
  for (const k of KOMPAS_KEYS) out[k] = p[k] ?? { score: 0, duiding: '' };
  return out;
}

// ── Seed helpers ────────────────────────────────────────────────────

/**
 * Owning kernteam member per seed dossier. Keyed by SeedDossierId rather than by
 * string, so adding a dossier to SEED_DOSSIERS without naming an owner here is a
 * compile error instead of a row that silently seeds as 'Kernteam PA' — the sort
 * of wrong-but-plausible value nobody notices in ACC.
 */
const SEED_OWNERS: Record<SeedDossierId, string> = {
  stikstof: 'Sanne Bakker',
  lelystad: 'Joost Veenstra',
  energie: 'Mara de Wit',
  jeugdzorg: 'Sanne Bakker',
  oostvaarders: 'Team Omgeving',
};

/** Fold a dossier's structured narrative into the three raw-Markdown fields,
 *  so the editor round-trips the same content the Issuekaart renders today. */
function toMarkdown(d: Dossier): DossierMarkdown {
  const n = d.narratief ?? { onsVerhaal: '', frames: [], tegenframes: [] };
  let ons = n.onsVerhaal ? `## Ons verhaal\n\n${n.onsVerhaal}\n` : '';
  if (n.frames?.length) {
    ons += `\n### Dominante frames\n\n${n.frames.map((f) => `- ${f.text} *(${f.meta})*`).join('\n')}\n`;
  }
  if (n.tegenframes?.length) {
    ons += `\n### Tegenframes\n\n${n.tegenframes.map((f) => `- ${f.text} *(${f.meta})*`).join('\n')}\n`;
  }
  return {
    waaromNu: d.waaromNu ? `## Waarom nu\n\n${d.waaromNu}\n` : '',
    waarover: d.waarover ? `## Waarover\n\n${d.waarover}\n` : '',
    onsVerhaal: ons,
  };
}

/** Template library — mirrors the design spec (§7). */
export const DOSSIER_TEMPLATES: DossierTemplate[] = [
  {
    id: 'blanco',
    naam: 'Blanco dossier',
    cat: 'Algemeen',
    beschrijving: 'Leeg dossier — begin volledig zelf.',
    versie: '—',
    eigenaar: '—',
    gebruikt: 0,
    seed: { onderwerp: '', waaromNu: '', waarover: '', onsVerhaal: '' },
  },
  {
    id: 'standaard',
    naam: 'Standaard PA-dossier',
    cat: 'Public Affairs',
    beschrijving: 'De vaste opbouw: waarom nu, waarover, ons verhaal, stakeholders.',
    versie: 'v2.1',
    eigenaar: 'Kernteam PA',
    gebruikt: 12,
    seed: {
      onderwerp: 'Korte omschrijving van het onderwerp',
      waaromNu:
        '## Waarom nu\n\nBeschrijf het **momentum**: welk besluit, debat of moment maakt dit dossier nú urgent?\n\n- Aanleiding: {{aanleiding}}\n- Beslismoment: {{datum}}\n- Risico van stilte: …',
      waarover:
        '## Waarover\n\nAfbakening — waar gaat dit dossier wél en niet over.\n\n> Kernboodschap in één zin.',
      onsVerhaal:
        '## Ons verhaal\n\nHet Flevolandse perspectief in één alinea — onderscheidend, uitvoerbaar, met de sector.',
    },
  },
  {
    id: 'eu',
    naam: 'EU-dossier',
    cat: 'Europa',
    beschrijving: 'Voor Brussel-dossiers: rapporteurs, triloog, tijdlijn EP.',
    versie: 'v1.3',
    eigenaar: 'Kernteam PA',
    gebruikt: 4,
    seed: {
      onderwerp: 'Europees wetgevingstraject',
      waaromNu:
        '## Waarom nu\n\n- Fase in het EU-proces: *Commissievoorstel / EP-lezing / triloog*\n- Rapporteur: {{rapporteur}}\n- Stemming verwacht: {{datum}}',
      waarover:
        '## Waarover\n\nDe verordening/richtlijn en de artikelen die Flevoland raken.\n\n| Artikel | Belang voor Flevoland |\n| --- | --- |\n| … | … |',
      onsVerhaal: '## Ons verhaal\n\nHoe Flevoland zich positioneert in het Europese debat.',
    },
  },
  {
    id: 'regionaal',
    naam: 'Regionaal / omgevingsdossier',
    cat: 'Regio',
    beschrijving: 'Gemeenten, waterschap en omgeving centraal.',
    versie: 'v1.0',
    eigenaar: 'Team Omgeving',
    gebruikt: 3,
    seed: {
      onderwerp: 'Regionaal vraagstuk',
      waaromNu: '## Waarom nu\n\nWat speelt er in de regio en waarom is provinciale inzet nodig?',
      waarover: '## Waarover\n\nGebied, betrokken gemeenten en de provinciale rol.',
      onsVerhaal: '## Ons verhaal\n\nDe provincie als verbinder tussen Rijk en regio.',
    },
  },
];

/** Snippet library — mirrors the design spec (§8). */
export const DOSSIER_SNIPPETS: DossierSnippet[] = [
  {
    id: 'goedkeuring',
    naam: 'Goedkeuringstabel',
    cat: 'Proces',
    md: '\n\n| Rol | Naam | Akkoord | Datum |\n| --- | --- | --- | --- |\n| Opsteller | {{currentUser}} | ✍︎ | {{today}} |\n| Teamleider PA | | ☐ | |\n| Portefeuillehouder | | ☐ | |\n',
  },
  {
    id: 'stakeholder',
    naam: 'Stakeholder-blok',
    cat: 'Inhoud',
    md: '\n\n| Stakeholder | Rol | Prioriteit | Sentiment |\n| --- | --- | --- | --- |\n| … | … | nu / kort / warm | + / 0 / − |\n',
  },
  {
    id: 'wijzigingslog',
    naam: 'Wijzigingslog',
    cat: 'Proces',
    md: '\n\n### Wijzigingslog\n\n- **{{today}}** — dossier aangemaakt door {{currentUser}}\n',
  },
  {
    id: 'risico',
    naam: 'Risicomatrix',
    cat: 'Inhoud',
    md: '\n\n| Risico | Kans | Impact | Beheersing |\n| --- | --- | --- | --- |\n| … | laag/midden/hoog | laag/midden/hoog | … |\n',
  },
  {
    id: 'avg',
    naam: 'AVG / Woo-disclaimer',
    cat: 'Juridisch',
    md: '\n\n> **Let op** — dit dossier kan onder de Woo openbaar worden. Vermijd persoonsgegevens en bestuurlijk vertrouwelijke stukken in de vrije tekst.\n',
  },
];

/** One archived example so the Archiefwet state is visible in the overview. */
const ARCHIVED_EXAMPLE = {
  id: 'omgevingswet-2023',
  naam: 'Invoering Omgevingswet',
  onderwerp: 'Provinciale voorbereiding en overgangsrecht',
  status: 'gearchiveerd' as const,
  momentum: 'flat' as Momentum,
  eigenaar: 'Team Omgeving',
  kompas: {} as PartialKompasScores,
  md: {
    waaromNu:
      '## Waarom nu\n\nDe wet is per 1-1-2024 in werking getreden; het lobbytraject is afgerond.\n',
    waarover: '',
    onsVerhaal: '',
  },
  versie: 7,
  gepubliceerd: false,
  sjabloon: 'regionaal',
  archief: {
    classificatie: 'intern' as const,
    bewaartermijn: 'V10' as const,
    reden: 'Traject afgerond na inwerkingtreding; bewaren conform selectielijst.',
    at: '15 jan 2026',
    by: 'M. Jansen (Beheerder)',
  },
  versies: [
    { v: 6, at: '20 dec 2025', by: 'Team Omgeving', note: 'Laatste inhoudelijke update.' },
    {
      v: 7,
      at: '15 jan 2026',
      by: 'M. Jansen',
      note: 'Gearchiveerd (Archiefwet) — classificatie Intern, bewaartermijn 10 jaar.',
    },
  ],
};

// ── Init + seed ─────────────────────────────────────────────────────

export async function initDossiersDb(): Promise<void> {
  try {
    await db.none(`
      CREATE TABLE IF NOT EXISTS pa_dossiers (
        id            TEXT PRIMARY KEY,
        tenant_id     TEXT NOT NULL DEFAULT 'flevoland',
        naam          TEXT NOT NULL,
        onderwerp     TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'actief',
        momentum      TEXT NOT NULL DEFAULT 'flat',
        eigenaar      TEXT NOT NULL DEFAULT '',
        kompas        JSONB NOT NULL DEFAULT '{}'::jsonb,
        md            JSONB NOT NULL DEFAULT '{}'::jsonb,
        body          JSONB NOT NULL DEFAULT '{}'::jsonb,
        versie        INTEGER NOT NULL DEFAULT 1,
        gepubliceerd  BOOLEAN NOT NULL DEFAULT false,
        sjabloon      TEXT NOT NULL DEFAULT 'blanco',
        archief       JSONB,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pa_dossier_versions (
        id          BIGSERIAL PRIMARY KEY,
        dossier_id  TEXT NOT NULL,
        v           INTEGER NOT NULL,
        at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        by          TEXT NOT NULL DEFAULT '',
        note        TEXT NOT NULL DEFAULT '',
        UNIQUE (dossier_id, v)
      );

      CREATE TABLE IF NOT EXISTS pa_templates (
        id           TEXT PRIMARY KEY,
        naam         TEXT NOT NULL,
        cat          TEXT NOT NULL DEFAULT '',
        beschrijving TEXT NOT NULL DEFAULT '',
        versie       TEXT NOT NULL DEFAULT '—',
        eigenaar     TEXT NOT NULL DEFAULT '',
        gebruikt     INTEGER NOT NULL DEFAULT 0,
        seed         JSONB NOT NULL DEFAULT '{}'::jsonb,
        status       TEXT NOT NULL DEFAULT 'actief',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pa_snippets (
        id          TEXT PRIMARY KEY,
        naam        TEXT NOT NULL,
        cat         TEXT NOT NULL DEFAULT '',
        md          TEXT NOT NULL DEFAULT '',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    logger.info('PA dossiers tables ready');
    // Demo dossiers are opt-in — see seedDossiers.
    if (config.pa.seedDemoDossiers) await seedDossiers();
    else logger.info('PA demo dossiers not seeded (PA_SEED_DEMO_DOSSIERS is off)');
    // Templates and snippets are not sample content: the authoring surface
    // needs a sjabloon to create a dossier from, so they seed either way.
    await seedTemplatesAndSnippets();
  } catch (err) {
    logger.warn('PA dossiers DB init failed — will retry on next request', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Every dossier id this module seeds.
 *
 * Tooling needs to be able to remove exactly the demo rows from an environment
 * that also holds authored ones, and "exactly the demo rows" has to stay tied to
 * what the seed actually writes rather than a hand-kept list that drifts.
 */
export const DEMO_DOSSIER_IDS: readonly string[] = [...SEED_DOSSIER_IDS, ARCHIVED_EXAMPLE.id];

/**
 * Populate the tables with the SEED_DOSSIERS examples plus one archived case.
 *
 * Opt-in via PA_SEED_DEMO_DOSSIERS, and off by default, because these are the
 * same dossiers the frontend serves as MOCK_DOSSIERS. Seeding them into the
 * database made the mock/live flag flip a visual no-op, which was the point
 * while the seam was being proven — but it also meant live could only ever be
 * mock plus whatever had been authored on top, so the two modes could never be
 * told apart. Live now means: dossiers someone actually created.
 *
 * Turning the flag on is still the way to give a fresh demo or ACC environment
 * something to show.
 */
async function seedDossiers(): Promise<void> {
  const rows = [
    ...SEED_DOSSIERS.map((d, idx) => {
      // SEED_OWNERS is keyed by SeedDossierId, so this is a string, never undefined.
      const eigenaar = SEED_OWNERS[d.id];
      return {
        id: d.id,
        naam: d.naam,
        onderwerp: d.onderwerp,
        status: d.status as AdminDossierStatus,
        momentum: d.momentum,
        eigenaar,
        kompas: d.kompas as PartialKompasScores,
        md: toMarkdown(d),
        body: d,
        versie: 3,
        gepubliceerd: true,
        sjabloon: 'standaard',
        archief: null as DossierArchief | null,
        versies: [
          {
            v: 1,
            at: '12 mei 2026',
            by: eigenaar,
            note: 'Dossier aangemaakt vanuit sjabloon Standaard PA-dossier.',
          },
          {
            v: 2,
            at: '24 mei 2026',
            by: eigenaar,
            note: 'Kompas-startscores gezet; verhaal uitgewerkt.',
          },
          {
            v: 3,
            at: '1 jun 2026',
            by: eigenaar,
            note: 'Verhaal bijgewerkt na laatste ontwikkeling.',
          },
        ] as DossierVersion[],
        // Stagger updated_at so the overview shows varied "bewerkt N geleden" labels.
        ageDays: [2, 5, 1, 21, 7][idx] ?? 7,
      };
    }),
    {
      ...ARCHIVED_EXAMPLE,
      body: buildBodyFromAuthoring(ARCHIVED_EXAMPLE),
      ageDays: 180,
    },
  ];

  for (const r of rows) {
    try {
      await db.none(
        `INSERT INTO pa_dossiers
           (id, tenant_id, naam, onderwerp, status, momentum, eigenaar, kompas, md, body,
            versie, gepubliceerd, sjabloon, archief, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                 NOW() - ($15 || ' days')::interval, NOW() - ($15 || ' days')::interval)
         ON CONFLICT (id) DO NOTHING`,
        [
          r.id,
          TENANT,
          r.naam,
          r.onderwerp,
          r.status,
          r.momentum,
          r.eigenaar,
          JSON.stringify(r.kompas),
          JSON.stringify(r.md),
          JSON.stringify(r.body),
          r.versie,
          r.gepubliceerd,
          r.sjabloon,
          r.archief ? JSON.stringify(r.archief) : null,
          String(r.ageDays),
        ]
      );
      for (const v of r.versies) {
        await db.none(
          `INSERT INTO pa_dossier_versions (dossier_id, v, by, note)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (dossier_id, v) DO NOTHING`,
          [r.id, v.v, v.by, v.note]
        );
      }
    } catch (err) {
      logger.warn('PA dossier seed failed', {
        dossier: r.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  logger.info('PA dossiers seed complete');
}

async function seedTemplatesAndSnippets(): Promise<void> {
  for (const t of DOSSIER_TEMPLATES) {
    await db.none(
      `INSERT INTO pa_templates (id, naam, cat, beschrijving, versie, eigenaar, gebruikt, seed, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'actief')
       ON CONFLICT (id) DO UPDATE SET
         naam = EXCLUDED.naam, cat = EXCLUDED.cat, beschrijving = EXCLUDED.beschrijving,
         versie = EXCLUDED.versie, eigenaar = EXCLUDED.eigenaar, seed = EXCLUDED.seed`,
      [
        t.id,
        t.naam,
        t.cat,
        t.beschrijving,
        t.versie,
        t.eigenaar,
        t.gebruikt,
        JSON.stringify(t.seed),
      ]
    );
  }
  for (const s of DOSSIER_SNIPPETS) {
    await db.none(
      `INSERT INTO pa_snippets (id, naam, cat, md)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET naam = EXCLUDED.naam, cat = EXCLUDED.cat, md = EXCLUDED.md`,
      [s.id, s.naam, s.cat, s.md]
    );
  }
  logger.info('PA templates + snippets seed complete');
}

// ── Body construction + reconstruction ──────────────────────────────

interface AuthoringInput {
  id: string;
  naam: string;
  onderwerp: string;
  status: AdminDossierStatus;
  momentum: Momentum;
  kompas: PartialKompasScores;
  md: DossierMarkdown;
}

/**
 * Build a minimal-but-valid rich Dossier body for a concept dossier authored
 * from scratch (no ritme/stakeholders/timeline yet). The narrative strings are
 * seeded from the raw Markdown so the Issuekaart shows something meaningful.
 */
export function buildBodyFromAuthoring(input: AuthoringInput): Dossier {
  return {
    id: input.id,
    naam: input.naam,
    onderwerp: input.onderwerp,
    status: (input.status === 'gearchiveerd' ? 'sluimerend' : input.status) as Dossier['status'],
    momentum: input.momentum,
    waaromNu: input.md.waaromNu,
    waarover: input.md.waarover,
    kompas: completeKompas(input.kompas),
    doel: '',
    ritme: { lobby: [], communicatie: [], events: [] },
    mijlpalen: [],
    progressPct: 0,
    next: '',
    stakeholders: [],
    narratief: { onsVerhaal: input.md.onsVerhaal, frames: [], tegenframes: [] },
    interventies: [],
    timeline: [],
    kompasLog: [],
    intervLog: [],
    overleg: [],
  };
}

/** Reconstruct the cockpit-facing rich Dossier from a stored row. */
export function rowToDossier(row: Record<string, unknown>): Dossier {
  const body = (row['body'] as Dossier) ?? ({} as Dossier);
  return {
    ...body,
    id: row['id'] as string,
    naam: row['naam'] as string,
    onderwerp: row['onderwerp'] as string,
    status: row['status'] as Dossier['status'],
    momentum: row['momentum'] as Momentum,
    // Normalise partial Kompas (older authored rows) to a full set on read.
    kompas: completeKompas((row['kompas'] as PartialKompasScores) ?? body.kompas),
  };
}

const NL_MONTHS = [
  'jan',
  'feb',
  'mrt',
  'apr',
  'mei',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'dec',
];

/** Short Dutch date "12 mei 2026" from a timestamp, for version-history rows.
 *  Falls back to the raw string when it isn't a parseable date. */
export function dossierDateLabel(ts: unknown): string {
  const d = ts ? new Date(ts as string) : null;
  if (!d || Number.isNaN(d.getTime())) return typeof ts === 'string' ? ts : '—';
  return `${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Dutch relative "bewerkt" label from a timestamp, for the overview meta row. */
export function relativeLabel(ts: unknown): string {
  const then = ts ? new Date(ts as string).getTime() : NaN;
  if (Number.isNaN(then)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'nu';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} u`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d} dgn`;
  const w = Math.floor(d / 7);
  if (w < 9) return `${w} wk`;
  const mo = Math.floor(d / 30);
  return `${mo} mnd`;
}

/** Map a stored row + its versions into the AdminDossier governance record. */
export function rowToAdminDossier(
  row: Record<string, unknown>,
  versies: DossierVersion[]
): AdminDossier {
  return {
    id: row['id'] as string,
    naam: row['naam'] as string,
    onderwerp: row['onderwerp'] as string,
    status: row['status'] as AdminDossierStatus,
    momentum: row['momentum'] as Momentum,
    eigenaar: row['eigenaar'] as string,
    kompas: (row['kompas'] as PartialKompasScores) ?? {},
    md: (row['md'] as DossierMarkdown) ?? { waaromNu: '', waarover: '', onsVerhaal: '' },
    versie: Number(row['versie'] ?? 1),
    gepubliceerd: Boolean(row['gepubliceerd']),
    sjabloon: (row['sjabloon'] as string) ?? 'blanco',
    archief: (row['archief'] as DossierArchief | null) ?? null,
    bewerkt: relativeLabel(row['updated_at']),
    versies,
  };
}
