export interface Signal {
  id: string;
  tab: 'politiek' | 'regionaal' | 'europa' | 'media';
  dossierId: string | null;
  title: string;
  src: string;
  bron: 'tk' | 'ob' | 'eu' | null;
  /** EU sub-source identifier: 'ep-rss' (plenary RSS) or 'ep-teksten' (texts-submitted). */
  subbron?: string | null;
  /** EP committee code (ITRE, ENVI, …). Display only — not used for scoring. */
  commissie?: string | null;
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
  source: 'tk' | 'ob' | 'eu';
  description?: string;
  /** EU sub-source identifier passed through from the scraper; stored on Signal. */
  subbron?: string | null;
  /** EP committee code passed through from the scraper; stored on Signal. */
  commissie?: string | null;
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
