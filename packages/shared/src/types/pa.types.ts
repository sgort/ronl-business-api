/**
 * media-aggregator's wire contract — the shape returned by
 * GET /v1/media-aggregator/search. Canonical definition; both the aggregator
 * (media-aggregator/types.ts) and its consumer (pa-monitoring/sources/media.client.ts)
 * import this instead of keeping their own copies in sync by hand.
 */
export interface AggregatorArticle {
  /** Stable id derived from the canonical URL. */
  id: string;
  /** Set when this article is one copy of a syndicated cluster; null for singletons.
   *  The cockpit collapses a cluster to one candidate via `duplicate_group_id ?? id`. */
  duplicate_group_id: string | null;
  canonical_url: string;
  title: string;
  /** ≤ ~50-word plain-text summary (RSS description, stripped). */
  summary_short: string;
  /** ISO-8601 timestamp. */
  published_at: string;
  /** Gazetteer-detected province — 'Flevoland' or null. Display-only in the cockpit. */
  province: string | null;
  /** Gazetteer-detected municipality — one of the six, or null. Display-only. */
  municipality: string | null;
  /** AI sentiment — phase-2 (null in v1). Display-only, never scored. */
  sentiment: 'positief' | 'neutraal' | 'negatief' | null;
  source: {
    name: string;
    type: 'national' | 'regional';
    homepage: string;
  };
}

export interface Signal {
  id: string;
  tab: 'politiek' | 'regionaal' | 'europa' | 'media';
  dossierId: string | null;
  title: string;
  src: string;
  bron: 'tk' | 'ob' | 'eu' | 'media' | null;
  /** EU sub-source identifier: 'ep-rss' (plenary documents, now via the EP Open
   *  Data API — the key predates the move off RSS and is kept so the stream's
   *  signals stay together) or 'ep-teksten' (texts-submitted). 'ep-persbericht'
   *  occurs only on signals persisted before press releases were dropped (#55).
   *  Media sub-source: 'nieuws-nationaal' | 'nieuws-regionaal'. */
  subbron?: string | null;
  /** EP committee code (ITRE, ENVI, …). Display only — not used for scoring. */
  commissie?: string | null;
  /** Province · municipality from the news-aggregator gazetteer. Display only. */
  regio?: string | null;
  /** Sentiment from the news-aggregator AI pipeline. Display only — not used for scoring. */
  sentiment?: 'positief' | 'neutraal' | 'negatief' | null;
  ref?: { type: string; nr: string; url: string } | null;
  rel: number;
  impact: 'kans' | 'risico' | null;
  impactLabel: string | null;
  duiding: string | null;
  status: 'candidate' | 'ai_drafted' | 'confirmed' | 'dismissed';
  aiDraft?: { rel: number; impact: string; impactLabel: string; duiding: string } | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  /** 'watchlist' when confirmed without a dossier; null once linked to one. */
  routing?: 'watchlist' | null;
}

export interface FeedItem {
  id: string;
  title: string;
  type: string | null;
  number: string | null;
  date: string | null;
  url: string | null;
  source: 'tk' | 'ob' | 'eu' | 'media';
  description?: string;
  /** EU sub-source identifier passed through from the scraper; stored on Signal. */
  subbron?: string | null;
  /** EP committee code passed through from the scraper; stored on Signal. */
  commissie?: string | null;
  /** Province · municipality from the news-aggregator gazetteer. Display only. */
  regio?: string | null;
  /** Sentiment from the news-aggregator AI pipeline. Display only — not used for scoring. */
  sentiment?: 'positief' | 'neutraal' | 'negatief' | null;
}

// ── Dossier + Kompas domain types ───────────────────────────────────

export type KompasCriterionKey =
  | 'opgaven'
  | 'momentum'
  | 'coalitie'
  | 'uitvoering'
  | 'reputatie'
  | 'synergie'
  | 'opbrengst'
  | 'risico';

export type KompasBandKey = 'kern' | 'kans' | 'monitor' | 'niet';

export interface KompasBand {
  key: KompasBandKey;
  min: number;
  kort: string;
  label: string;
  inzet: string;
}

export interface KompasCriterionDef {
  key: KompasCriterionKey;
  short: string;
  name: string;
  hint: string;
}

export interface KompasScore {
  score: 0 | 1 | 2;
  duiding: string;
}

export type KompasScores = Record<KompasCriterionKey, KompasScore>;

export type Momentum = 'up' | 'flat' | 'down';
export type DossierStatus = 'actief' | 'sluimerend';
export type Sentiment = 'pos' | 'neu' | 'neg';
export type StakeholderPrio = 'nu' | 'kort' | 'warm';

export interface RitmeItem {
  t: string;
  when: string;
}

export interface DossierRitme {
  lobby: RitmeItem[];
  communicatie: RitmeItem[];
  events: RitmeItem[];
}

export interface Mijlpaal {
  label: string;
  date: string;
  done: boolean;
  soon?: boolean;
}

export interface Stakeholder {
  naam: string;
  rol: string;
  prio: StakeholderPrio;
  laatste: string;
  senti: Sentiment;
}

export interface Frame {
  text: string;
  meta: string;
  kind: 'frame' | 'tegen';
}

export interface DossierNarratief {
  onsVerhaal: string;
  frames: Frame[];
  tegenframes: Frame[];
}

export interface Interventie {
  titel: string;
  motiv: string;
  kompas: string;
}

export interface TimelineEvent {
  date: string;
  title: string;
  desc: string;
  docs: string[];
  future: boolean;
}

export interface KompasLogEntry {
  date: string;
  text: string;
}

export interface InterventieLogEntry {
  date: string;
  who: string;
  what: string;
  ai: string;
  mens: string;
}

export interface OverlegMessage {
  name: string;
  init: string;
  time: string;
  text: string;
}

// ── Tweede Kamer agenda types ────────────────────────────────────────

export interface PlenaryItem {
  id: string;
  nummer: string;
  soort: 'plenair' | 'vragenuur' | 'commissie';
  soortLabel: string;
  titel: string;
  iso: string;
  tijd: string | null;
  commissie: string | null;
  status: 'gepland' | 'uitgevoerd' | 'geannuleerd';
  dossier: string | null;
  matchTerm: string | null;
  url: string;
  live?: 'live' | 'binnenkort' | null;
  stream?: string | null;
}

export interface Dossier {
  id: string;
  naam: string;
  onderwerp: string;
  status: DossierStatus;
  momentum: Momentum;
  waaromNu: string;
  waarover: string;
  kompas: KompasScores;
  doel: string;
  ritme: DossierRitme;
  mijlpalen: Mijlpaal[];
  progressPct: number;
  next: string;
  stakeholders: Stakeholder[];
  narratief: DossierNarratief;
  interventies: Interventie[];
  timeline: TimelineEvent[];
  kompasLog: KompasLogEntry[];
  intervLog: InterventieLogEntry[];
  overleg: OverlegMessage[];
}

// ── Dossierbeheer — authoring / governance domain ───────────────────
// The Beheer → Strategisch kompas → Dossierbeheer surface is the authoring
// SOURCE for /pa/dossiers. It works with a richer governance record than the
// cockpit consumes: raw-Markdown narrative fields, version history and
// Archiefwet metadata. The cockpit keeps reading the plain `Dossier` above.

/** Admin surface adds a third, terminal status the cockpit never sees. */
export type AdminDossierStatus = DossierStatus | 'gearchiveerd';

/** The three raw-Markdown narrative fields authored in the editor. */
export interface DossierMarkdown {
  waaromNu: string;
  waarover: string;
  onsVerhaal: string;
}

/** Archiefwet capture — re-scored classificatie + bewaartermijn + grondslag. */
export interface DossierArchief {
  classificatie: 'openbaar' | 'intern' | 'vertrouwelijk';
  /** V5/V10/V20 = 5/10/20 jaar; B = blijvend te bewaren. */
  bewaartermijn: 'V5' | 'V10' | 'V20' | 'B';
  reden: string;
  at: string;
  by: string;
}

/** Immutable version entry — one appended per write (pa_dossier_versions). */
export interface DossierVersion {
  v: number;
  at: string;
  by: string;
  note: string;
}

/** Kompas start-scores may be partial while a dossier is still a concept. */
export type PartialKompasScores = Partial<KompasScores>;

/** The governance record served by GET /pa/dossiers?admin=1 and mutated here. */
export interface AdminDossier {
  id: string;
  naam: string;
  onderwerp: string;
  status: AdminDossierStatus;
  momentum: Momentum;
  eigenaar: string;
  kompas: PartialKompasScores;
  md: DossierMarkdown;
  versie: number;
  gepubliceerd: boolean;
  sjabloon: string;
  archief: DossierArchief | null;
  /** Human relative label ("2 dgn") derived from updated_at for the overview. */
  bewerkt: string;
  versies: DossierVersion[];
}

/** Template library entry (pa_templates) — seeds a new dossier's fields. */
export interface DossierTemplate {
  id: string;
  naam: string;
  cat: string;
  beschrijving: string;
  versie: string;
  eigenaar: string;
  gebruikt: number;
  seed: {
    onderwerp: string;
    waaromNu: string;
    waarover: string;
    onsVerhaal: string;
  };
}

/** Snippet library entry (pa_snippets) — inserted at the caret in the editor. */
export interface DossierSnippet {
  id: string;
  naam: string;
  cat: string;
  md: string;
}
