/**
 * Infra-board — portfolio-level domain types + MOCK fixtures.
 *
 * These cover the *aggregate* views (multi-year Gantt, kanban, updates feed)
 * that aren't backed by an endpoint yet. The live work surface (open tasks,
 * Fase-1 instances, activity-history, documents) does NOT come from here —
 * see services/infra.api.ts.
 *
 * Swap each accessor for an async service one view at a time (same shape).
 */

import { PHASES, ROLES, type StatusKey, type HealthKey } from './rip-model';
import { RIP_PHASES, type RipPhase } from './rip-phases.catalog';
import type { PhaseCounts } from './rip-phase-counts';

/** Valid portfolio lead-role keys (rip-model vocabulary). */
const ROLE_KEYS = new Set(ROLES.map((r) => r.key));

/**
 * Resolve a live instance's declared `leadRole` to a portfolio role key.
 * Ownership signal (B): the process sets `leadRole` to a rip-model key. Unknown
 * or absent values fall back to 'projectleider' so legacy instances still render.
 */
export const normalizeLeadRole = (raw?: string): string =>
  raw && ROLE_KEYS.has(raw) ? raw : 'projectleider';

// ── Timeline window: 2022 Q1 … 2027 Q4 ──────────────────────────────────────
export const TL = { startYear: 2022, quarters: 24, todayIdx: 17 };
const qIdx = (year: number, q: number) => (year - TL.startYear) * 4 + (q - 1);
/** Mock per-phase durations (quarters). Replace with planning data. */
export const PHASE_DUR = [2, 3, 3, 2, 5, 2];

export interface GanttSegment {
  phase: number;
  from: number;
  len: number;
  status: StatusKey;
}
export interface PortfolioProject {
  id: string;
  nr: string;
  naam: string;
  phase: number;
  role: string;
  health: HealthKey;
  phaseStatuses: StatusKey[];
  milestone: string;
  budget: string;
  startYear: number;
  start: number;
  end: number;
  segments: GanttSegment[];
  /** Set when this row is backed by a live Operaton process instance. */
  instanceId?: string;
  /** Position on the real 9-phase RIP ladder (R2.1…R5.2). Additive —
   *  unrelated to `phase` above, which stays on the old 6-phase model
   *  for Portfolio.tsx compatibility. */
  ripPhaseCode: string;
  ripPhaseState: 'wip' | 'wachtend';
}

export interface TodoItem {
  prio: StatusKey;
  titel: string;
  proj: string;
  sub: string;
  actie: string;
  /** Set when the to-do is a live engine task (businessApi.task). */
  taskId?: string;
}
export interface UpdateItem {
  datum: string;
  proj: string;
  tekst: string;
}

function phaseStatuses(current: number, flags: Partial<Record<number, StatusKey>>): StatusKey[] {
  return PHASES.map((p) => {
    if (p.n < current) return 'done';
    if (p.n === current) return flags[p.n] ?? 'active';
    return 'todo';
  });
}

type Raw = [
  string,
  string,
  number,
  string,
  HealthKey,
  Partial<Record<number, StatusKey>>,
  string,
  string,
  number,
  number,
];
const RAW: Raw[] = [
  [
    '23102',
    'Kuinderweg — reconstructie N712',
    5,
    'projectleider',
    'groen',
    {},
    'Oplevering deelvak 2',
    '€ 8,4 mln',
    2023,
    2,
  ],
  [
    '23045',
    'Nijkerkerbrug — renovatie val',
    5,
    'manager-pb',
    'geel',
    { 5: 'risk' },
    'Verkeersmaatregel fase 3',
    '€ 31 mln',
    2023,
    1,
  ],
  [
    '24011',
    'Larserweg — ongelijkvloerse aansluiting',
    4,
    'projectleider',
    'groen',
    {},
    'Gunning aannemer',
    '€ 19 mln',
    2024,
    1,
  ],
  [
    '22087',
    'Ramspolbrug — vervanging bewegingswerk',
    6,
    'manager-pb',
    'groen',
    {},
    'Eindafrekening',
    '€ 12 mln',
    2022,
    1,
  ],
  [
    '24102',
    'Gooiseweg — verbreding N305',
    3,
    'projectleider',
    'geel',
    { 3: 'risk' },
    'Vaststellen VO',
    '€ 44 mln',
    2024,
    2,
  ],
  [
    '25008',
    'Hanzeweg — fietsbrug Dronten',
    1,
    'projectleider',
    'groen',
    { 1: 'action' },
    'PSU-verslag accorderen',
    '€ 6,1 mln',
    2025,
    3,
  ],
  [
    '23201',
    'Vogelweg — rotonde Lelystad-Oost',
    5,
    'manager-pb',
    'rood',
    { 5: 'overdue' },
    'Stremming oplossen',
    '€ 4,8 mln',
    2023,
    3,
  ],
  [
    '24056',
    'Knardijk — dijkversterking traverse',
    4,
    'projectleider',
    'groen',
    {},
    'Aanbestedingsleidraad',
    '€ 27 mln',
    2024,
    2,
  ],
  [
    '25031',
    'Espelerweg — groot onderhoud',
    1,
    'projectleider',
    'groen',
    { 1: 'active' },
    'Intake-verslag',
    '€ 3,2 mln',
    2025,
    4,
  ],
  [
    '22119',
    'Ketelbrug — conservering staal',
    6,
    'manager-pb',
    'groen',
    {},
    'Decharge-rapport',
    '€ 9,7 mln',
    2022,
    2,
  ],
  [
    '24077',
    'Domineesweg — verkeersveiligheid',
    3,
    'projectleider',
    'groen',
    {},
    'Ontwerpnota',
    '€ 5,5 mln',
    2024,
    1,
  ],
  [
    '25014',
    'Urkerweg — aansluiting A6',
    2,
    'manager-pb',
    'geel',
    { 2: 'risk' },
    'Variantenstudie',
    '€ 22 mln',
    2025,
    1,
  ],
  [
    '23166',
    'Swifterringweg — reconstructie',
    5,
    'projectleider',
    'groen',
    {},
    'Asfaltfase 2',
    '€ 7,9 mln',
    2023,
    2,
  ],
  [
    '24130',
    'Dronterweg — ecoduct',
    4,
    'projectleider',
    'geel',
    {},
    'Marktconsultatie',
    '€ 14 mln',
    2024,
    3,
  ],
  [
    '25022',
    'Hoge Vaart — bruggen renovatie (3x)',
    1,
    'manager-pb',
    'groen',
    { 1: 'active' },
    'Uitgangspunten VO-fase',
    '€ 18 mln',
    2025,
    2,
  ],
  [
    '23078',
    'Marknesserweg — passeerstroken',
    5,
    'projectleider',
    'groen',
    {},
    'Bermbeveiliging',
    '€ 2,6 mln',
    2023,
    4,
  ],
  [
    '22203',
    'Lage Vaart — sluis Kampen',
    6,
    'manager-pb',
    'geel',
    {},
    'Restpunten',
    '€ 21 mln',
    2022,
    3,
  ],
  [
    '24090',
    'Tollebekerweg — fietspad',
    3,
    'projectleider',
    'groen',
    {},
    'Definitief ontwerp',
    '€ 4,1 mln',
    2024,
    2,
  ],
  [
    '25040',
    'Baanweg — kruispunt N709',
    2,
    'projectleider',
    'groen',
    {},
    'Voorkeursvariant',
    '€ 8,8 mln',
    2025,
    1,
  ],
  [
    '23133',
    'Ramsweg — geluidsmaatregelen',
    4,
    'manager-pb',
    'rood',
    { 4: 'overdue' },
    'Bezwaar afhandelen',
    '€ 6,3 mln',
    2023,
    2,
  ],
  [
    '24044',
    'Vlierweg — verbreding',
    5,
    'projectleider',
    'groen',
    {},
    'Oplevering',
    '€ 11 mln',
    2024,
    1,
  ],
  [
    '25055',
    'Pijlerweg — nieuwe ontsluiting',
    1,
    'projectleider',
    'geel',
    { 1: 'action' },
    'Intake-overleg',
    '€ 16 mln',
    2025,
    3,
  ],
  [
    '23190',
    'Bremerbergweg — recreatieverkeer',
    5,
    'manager-pb',
    'groen',
    {},
    'Markeringen',
    '€ 3,4 mln',
    2023,
    3,
  ],
  [
    '24118',
    'Wisentweg — duurzaam asfalt pilot',
    3,
    'projectleider',
    'groen',
    {},
    'VO vaststellen',
    '€ 9,2 mln',
    2024,
    2,
  ],
  [
    '22150',
    'Hertenweg — onderhoud kunstwerken',
    6,
    'manager-pb',
    'groen',
    {},
    'Eindoplevering',
    '€ 5,8 mln',
    2022,
    2,
  ],
  [
    '25067',
    'Ossenkampweg — verkeersplein',
    2,
    'projectleider',
    'groen',
    {},
    'Omgevingsproces',
    '€ 13 mln',
    2025,
    1,
  ],
  [
    '24063',
    'Visvijverweg — natuurvriendelijke oever',
    4,
    'projectleider',
    'geel',
    {},
    'Aanbesteding',
    '€ 7,1 mln',
    2024,
    3,
  ],
  [
    '23215',
    'Elandweg — reconstructie N306',
    5,
    'manager-pb',
    'rood',
    { 5: 'overdue' },
    'Vertraging levering',
    '€ 24 mln',
    2023,
    1,
  ],
  [
    '25073',
    'Reigerweg — fietsstraat',
    1,
    'projectleider',
    'groen',
    { 1: 'active' },
    'Intake-verslag',
    '€ 2,9 mln',
    2025,
    4,
  ],
  [
    '24025',
    'Buizerdweg — komgrens herinrichting',
    3,
    'projectleider',
    'groen',
    {},
    'Ontwerp',
    '€ 4,7 mln',
    2024,
    1,
  ],
  [
    '22168',
    'Meeuwenweg — brugbediening centraliseren',
    6,
    'manager-pb',
    'groen',
    {},
    'Decharge',
    '€ 17 mln',
    2022,
    2,
  ],
  [
    '25081',
    'Karekietweg — aansluiting bedrijventerrein',
    2,
    'projectleider',
    'groen',
    {},
    'Variantenstudie',
    '€ 10 mln',
    2025,
    2,
  ],
  [
    '24142',
    'Plevierweg — verkeerslichten',
    4,
    'manager-pb',
    'groen',
    {},
    'Gunning',
    '€ 3,8 mln',
    2024,
    2,
  ],
  [
    '23240',
    'Futenweg — groot onderhoud',
    5,
    'projectleider',
    'geel',
    {},
    'Deklaag',
    '€ 6,6 mln',
    2023,
    4,
  ],
  [
    '25090',
    'Aalscholverweg — nieuwe rotonde',
    1,
    'projectleider',
    'groen',
    { 1: 'active' },
    'Intake-formulier',
    '€ 5,2 mln',
    2025,
    3,
  ],
  [
    '24158',
    'Zwaanweg — onderdoorgang spoor',
    3,
    'manager-pb',
    'geel',
    { 3: 'risk' },
    'VO ProRail-afstemming',
    '€ 38 mln',
    2024,
    1,
  ],
  [
    '23260',
    'Roerdompweg — bermverharding',
    5,
    'projectleider',
    'groen',
    {},
    'Afronding',
    '€ 1,9 mln',
    2023,
    4,
  ],
  [
    '25104',
    'Kievitweg — schoolzone',
    2,
    'projectleider',
    'groen',
    {},
    'Omgevingsproces',
    '€ 2,4 mln',
    2025,
    1,
  ],
  [
    '24170',
    'Lepelaarweg — verbreding N701',
    4,
    'projectleider',
    'groen',
    {},
    'Aanbestedingsdossier',
    '€ 29 mln',
    2024,
    2,
  ],
  [
    '22185',
    'Sterappelweg — kunstwerk renovatie',
    6,
    'manager-pb',
    'groen',
    {},
    'Eindafrekening',
    '€ 8,1 mln',
    2022,
    3,
  ],
  [
    '25118',
    'Goudplevierweg — fietstunnel',
    1,
    'projectleider',
    'geel',
    { 1: 'action' },
    'Intake-overleg',
    '€ 12 mln',
    2025,
    2,
  ],
  [
    '24188',
    'Kwartelweg — herinrichting centrum',
    3,
    'manager-pb',
    'groen',
    {},
    'Definitief ontwerp',
    '€ 15 mln',
    2024,
    3,
  ],
];

/** Build a PortfolioProject row from a live RIP Fase 1 process instance. */
export function makePhase1Row(inst: {
  id: string;
  startTime: string;
  projectNumber: string;
  projectName: string;
  leadRole?: string;
}): PortfolioProject {
  const d = new Date(inst.startTime);
  const q = Math.floor(d.getMonth() / 3) + 1;
  const fromIdx = qIdx(d.getFullYear(), q);
  const statuses: StatusKey[] = PHASES.map((p) => (p.n === 1 ? 'active' : 'todo'));
  let cursor = fromIdx;
  const segments: GanttSegment[] = PHASES.map((p, i) => {
    const seg: GanttSegment = { phase: p.n, from: cursor, len: PHASE_DUR[i], status: statuses[i] };
    cursor += PHASE_DUR[i];
    return seg;
  });
  return {
    id: 'live-' + inst.id,
    nr: inst.projectNumber || inst.id.slice(0, 8),
    naam: inst.projectName || 'RIP Fase 1 project',
    phase: 1,
    role: normalizeLeadRole(inst.leadRole),
    health: 'groen',
    phaseStatuses: statuses,
    milestone: 'Fase 1 lopend',
    budget: '—',
    startYear: d.getFullYear(),
    start: fromIdx,
    end: cursor,
    segments,
    instanceId: inst.id,
    ripPhaseCode: RIP_PHASES[0].code,
    ripPhaseState: 'wip',
  };
}

/**
 * Ported from docs/infra-beheer-handoff/reference/pb-data.reference.jsx —
 * spreads each RAW row's old 6-phase legacy value across the real
 * 9-phase RIP ladder via a stable hash of the project number, so all
 * nine deelprocessen are populated in the mock data.
 *   F1 Projectplan   → R2.1
 *   F2 Planuitwerking→ R2.2
 *   F3 Def. ontwerp  → R2.3 VO-raming | R2.4 DO en -raming
 *   F4 Aanbesteding  → R3.1 bestek | R3.2 afronding bestek | R4.1 aanbesteding
 *   F5 Uitvoering    → R5.1 voorbereiding op uitvoering
 *   F6 Decharge      → R5.2 start werk buiten (niet-gemodelleerd staartstuk)
 */
const LADDER_FROM_LEGACY: number[][] = [[1], [2], [3, 4], [5, 6, 7], [8], [9]];

function pbHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

function pbLadderFor(nr: string, legacy: number): number {
  const opts = LADDER_FROM_LEGACY[legacy - 1];
  return opts[pbHash(nr + '|ladder') % opts.length];
}

/** Deterministic per-project coin flip: sits this project BETWEEN two phases? */
function pbAwaits(nr: string): boolean {
  return pbHash(nr + '|await') % 100 < 30;
}

let _projects: PortfolioProject[] | null = null;
export function getMockPortfolio(): PortfolioProject[] {
  if (_projects) return _projects;
  _projects = RAW.map(
    ([nr, naam, phase, role, health, flags, milestone, budget, startYear, startQ], i) => {
      const statuses = phaseStatuses(phase, flags);
      let cursor = qIdx(startYear, startQ);
      const start = cursor;
      const segments = PHASES.map((p, idx) => {
        const seg: GanttSegment = {
          phase: p.n,
          from: cursor,
          len: PHASE_DUR[idx],
          status: statuses[idx],
        };
        cursor += PHASE_DUR[idx];
        return seg;
      });
      const ladderPos = pbLadderFor(nr, phase);
      const ripPhaseCode = RIP_PHASES[ladderPos - 1].code;
      const awaiting = ladderPos > 1 && ladderPos < RIP_PHASES.length && pbAwaits(nr);
      const ripPhaseState: 'wip' | 'wachtend' = awaiting ? 'wachtend' : 'wip';
      return {
        id: 'p' + i,
        nr,
        naam,
        phase,
        role,
        health,
        phaseStatuses: statuses,
        milestone,
        budget,
        startYear,
        start,
        end: cursor,
        segments,
        ripPhaseCode,
        ripPhaseState,
      };
    }
  );
  return _projects;
}

/**
 * WIP / Gereed / geparkeerd counts per RIP phase, derived from the mock
 * projects' ripPhaseCode/ripPhaseState. Mirrors
 * reference/pb-instances.reference.jsx's status derivation.
 */
export function getMockPhaseCounts(): Record<string, PhaseCounts> {
  const projects = getMockPortfolio();
  const out: Record<string, PhaseCounts> = {};
  RIP_PHASES.forEach((phase: RipPhase, i) => {
    let wip = 0;
    let gereed = 0;
    let geparkeerd = 0;
    for (const p of projects) {
      const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
      // gereed = the project's current ladder position is PAST this phase
      // (it has already completed it) — not before it.
      if (curIdx > i) {
        gereed++;
        continue;
      }
      if (phase.beyond) {
        if (curIdx === i) geparkeerd++;
        continue;
      }
      if (curIdx === i && p.ripPhaseState === 'wip') wip++;
    }
    out[phase.code] = { wip, gereed, geparkeerd };
  });
  return out;
}

/**
 * Mock projects currently WIP at this phase — same classification
 * getMockPhaseCounts uses for its `wip` count (curIdx === i, state ===
 * 'wip', never for a `beyond` phase — the ladder's last rung is always
 * 'wip' by construction but counted as geparkeerd instead). Exposed as
 * rows for the WIP tab.
 */
export function getMockWipRows(phase: RipPhase): PortfolioProject[] {
  if (phase.beyond) return [];
  const idx = RIP_PHASES.findIndex((p) => p.code === phase.code);
  return getMockPortfolio().filter((p) => {
    const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
    return curIdx === idx && p.ripPhaseState === 'wip';
  });
}

/**
 * Mock projects already past this phase — same classification
 * getMockPhaseCounts uses for its `gereed` count. Exposed as rows for
 * the Gereed tab.
 */
export function getMockGereedRows(phase: RipPhase): PortfolioProject[] {
  const idx = RIP_PHASES.findIndex((p) => p.code === phase.code);
  return getMockPortfolio().filter((p) => {
    const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
    return curIdx > idx;
  });
}

/**
 * Projects whose current ladder position is exactly this phase's
 * predecessor, sitting in 'wachtend' (previous phase accorded, this one
 * not yet started). Always empty for the first phase in ladder order —
 * there is no predecessor to be ready from.
 */
export function getReadyProjects(phaseCode: string): PortfolioProject[] {
  const idx = RIP_PHASES.findIndex((p) => p.code === phaseCode);
  if (idx <= 0) return [];
  const prevCode = RIP_PHASES[idx - 1].code;
  return getMockPortfolio().filter(
    (p) => p.ripPhaseCode === prevCode && p.ripPhaseState === 'wachtend'
  );
}

/**
 * Projects not yet in sequence for this phase — still working an earlier
 * phase, or still 'wip' on the immediate predecessor (not yet accorded).
 * These are the "Toon N projecten die nog niet aan beurt zijn" set.
 */
export function getOutOfSequenceProjects(phaseCode: string): PortfolioProject[] {
  const idx = RIP_PHASES.findIndex((p) => p.code === phaseCode);
  if (idx <= 0) return [];
  const ready = new Set(getReadyProjects(phaseCode).map((p) => p.id));
  return getMockPortfolio().filter((p) => {
    if (ready.has(p.id)) return false;
    const curIdx = RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
    return curIdx < idx;
  });
}

export interface MockPhaseInstanceDetail {
  step: string | null;
  stepRole: string | null;
  daysInStep: number;
  blocked: string | null;
  docsDone: number;
  docsTotal: number;
  loops: number;
  plannedWeeks: number;
  actualWeeks: number | null;
  doneBy: string | null;
  doneDate: string | null;
}

/** A handful of plausible completion-date strings, picked
 *  deterministically — not tied to any real timeline consistency. */
const MOCK_DONE_MONTHS = [
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
function formatDeterministicDate(seed: number): string {
  const day = 1 + (seed % 28);
  const month = MOCK_DONE_MONTHS[Math.floor(seed / 28) % 12];
  const year = TL.startYear + (Math.floor(seed / 336) % (TL.quarters / 4));
  return `${day} ${month} ${year}`;
}

/**
 * Deterministic per-project-per-phase illustrative detail, ported from
 * reference/pb-instances.reference.jsx. Meaningful fields are only
 * populated for the project's OWN current wip phase; every other
 * phase gets docsDone === docsTotal (implying "done") and null/zero
 * wip-only fields, since the simplified ripPhaseCode/ripPhaseState
 * model doesn't retain historical per-phase detail for phases already
 * passed.
 */
export function getMockPhaseInstanceDetail(
  project: PortfolioProject,
  phase: RipPhase
): MockPhaseInstanceDetail {
  const seed = pbHash(`${project.nr}|${phase.code}|detail`);
  const rnd = (salt: number) => ((seed * (salt + 1)) % 10000) / 10000;
  const isWip = project.ripPhaseCode === phase.code && project.ripPhaseState === 'wip';
  return {
    step: isWip ? (phase.docs[Math.floor(rnd(1) * phase.docs.length)] ?? phase.exit) : null,
    stepRole: isWip ? phase.roles[Math.floor(rnd(2) * phase.roles.length)] : null,
    daysInStep: isWip ? 1 + Math.floor(rnd(3) * 34) : 0,
    blocked:
      isWip && phase.gates.length && rnd(4) > 0.72
        ? phase.gates[Math.floor(rnd(5) * phase.gates.length)]
        : null,
    docsDone: isWip ? Math.floor(rnd(6) * (phase.docs.length + 1)) : phase.docs.length,
    docsTotal: phase.docs.length,
    loops: Math.floor(rnd(7) * 3),
    plannedWeeks: phase.weeks,
    actualWeeks: Math.max(2, Math.round(phase.weeks * (0.75 + rnd(8) * 0.8))),
    doneBy: ['AO', 'Aandrager', 'Projectleider', 'Concerndirecteur'][Math.floor(rnd(9) * 4)],
    doneDate: formatDeterministicDate(seed),
  };
}

export const MIJN_PROJECT_NRS = ['23102', '24011', '24102', '25031', '23166', '25090'];

export function getMockTodos(): {
  vandaag: TodoItem[];
  deze_week: TodoItem[];
  volgende_week: TodoItem[];
} {
  return {
    vandaag: [
      {
        prio: 'overdue',
        titel: 'Stremming Vogelweg-rotonde oplossen',
        proj: '23201',
        sub: 'Aannemer meldt onveilige situatie — besluit vóór 12:00',
        actie: 'Behandelen',
      },
      {
        prio: 'overdue',
        titel: 'Bezwaar geluidsmaatregelen Ramsweg',
        proj: '23133',
        sub: 'Reactietermijn verloopt vandaag',
        actie: 'Behandelen',
      },
    ],
    deze_week: [
      {
        prio: 'active',
        titel: 'Gunningsadvies Larserweg aansluiting',
        proj: '24011',
        sub: 'Aanbesteding gesloten — advies opstellen',
        actie: 'Openen',
      },
      {
        prio: 'active',
        titel: 'VO Gooiseweg verbreding vaststellen',
        proj: '24102',
        sub: 'Stuurgroep donderdag',
        actie: 'Openen',
      },
    ],
    volgende_week: [
      {
        prio: 'active',
        titel: 'Aanbestedingsleidraad Knardijk',
        proj: '24056',
        sub: 'Review met inkoop',
        actie: 'Openen',
      },
    ],
  };
}

export function getMockUpdates(): UpdateItem[] {
  return [
    {
      datum: '18 jun',
      proj: '24011',
      tekst: 'Aanbesteding Larserweg gesloten — 3 inschrijvingen ontvangen.',
    },
    {
      datum: '17 jun',
      proj: '23102',
      tekst: 'Deelvak 1 Kuinderweg opgeleverd en vrijgegeven voor verkeer.',
    },
    {
      datum: '16 jun',
      proj: '23201',
      tekst: 'Melding onveilige situatie Vogelweg-rotonde door aannemer.',
    },
    {
      datum: '13 jun',
      proj: '24102',
      tekst: 'Voorlopig Ontwerp Gooiseweg gereed voor stuurgroep.',
    },
  ];
}
