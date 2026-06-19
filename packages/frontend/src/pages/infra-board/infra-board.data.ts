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

import { PHASES, type StatusKey, type HealthKey } from './rip-model';

// ── Timeline window: 2022 Q1 … 2027 Q4 ──────────────────────────────────────
export const TL = { startYear: 2022, quarters: 24, todayIdx: 17 };
const qIdx = (year: number, q: number) => (year - TL.startYear) * 4 + (q - 1);
/** Mock per-phase durations (quarters). Replace with planning data. */
const PHASE_DUR = [2, 3, 3, 2, 5, 2];

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
    '25090',
    'Aalscholverweg — nieuwe rotonde',
    1,
    'projectleider',
    'groen',
    { 1: 'active' },
    'Risicodossier opstellen',
    '€ 5,2 mln',
    2025,
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
];

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
      };
    }
  );
  return _projects;
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
