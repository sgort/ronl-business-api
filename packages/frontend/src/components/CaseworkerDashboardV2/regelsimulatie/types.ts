// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/types.ts
/**
 * Regelsimulatie — engine types.
 * Mirrors the shapes produced by docs/regelsimulatie-handoff's
 * reference/preview/mock-sim-engine.jsx exactly; see simEngine.ts for the
 * pure implementation these types describe.
 */

export type RelatieTotWoning = 'eigenaar' | 'huurder' | 'gebruiker' | 'erfpachter';
export type AanvragerType = 'eigenaar' | 'huurder';

export interface Persoon {
  voornaam: string;
  achternaam: string;
  plaats: string;
  type: AanvragerType;
  aanvragerFailliet: boolean;
  provincieWoning: string;
  relatieTotWoning: RelatieTotWoning;
  toestemmingEigenaar: boolean;
  rekeningNaamKomtOvereen: boolean;
  gemaakteKosten: number;
}

export type RedenKey =
  | 'failliet'
  | 'buitenprovincie'
  | 'relatie'
  | 'toestemming'
  | 'energierekening'
  | 'toegekend';

export interface EntitlementResult {
  recht: boolean;
  reden: string;
  redenKey: RedenKey;
}

export type PeriodeMode = 'split' | 'bundled' | 'buiten';

export interface Periode {
  year: number;
  mode: PeriodeMode;
}

export type Klasse = 'afgewezen' | 'geen-hoogte' | 'accepted';
export type Uitkomst = 'volledig' | 'niet-uitbetaald' | 'geen-hoogte' | 'afgewezen' | null;
export type BezwaarUitkomst = 'toegewezen' | 'toegewezen-onbetaald' | 'afgewezen' | null;
export type AppealKind = 'denial' | 'budget' | null;

export interface SimApp {
  id: number;
  persoon: Persoon;
  type: AanvragerType;
  submitDay: number;
  decisionDay: number;
  isRFI: boolean;
  subprocessStart: number | null;
  infoReceivedDay: number | null;
  effDay: number;
  basis: number;
  year: number;
  klasse: Klasse;
  reden: string | null;
  redenKey: RedenKey | null;
  paid: boolean | null;
  paid0: boolean | null;
  uitkomst: Uitkomst;
  bedrag: number;
  payoutResolvedDay: number | null;
  missedDueToRFI: boolean;
  missedDueToBeroep: boolean;
  beroepDisplacerId: number | null;
  beroepFiled: boolean;
  beroepUpheld: boolean;
  appealKind: AppealKind;
  appealResolveDay: number | null;
  appealPaid: boolean;
  bezwaar: boolean;
  bezwaarUitkomst: BezwaarUitkomst;
  blockedById: number | null;
  justMissedByOne: boolean;
  pid?: string;
  availableBefore?: number;
}

export type FeedUitkomst =
  | 'volledig'
  | 'niet-uitbetaald'
  | 'geen-hoogte'
  | 'afgewezen'
  | 'beroep-toegekend'
  | 'beroep-afgewezen';

export interface SimEvent {
  id: number;
  day: number;
  ts: number;
  naam: string;
  plaats: string;
  type: AanvragerType;
  kosten: number;
  basis: number;
  uitkomst: FeedUitkomst;
  bedrag: number;
  isRFI: boolean;
  submitDay: number;
  decisionDay: number;
  effDay: number;
  infoReceivedDay: number | null;
  reden: string | null;
  redenKey: RedenKey | null;
  bezwaar: boolean;
  blockedById: number | null;
  justMissedByOne: boolean;
}

export interface SimDaySnapshot {
  day: number;
  ts: number;
  year: number;
  mode: PeriodeMode;
  reedsE: number;
  reedsH: number;
  reservedE: number;
  reservedH: number;
  holdTotal: number;
  toegekendBedrag: number;
  poolTotal: number;
  poolUsed: number;
  reservedTot: number;
  availE: number | null;
  availH: number | null;
  beschikbaar: number;
  ingediend: number;
  volledig: number;
  nietUitbetaald: number;
  afgewezenRecht: number;
  kostenTeLaag: number;
  inBehandeling: number;
  wachtUitbetaling: number;
  rfiOpen: number;
  bedragVolledig: number;
  bedragNietUitbetaald: number;
  bedragInBehandeling: number;
  bedragWacht: number;
  bedragKostenTeLaag: number;
  bedragAfgewezen: number;
  bezwaarOpen: number;
}

export interface RedenenAgg {
  failliet: number;
  buitenprovincie: number;
  relatie: number;
  toestemming: number;
  energierekening: number;
}

export interface SimAgg {
  ingediend: number;
  rechtToegekend: number;
  afgewezenRecht: number;
  volledig: number;
  nietUitbetaald: number;
  kostenTeLaag: number;
  redenen: RedenenAgg;
  rfiTotaal: number;
  nietUitbetaaldRFI: number;
  missedDueToRFI: number;
  bezwaarIngediend: number;
  bezwaarToegewezen: number;
  bezwaarAfgewezen: number;
  missedDueToBeroep: number;
}

export interface ExhaustionEvent {
  day: number;
  ts: number;
  label: string;
}

export interface YearCeilings {
  eig: number;
  huur: number;
  bundled: number;
}

export interface SimConfig {
  seed: number;
  populatie: number;
  eigenaarRatio: number;
  kostenGem: number;
  kostenSd: number;
  pFailliet: number;
  pBuitenprovincie: number;
  pGeenRelatie: number;
  pGeenToestemming: number;
  pNaamMismatch: number;
  budgetScale: number;
  aandeel2026: number;
  arrivalPow: number;
  doorlooptijdGem: number;
  pAanvullendeInfo: number;
  infoWachtGem: number;
  bezwaarKans: number;
  bezwaarToewijzing: number;
}

export interface SimMeta {
  START: number;
  END: number;
  TOTAL_DAYS: number;
  dayToTs: (day: number) => number;
  fmtDate: (ts: number) => string;
  fmtShort: (ts: number) => string;
}

export interface SimResult {
  cfg: SimConfig;
  ceilings: Record<number, YearCeilings>;
  days: SimDaySnapshot[];
  feed: SimEvent[];
  apps: SimApp[];
  agg: SimAgg;
  exhaustion: Record<string, ExhaustionEvent>;
  toegekendBedrag: number;
  bezwaarUitbetaald: number;
  meta: SimMeta;
}

// ---- resolver (exported for testability; see simEngine.ts's top-of-file
// comment for why this deviates from the unexported reference closure) ----

export interface Claimant {
  id: string;
  refId: number;
  key: number;
  ord: number;
  competeDay: number;
  type: AanvragerType;
  year: number;
  basis: number;
  isAppeal: boolean;
}

export interface ClaimantResult {
  paid: boolean;
  blockedById: number | null;
  justMissedByOne: boolean;
  resolvedDay: number;
  pid: string;
  key: number;
  isAppeal: boolean;
}

export interface ResolveResult {
  res: Record<string, ClaimantResult>;
  sealDay: Record<string, number>;
  carryover: number;
}
