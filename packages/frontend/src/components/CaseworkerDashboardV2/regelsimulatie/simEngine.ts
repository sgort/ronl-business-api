// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.ts
/**
 * Regelsimulatie — engine
 * ------------------------------------------------------------
 * Faithful TypeScript port of the Flevoland "recht en hoogte subsidie
 * thuisbatterij" decision model (DMN), driven over the full 2026–2027
 * application window against a synthetic target population. Deterministic
 * given a seed.
 *
 * Ported from docs/regelsimulatie-handoff/reference/preview/mock-sim-engine.jsx
 * (repo-root-relative), which is plain JS wrapped in an IIFE exposing
 * `window.SimEngine`. This port is a 1:1 behavioral port with ONE
 * deliberate, authorized deviation: `makeResolver` is exported here, where
 * the reference keeps it as an unexported closure inside the IIFE.
 * Exporting it changes nothing about behavior — it exists purely so tests
 * can drive the ceiling/sealing/priority resolver directly with small,
 * hand-constructed claimant fixtures instead of only reachable indirectly
 * by running the entire population generator through `run()`.
 *
 * The reference's legacy `beschikbaar` helper (marked "kept for API
 * compatibility; unused by run" in the source) is intentionally NOT ported —
 * nothing in this plan calls it.
 *
 * V2 — reservation + doorlooptijd + aanvullende informatie:
 *   • Elke aanvraag heeft een DOORLOOPTIJD (submit → besluit).
 *   • Bij indiening wordt de basishoogte GERESERVEERD in de pot
 *     van de aanvrager (per type), en pas vrijgegeven bij afwijzing
 *     of uitbetaling. Budget is dus "vast" tijdens de behandeling.
 *   • Sommige aanvragen krijgen een VERZOEK OM AANVULLENDE INFO
 *     (RFI): dat verlengt de doorlooptijd én verschuift de
 *     uitbetaal-prioriteit naar het moment dat de info binnenkomt
 *     (first-come-first-served op 'effectieve' datum). De reservering
 *     loopt gewoon door vanaf de echte indiendatum.
 *   • Uitbetaling gebeurt strikt op effectieve-datum-volgorde per pot;
 *     is een pot eenmaal op, dan blijft die op (geen back-fill). Zo
 *     kan een GELDIGE aanvraag toch onbetaald blijven omdat een
 *     andere claim voorrang had — precies het te tonen effect.
 *   • Bezwaar blijft een aparte, ná-besluit-stap (post-decision hold).
 *
 * Rule sources:
 *   RechtOpSubsidieThuisbatterij        (eligibility)
 *   SubsidieConstantenThuisbatterij     (25% / min 750 / max 1250)
 *   BerekenBasisHoogteSubsidie          (clamp, below-min → 0)
 *   BerekenBeschikbaarSubsidiePlafond   (year/period ceilings)
 *   BehaalbareHoogteSubsidie            (min(basis, plafond))
 */

import type {
  AanvragerType,
  AppealKind,
  BezwaarUitkomst,
  Claimant,
  ClaimantResult,
  EntitlementResult,
  ExhaustionEvent,
  Klasse,
  Persoon,
  Periode,
  RedenKey,
  ResolveResult,
  SimAgg,
  SimApp,
  SimConfig,
  SimDaySnapshot,
  SimEvent,
  SimResult,
  Uitkomst,
  YearCeilings,
  RelatieTotWoning,
} from './types';

// ============================================================
// Part A — deterministic RNG, date helpers, DMN eligibility &
// amount rules, budget constants. Ported verbatim, typed.
// ============================================================

// ---- deterministic RNG (mulberry32) --------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// gaussian via Box–Muller, clamped
export function gauss(
  rng: () => number,
  mean: number,
  sd: number,
  lo?: number | null,
  hi?: number | null
): number {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  let x = mean + z * sd;
  if (lo != null) x = Math.max(lo, x);
  if (hi != null) x = Math.min(hi, x);
  return x;
}

// uniform integer draw in [gem-spread, gem+spread], floored at lo
export function drawDays(
  rng: () => number,
  gem: number,
  spread: number,
  lo?: number | null
): number {
  const v = Math.round(gem - spread + rng() * (2 * spread));
  return Math.max(lo == null ? 1 : lo, v);
}

// ---- date helpers (UTC, day-resolution) ----------------
const MS = 86400000;
export const START = Date.UTC(2026, 0, 12); // 2026-01-12, scheme opens
export const END = Date.UTC(2027, 11, 31); // 2027-12-31
export const TOTAL_DAYS = Math.round((END - START) / MS) + 1;
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
export function dayToTs(d: number): number {
  return START + d * MS;
}
export function fmtDate(ts: number): string {
  const dt = new Date(ts);
  return `${dt.getUTCDate()} ${NL_MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}
export function fmtShort(ts: number): string {
  const dt = new Date(ts);
  return `${dt.getUTCDate()} ${NL_MONTHS[dt.getUTCMonth()]} '${String(dt.getUTCFullYear()).slice(2)}`;
}

// ---- DMN: recht (eligibility) --------------------------
export function beslisRecht(p: {
  aanvragerFailliet: boolean;
  provincieWoning: string;
  relatieTotWoning: RelatieTotWoning;
  toestemmingEigenaar: boolean;
  rekeningNaamKomtOvereen: boolean;
}): EntitlementResult {
  if (p.aanvragerFailliet)
    return { recht: false, reden: 'Aanvrager is failliet', redenKey: 'failliet' };
  if (p.provincieWoning !== 'Flevoland')
    return { recht: false, reden: 'Woning ligt niet in Flevoland', redenKey: 'buitenprovincie' };
  if (p.relatieTotWoning !== 'eigenaar' && p.relatieTotWoning !== 'huurder')
    return { recht: false, reden: 'Aanvrager is geen eigenaar of huurder', redenKey: 'relatie' };
  if (p.relatieTotWoning === 'huurder' && !p.toestemmingEigenaar)
    return {
      recht: false,
      reden: 'Huurder heeft geen toestemming van eigenaar',
      redenKey: 'toestemming',
    };
  if (!p.rekeningNaamKomtOvereen)
    return {
      recht: false,
      reden: 'Aanvrager staat niet op de energierekening',
      redenKey: 'energierekening',
    };
  return { recht: true, reden: 'Aanvrager heeft recht op subsidie', redenKey: 'toegekend' };
}

// ---- DMN: basis hoogte (constants + clamp) -------------
const PCT = 0.25,
  SUB_MIN = 750,
  SUB_MAX = 1250;
export function basisHoogte(gemaakteKosten: number): number {
  const raw = PCT * gemaakteKosten;
  if (raw < SUB_MIN) return 0; // Rule_Basis_OnderMinimum → 0
  return Math.min(raw, SUB_MAX); // Rule_Basis_BovenMinimum, clamp to max
}

// ---- DMN: beschikbaar plafond --------------------------
// returns { year, mode:'split'|'bundled'|'buiten' }
export function periode(ts: number): Periode {
  const dt = new Date(ts);
  const y = dt.getUTCFullYear();
  const md = (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate(); // e.g. 1001 = 1 okt
  if (y === 2026) {
    if (md >= 112 && md <= 930) return { year: 2026, mode: 'split' };
    if (md >= 1001 && md <= 1231) return { year: 2026, mode: 'bundled' };
  }
  if (y === 2027) {
    if (md >= 101 && md <= 930) return { year: 2027, mode: 'split' };
    if (md >= 1001 && md <= 1231) return { year: 2027, mode: 'bundled' };
  }
  return { year: y, mode: 'buiten' };
}
// clamp a year to a ceiling-bearing year
function ceilYear(y: number): number {
  return y <= 2026 ? 2026 : 2027;
}

// ---- budget structure (new rules) ----------------------
// Budget year = SUBMISSION year (a 2026 application is settled from the 2026
// budget even if it's decided in 2027). Within a budget year the eigenaren and
// huurders pots are SPLIT (€437.5k each) until 1 October, then MERGE into one
// pool (leftover shared, no distinction). 2027's total = €1.0M + whatever the
// 2026 budget left unspent (carry-over).
const CEIL_SPLIT = 437500,
  CEIL_M2026 = 875000,
  CEIL_2027_BASE = 1000000;
const OCT1_DAY: Record<number, number> = {
  2026: Math.round((Date.UTC(2026, 9, 1) - START) / MS),
  2027: Math.round((Date.UTC(2027, 9, 1) - START) / MS),
};

// (reference's legacy `beschikbaar` helper intentionally not ported — see
// top-of-file comment.)

// ---- population generation ------------------------------
const VOORNAMEN = [
  'Jan',
  'Sanne',
  'Youssef',
  'Marijke',
  'Bram',
  'Fatima',
  'Kevin',
  'Anouk',
  'Dirk',
  'Priya',
  'Lars',
  'Emma',
  'Tim',
  'Nadia',
  'Ruben',
  'Sophie',
  'Daan',
  'Lisa',
  'Mohammed',
  'Femke',
  'Bas',
  'Ilse',
  'Thijs',
  'Noor',
  'Sven',
  'Hanna',
];
const ACHTERNAMEN = [
  'de Vries',
  'Jansen',
  'Bakker',
  'Visser',
  'Smit',
  'Meijer',
  'Mulder',
  'Bos',
  'Vos',
  'Peters',
  'Hendriks',
  'van Dijk',
  'Dekker',
  'Brouwer',
  'de Boer',
  'El Amrani',
  'Kowalski',
  'Yılmaz',
  'van Leeuwen',
  'Postma',
  'Groen',
  'Kok',
];
const PLAATSEN = [
  'Almere',
  'Lelystad',
  'Emmeland',
  'Dronten',
  'Zeewolde',
  'Urk',
  'Noordoostpolder',
  'Biddinghuizen',
];
const BUITEN = ['Noord-Holland', 'Utrecht', 'Overijssel', 'Gelderland'];

function makePersoon(rng: () => number, cfg: SimConfig): Persoon {
  const isEigenaar = rng() < cfg.eigenaarRatio;
  const type: AanvragerType = isEigenaar ? 'eigenaar' : 'huurder';

  const failliet = rng() < cfg.pFailliet;
  const buiten = rng() < cfg.pBuitenprovincie;
  const geenRelatie = rng() < cfg.pGeenRelatie;
  const geenToestemming = !isEigenaar && rng() < cfg.pGeenToestemming;
  const naamMismatch = rng() < cfg.pNaamMismatch;

  let relatieTotWoning: RelatieTotWoning = type;
  if (geenRelatie) relatieTotWoning = rng() < 0.5 ? 'gebruiker' : 'erfpachter';

  const kosten = Math.round(gauss(rng, cfg.kostenGem, cfg.kostenSd, 400, 12000) / 50) * 50;

  return {
    voornaam: VOORNAMEN[(rng() * VOORNAMEN.length) | 0],
    achternaam: ACHTERNAMEN[(rng() * ACHTERNAMEN.length) | 0],
    plaats: buiten ? BUITEN[(rng() * BUITEN.length) | 0] : PLAATSEN[(rng() * PLAATSEN.length) | 0],
    type,
    aanvragerFailliet: failliet,
    provincieWoning: buiten ? BUITEN[0] : 'Flevoland',
    relatieTotWoning,
    toestemmingEigenaar: isEigenaar ? true : !geenToestemming,
    rekeningNaamKomtOvereen: !naamMismatch,
    gemaakteKosten: kosten,
  };
}

function sampleSubmitDay(rng: () => number, cfg: SimConfig): number {
  const share2026 = cfg && cfg.aandeel2026 != null ? cfg.aandeel2026 : 0.46;
  // arrival shape within a year: r = U^pow biases toward the start (pow=1 even,
  // pow>1 = opening rush). Mild front-load keeps the sawtooth without stranding
  // budget late in the year.
  const pow = cfg && cfg.arrivalPow != null ? cfg.arrivalPow : 1.3;
  const draw = () => Math.pow(rng(), pow);
  const in2026 = rng() < share2026;
  let ts: number;
  if (in2026) {
    const openTs = Date.UTC(2026, 0, 12),
      closeTs = Date.UTC(2026, 11, 31); // scheme open all year (from 12 jan)
    const r = draw();
    ts = openTs + r * (closeTs - openTs);
  } else {
    const openTs = Date.UTC(2027, 0, 1),
      closeTs = Date.UTC(2027, 11, 31); // scheme open all year
    const r = draw();
    ts = openTs + r * (closeTs - openTs);
  }
  return Math.max(0, Math.min(TOTAL_DAYS - 1, Math.round((ts - START) / MS)));
}

// ============================================================
// Part B — pure payout resolver (claimant-based). Exported as
// a deliberate, authorized deviation from the reference (which
// keeps this as an unexported closure): see top-of-file comment.
// ============================================================

// Resolves CLAIMANTS in priority-key order into per-BUDGET-YEAR pools. Budget
// year is fixed at submission (a.year). Within a year the pots are split
// (eig/huur, €437.5k each) until 1 October of that year, then merge into one
// pool; a request settled on/after 1 Oct of its budget year draws from the
// merged pool even if that day falls in the next calendar year. All-or-nothing,
// per-pool sealing, no back-fill. 2026 is resolved first so its unspent budget
// carries over into 2027's merged ceiling. A claimant is a normal eligible
// request OR an upheld appeal (relates back to its original priority, paid from
// the pool active on its appeal-decision day). Pure — no RNG.
export function makeResolver(scale: number): (claimants: Claimant[]) => ResolveResult {
  const split = CEIL_SPLIT * scale,
    m26 = CEIL_M2026 * scale,
    base27 = CEIL_2027_BASE * scale;
  return function resolve(claimants: Claimant[]): ResolveResult {
    const q = claimants.slice().sort((a, b) => a.key - b.key || a.ord - b.ord);
    const reeds: Record<number, { eig: number; huur: number }> = {
      2026: { eig: 0, huur: 0 },
      2027: { eig: 0, huur: 0 },
    };
    const sealed = new Set<string>();
    const lastPaid: Record<string, Claimant> = {};
    const sealDay: Record<string, number> = {};
    const res: Record<string, ClaimantResult> = {};
    function processYear(by: number, mergedCeil: number) {
      let normalCurDay = 0;
      for (const a of q) {
        if (a.year !== by) continue;
        let compDay: number;
        if (a.isAppeal) {
          compDay = a.competeDay;
        } else {
          normalCurDay = Math.max(normalCurDay, a.competeDay);
          compDay = normalCurDay;
        }
        const merged = compDay >= OCT1_DAY[by];
        const bucket: 'eig' | 'huur' = a.type === 'eigenaar' ? 'eig' : 'huur';
        const pid = by + ':' + (merged ? 'merged' : bucket);
        const reedsPool = merged ? reeds[by].eig + reeds[by].huur : reeds[by][bucket];
        const ceil = merged ? mergedCeil : split;
        let paid: boolean,
          blk: Claimant | null = null,
          justSealed = false;
        if (!sealed.has(pid) && reedsPool + a.basis <= ceil + 1e-6) {
          paid = true;
          reeds[by][bucket] += a.basis;
          lastPaid[pid] = a;
        } else {
          paid = false;
          blk = lastPaid[pid] || null;
          if (!sealed.has(pid)) {
            sealed.add(pid);
            sealDay[pid] = compDay;
            justSealed = true;
          }
        }
        res[a.id] = {
          paid,
          blockedById: blk ? blk.refId : null,
          justMissedByOne: justSealed && !!blk,
          resolvedDay: compDay,
          pid,
          key: a.key,
          isAppeal: !!a.isAppeal,
        };
      }
    }
    processYear(2026, m26);
    const carryover = Math.max(0, m26 - (reeds[2026].eig + reeds[2026].huur));
    processYear(2027, base27 + carryover);
    return { res, sealDay, carryover };
  };
}

// ============================================================
// Part C — main run() orchestrator, mechanically ported.
// ============================================================

function mkEvent(a: SimApp, d: number, uitkomst: SimEvent['uitkomst'], bedrag: number): SimEvent {
  const p = a.persoon;
  return {
    id: a.id,
    day: d,
    ts: dayToTs(d),
    naam: `${p.voornaam} ${p.achternaam}`,
    plaats: p.plaats,
    type: p.type,
    kosten: p.gemaakteKosten,
    basis: a.basis,
    uitkomst,
    bedrag,
    isRFI: a.isRFI,
    submitDay: a.submitDay,
    decisionDay: a.decisionDay,
    effDay: a.effDay,
    infoReceivedDay: a.infoReceivedDay,
    reden: a.reden,
    redenKey: a.redenKey,
    bezwaar: !!a.bezwaar,
    blockedById: a.blockedById,
    justMissedByOne: a.justMissedByOne,
  };
}

export function run(cfg: SimConfig): SimResult {
  const rng = mulberry32(cfg.seed || 20260112);

  const pRFI = cfg.pAanvullendeInfo != null ? cfg.pAanvullendeInfo : 0.22;
  const procGem = cfg.doorlooptijdGem != null ? cfg.doorlooptijdGem : 8;
  const procSpread = Math.max(1, Math.round(procGem * 0.4));
  const waitGem = cfg.infoWachtGem != null ? cfg.infoWachtGem : 21;
  const waitSpread = Math.max(2, Math.round(waitGem * 0.35));

  const scale = cfg.budgetScale;
  const ceilings: Record<number, YearCeilings> = {
    2026: { eig: CEIL_SPLIT * scale, huur: CEIL_SPLIT * scale, bundled: CEIL_M2026 * scale },
    2027: { eig: CEIL_SPLIT * scale, huur: CEIL_SPLIT * scale, bundled: CEIL_2027_BASE * scale }, // .bundled updated with 2026 carry-over after resolution
  };

  const apps: SimApp[] = [];
  for (let i = 0; i < cfg.populatie; i++) {
    const p = makePersoon(rng, cfg);
    const submitDay = sampleSubmitDay(rng, cfg);
    const basis = basisHoogte(p.gemaakteKosten);
    const proc = drawDays(rng, procGem, procSpread, 1);
    const isRFI = rng() < pRFI;

    let subprocessStart: number | null = null,
      infoReceivedDay: number | null = null,
      decisionDay: number,
      effDay: number;
    if (isRFI) {
      subprocessStart = submitDay + 1 + proc;
      const wait = drawDays(rng, waitGem, waitSpread, 3);
      infoReceivedDay = subprocessStart + wait;
      const post = drawDays(rng, procGem, procSpread, 1);
      decisionDay = infoReceivedDay + post;
      effDay = infoReceivedDay;
    } else {
      decisionDay = submitDay + 1 + proc;
      effDay = submitDay;
    }
    if (decisionDay > TOTAL_DAYS - 1) {
      decisionDay = TOTAL_DAYS - 1;
      if (infoReceivedDay != null) {
        infoReceivedDay = Math.min(infoReceivedDay, decisionDay);
        effDay = infoReceivedDay;
      }
      if (subprocessStart != null) subprocessStart = Math.min(subprocessStart, decisionDay);
    }
    const yr = new Date(dayToTs(submitDay)).getUTCFullYear(); // budget year = submission year

    const r = beslisRecht(p);
    let klasse: Klasse,
      reden: string | null = null,
      redenKey: RedenKey | null = null;
    if (!r.recht) {
      klasse = 'afgewezen';
      reden = r.reden;
      redenKey = r.redenKey;
    } else if (basis === 0) {
      klasse = 'geen-hoogte';
    } else {
      klasse = 'accepted';
    }

    apps.push({
      id: i + 1,
      persoon: p,
      type: p.type,
      submitDay,
      decisionDay,
      isRFI,
      subprocessStart,
      infoReceivedDay,
      effDay,
      basis,
      year: yr,
      klasse,
      reden,
      redenKey,
      paid: null,
      paid0: null,
      uitkomst: null,
      bedrag: 0,
      payoutResolvedDay: null,
      missedDueToRFI: false,
      missedDueToBeroep: false,
      beroepDisplacerId: null,
      beroepFiled: false,
      beroepUpheld: false,
      appealKind: null,
      appealResolveDay: null,
      appealPaid: false,
      bezwaar: false,
      bezwaarUitkomst: null,
      blockedById: null,
      justMissedByOne: false,
    });
  }

  const accepted = apps.filter((a) => a.klasse === 'accepted');
  const resolve = makeResolver(scale);
  const nClaim = (a: SimApp, keyOverride?: number | null): Claimant => ({
    id: 'n' + a.id,
    refId: a.id,
    key: keyOverride != null ? keyOverride : a.effDay,
    ord: a.id,
    competeDay: a.decisionDay,
    type: a.type,
    year: a.year,
    basis: a.basis,
    isAppeal: false,
  });

  // A0 — world WITHOUT appeals: who's eligible-but-unpaid on the merits?
  const A0 = resolve(accepted.map((a) => nClaim(a)));
  for (const a of accepted) a.paid0 = A0.res['n' + a.id].paid;

  // appeals: some DENIED (recht) requests and some budget-unpaid requests file a
  // beroep; a share are upheld. An upheld appeal (basis > 0) becomes a budget
  // claimant that must be honoured — consuming budget from the pool.
  const appealClaims: Claimant[] = [];
  for (const a of apps) {
    const denialElig = a.klasse === 'afgewezen' && a.basis > 0;
    const budgetElig = a.klasse === 'accepted' && !a.paid0;
    if (!(denialElig || budgetElig)) continue;
    if (rng() < cfg.bezwaarKans) {
      const upheld = rng() < cfg.bezwaarToewijzing;
      const dur = 14 + Math.round(rng() * 16);
      a.beroepFiled = true;
      a.beroepUpheld = upheld;
      a.appealKind = (denialElig ? 'denial' : 'budget') as AppealKind;
      a.appealResolveDay = Math.min(a.decisionDay + dur, TOTAL_DAYS - 1);
      if (upheld) {
        appealClaims.push({
          id: 'a' + a.id,
          refId: a.id,
          key: a.effDay,
          ord: a.id,
          competeDay: a.appealResolveDay,
          type: a.type,
          year: a.year,
          basis: a.basis,
          isAppeal: true,
        });
      }
    }
  }

  // A1 — real world WITH upheld appeals competing for budget
  const A1 = resolve(accepted.map((a) => nClaim(a)).concat(appealClaims));
  for (const a of accepted) {
    const ra = A1.res['n' + a.id];
    a.paid = ra.paid;
    a.uitkomst = (ra.paid ? 'volledig' : 'niet-uitbetaald') as Uitkomst;
    a.bedrag = ra.paid ? a.basis : 0;
    a.blockedById = ra.blockedById;
    a.justMissedByOne = ra.justMissedByOne;
    a.payoutResolvedDay = ra.resolvedDay;
    a.pid = ra.pid;
  }
  for (const c of appealClaims) {
    const app = apps.find((x) => x.id === c.refId);
    if (app) app.appealPaid = !!(A1.res[c.id] && A1.res[c.id].paid);
  }

  // 2026's unspent budget carries over into 2027's merged (post-1-Oct) ceiling
  const carryover2026 = A1.carryover;
  ceilings[2027].bundled = CEIL_2027_BASE * scale + carryover2026;

  // isolate the collateral victims: eligible, paid WITHOUT appeals but NOT paid
  // once a successful appeal claimed the budget ahead of them.
  const appealWinnersByPool: Record<string, { id: number; key: number }[]> = {};
  for (const c of appealClaims) {
    const app = apps.find((x) => x.id === c.refId);
    if (!app || !app.appealPaid) continue;
    const pid = A1.res[c.id].pid;
    (appealWinnersByPool[pid] = appealWinnersByPool[pid] || []).push({ id: c.refId, key: c.key });
  }
  for (const a of accepted) {
    a.missedDueToBeroep = !!(a.paid0 && !a.paid);
    if (a.missedDueToBeroep) {
      const pool = appealWinnersByPool[a.pid as string] || [];
      let best: { id: number; key: number } | null = null;
      for (const w of pool) {
        if (w.key <= a.effDay && (!best || w.key > best.key)) best = w;
      }
      if (!best)
        for (const w of pool) {
          if (!best || w.key < best.key) best = w;
        }
      a.beroepDisplacerId = best ? best.id : null;
    }
  }

  // per-request RFI counterfactual, on the real (with-appeals) world
  for (const x of accepted) {
    if (x.isRFI && !x.paid) {
      const cf = resolve(
        accepted.map((a) => nClaim(a, a.id === x.id ? x.submitDay : null)).concat(appealClaims)
      );
      x.missedDueToRFI = !!(cf.res['n' + x.id] && cf.res['n' + x.id].paid);
    }
  }

  for (const a of apps) {
    if (a.klasse === 'afgewezen') {
      a.uitkomst = 'afgewezen';
      a.payoutResolvedDay = a.decisionDay;
    } else if (a.klasse === 'geen-hoogte') {
      a.uitkomst = 'geen-hoogte';
      a.payoutResolvedDay = a.decisionDay;
    }
  }

  const exhaustion: Record<string, ExhaustionEvent> = {};
  for (const pid in A1.sealDay) {
    const day = A1.sealDay[pid];
    const parts = pid.split(':');
    const yr = parts[0],
      kind = parts[1];
    const label =
      kind === 'bundled' || kind === 'merged'
        ? `Gebundeld budget ${yr} uitgeput`
        : kind === 'eig'
          ? `Eigenaren-plafond ${yr} uitgeput`
          : `Huurders-plafond ${yr} uitgeput`;
    exhaustion[pid] = { day, ts: dayToTs(day), label };
  }

  // schedules
  const bySubmit: SimApp[][] = Array.from({ length: TOTAL_DAYS }, () => []);
  const byDecision: SimApp[][] = Array.from({ length: TOTAL_DAYS }, () => []);
  const byResolve: SimApp[][] = Array.from({ length: TOTAL_DAYS }, () => []);
  const byAppealFile: SimApp[][] = Array.from({ length: TOTAL_DAYS }, () => []);
  const byAppealResolve: SimApp[][] = Array.from({ length: TOTAL_DAYS }, () => []);
  apps.forEach((a) => {
    bySubmit[a.submitDay].push(a);
    byDecision[a.decisionDay].push(a);
    if (a.klasse === 'accepted') byResolve[a.payoutResolvedDay as number].push(a);
    if (a.beroepFiled) {
      byAppealFile[a.decisionDay].push(a);
      byAppealResolve[a.appealResolveDay as number].push(a);
    }
  });

  const rfiDelta = new Array(TOTAL_DAYS + 1).fill(0);
  apps.forEach((a) => {
    if (
      a.isRFI &&
      a.subprocessStart != null &&
      a.infoReceivedDay != null &&
      a.infoReceivedDay > a.subprocessStart
    ) {
      rfiDelta[a.subprocessStart] += 1;
      rfiDelta[Math.min(a.infoReceivedDay, TOTAL_DAYS)] -= 1;
    }
  });

  // running display/accounting state
  const reeds: Record<number, { eig: number; huur: number }> = {
    2026: { eig: 0, huur: 0 },
    2027: { eig: 0, huur: 0 },
  };
  const reserved: Record<number, { eig: number; huur: number }> = {
    2026: { eig: 0, huur: 0 },
    2027: { eig: 0, huur: 0 },
  };
  let holdTotal = 0;

  const agg: SimAgg = {
    ingediend: 0,
    rechtToegekend: 0,
    afgewezenRecht: 0,
    volledig: 0,
    nietUitbetaald: 0,
    kostenTeLaag: 0,
    redenen: { failliet: 0, buitenprovincie: 0, relatie: 0, toestemming: 0, energierekening: 0 },
    rfiTotaal: 0,
    nietUitbetaaldRFI: 0,
    missedDueToRFI: accepted.filter((a) => a.missedDueToRFI).length,
    bezwaarIngediend: 0,
    bezwaarToegewezen: 0,
    bezwaarAfgewezen: 0,
    missedDueToBeroep: accepted.filter((a) => a.missedDueToBeroep).length,
  };
  let toegekendBedrag = 0;
  let bezwaarUitbetaald = 0;
  let openBehandeling = 0;
  let pendingPayout = 0;
  let rfiOpen = 0;
  let bedragVolledig = 0,
    bedragNietUitbetaald = 0,
    bedragInBehandeling = 0,
    bedragWacht = 0,
    bedragKostenTeLaag = 0,
    bedragAfgewezen = 0;

  const days: SimDaySnapshot[] = [];
  const feed: SimEvent[] = [];
  function bucketOf(t: AanvragerType): 'eig' | 'huur' {
    return t === 'eigenaar' ? 'eig' : 'huur';
  }

  function availableInPool(a: SimApp, d: number): number {
    const per = periode(dayToTs(d));
    const mode = per.mode === 'buiten' ? 'bundled' : per.mode;
    const c = ceilings[a.year];
    const bucket = bucketOf(a.type);
    if (mode === 'split') {
      return Math.max(
        (a.type === 'eigenaar' ? c.eig : c.huur) - reeds[a.year][bucket] - reserved[a.year][bucket],
        0
      );
    }
    return Math.max(
      c.bundled -
        reeds[a.year].eig -
        reeds[a.year].huur -
        reserved[a.year].eig -
        reserved[a.year].huur,
      0
    );
  }

  function snapshotFor(d: number, per: Periode): SimDaySnapshot {
    const yr = per.mode === 'buiten' ? ceilYear(new Date(dayToTs(d)).getUTCFullYear()) : per.year;
    const c = ceilings[yr] || ceilings[2026];
    const reedsE = reeds[yr] ? reeds[yr].eig : 0;
    const reedsH = reeds[yr] ? reeds[yr].huur : 0;
    const resE = reserved[yr] ? reserved[yr].eig : 0;
    const resH = reserved[yr] ? reserved[yr].huur : 0;
    const mode = per.mode;
    let poolTotal: number,
      poolUsed: number,
      availE: number | null = null,
      availH: number | null = null,
      reservedTot: number;
    if (mode === 'split') {
      availE = Math.max(c.eig - reedsE - resE, 0);
      availH = Math.max(c.huur - reedsH - resH, 0);
      poolTotal = c.eig + c.huur;
      poolUsed = reedsE + reedsH;
      reservedTot = resE + resH;
    } else {
      poolTotal = c.bundled;
      poolUsed = reedsE + reedsH;
      reservedTot = resE + resH;
    }
    return {
      day: d,
      ts: dayToTs(d),
      year: yr,
      mode,
      reedsE,
      reedsH,
      reservedE: resE,
      reservedH: resH,
      holdTotal,
      toegekendBedrag,
      poolTotal,
      poolUsed,
      reservedTot,
      availE,
      availH,
      beschikbaar: Math.max(poolTotal - poolUsed - reservedTot - holdTotal, 0),
      ingediend: agg.ingediend,
      volledig: agg.volledig,
      nietUitbetaald: agg.nietUitbetaald,
      afgewezenRecht: agg.afgewezenRecht,
      kostenTeLaag: agg.kostenTeLaag,
      inBehandeling: openBehandeling,
      wachtUitbetaling: pendingPayout,
      rfiOpen,
      bedragVolledig,
      bedragNietUitbetaald,
      bedragInBehandeling,
      bedragWacht,
      bedragKostenTeLaag,
      bedragAfgewezen,
      bezwaarOpen: 0,
    };
  }

  for (let d = 0; d < TOTAL_DAYS; d++) {
    const ts = dayToTs(d);
    const per = periode(ts);
    rfiOpen += rfiDelta[d] || 0;

    // 1) appeals resolve today: honour upheld (paid, consumes budget) or dismiss
    for (const a of byAppealResolve[d]) {
      holdTotal -= a.basis;
      if (a.beroepUpheld && a.appealPaid) {
        reeds[a.year][bucketOf(a.type)] += a.basis;
        toegekendBedrag += a.basis;
        bezwaarUitbetaald += a.basis;
        agg.bezwaarToegewezen++;
        a.bezwaarUitkomst = 'toegewezen' as BezwaarUitkomst;
        feed.push(mkEvent(a, d, 'beroep-toegekend', a.basis));
      } else {
        agg.bezwaarAfgewezen++;
        a.bezwaarUitkomst = (
          a.beroepUpheld ? 'toegewezen-onbetaald' : 'afgewezen'
        ) as BezwaarUitkomst;
        feed.push(mkEvent(a, d, 'beroep-afgewezen', 0));
      }
    }

    // 2) submissions: reserve basis
    for (const a of bySubmit[d]) {
      agg.ingediend++;
      openBehandeling++;
      if (a.isRFI) agg.rfiTotaal++;
      reserved[a.year][bucketOf(a.type)] += a.basis;
      bedragInBehandeling += a.basis;
      a.availableBefore = availableInPool(a, d);
    }

    // 3) decisions land: recht + hoogte
    for (const a of byDecision[d]) {
      openBehandeling--;
      bedragInBehandeling -= a.basis;
      if (a.klasse === 'afgewezen') {
        reserved[a.year][bucketOf(a.type)] -= a.basis;
        agg.afgewezenRecht++;
        bedragAfgewezen += a.basis;
        if (a.redenKey) agg.redenen[a.redenKey as keyof typeof agg.redenen]++;
        feed.push(mkEvent(a, d, 'afgewezen', 0));
      } else if (a.klasse === 'geen-hoogte') {
        reserved[a.year][bucketOf(a.type)] -= a.basis;
        agg.rechtToegekend++;
        agg.kostenTeLaag++;
        bedragKostenTeLaag += a.basis;
        feed.push(mkEvent(a, d, 'geen-hoogte', 0));
      } else {
        agg.rechtToegekend++;
        pendingPayout++;
        bedragWacht += a.basis;
      }
    }

    // 3b) appeals filed today: reserve their basis while pending
    for (const a of byAppealFile[d]) {
      holdTotal += a.basis;
      agg.bezwaarIngediend++;
      a.bezwaar = true;
    }

    // 4) payouts resolve (accepted): pay or not (from A1)
    for (const a of byResolve[d]) {
      reserved[a.year][bucketOf(a.type)] -= a.basis;
      pendingPayout--;
      bedragWacht -= a.basis;
      if (a.paid) {
        reeds[a.year][bucketOf(a.type)] += a.basis;
        toegekendBedrag += a.basis;
        bedragVolledig += a.basis;
        agg.volledig++;
        feed.push(mkEvent(a, d, 'volledig', a.basis));
      } else {
        agg.nietUitbetaald++;
        bedragNietUitbetaald += a.basis;
        if (a.isRFI) agg.nietUitbetaaldRFI++;
        feed.push(mkEvent(a, d, 'niet-uitbetaald', 0));
      }
    }

    days.push(snapshotFor(d, per));
  }

  return {
    cfg,
    ceilings,
    days,
    feed,
    apps,
    agg,
    exhaustion,
    toegekendBedrag,
    bezwaarUitbetaald,
    meta: { START, END, TOTAL_DAYS, dayToTs, fmtDate, fmtShort },
  };
}
