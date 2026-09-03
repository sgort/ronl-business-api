/**
 * Combines mock and live per-phase instance counts into a single figure
 * per metric, with the live subset kept alongside for annotation — the
 * same pattern as Portfolio's "23 projecten · 5 actieve instanties"
 * header and LIVE badge. See
 * docs/superpowers/specs/2026-08-10-rip-beheer-faseladder-overview-design.md.
 */
import type { RipPhase } from './rip-phases.catalog';

export interface PhaseCounts {
  wip: number;
  gereed: number;
}

export interface AnnotatedPhaseCounts extends PhaseCounts {
  liveWip: number;
  liveGereed: number;
}

const EMPTY: PhaseCounts = { wip: 0, gereed: 0 };

/**
 * klaar[N] = max(0, gereed[prev] - wip[N] - gereed[N]) — projects that
 * finished the preceding phase but haven't reached this one yet. The first
 * phase in ladder order has no predecessor, so it's always undefined
 * (render "—", not 0 — there's nothing to be ready *for*).
 *
 * Undefined too when the predecessor has `multipleExits`. The subtraction
 * assumes finishing a phase means advancing to the next one, which holds
 * everywhere except after R5.3: three of its four end events return to R5.2,
 * so its `gereed` mixes four outcomes and one project can complete it twice.
 * Deriving a number from that would overstate R5.4's candidates in a way
 * nothing on screen could reveal, so it reports "—" instead. Counting only
 * the R5.4-bound exit is the real fix and needs the counts endpoint, which
 * returns a flat { wip, gereed } per phase today.
 */
export function getKlaarCounts(
  phases: RipPhase[],
  counts: Record<string, PhaseCounts>
): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  phases.forEach((phase, i) => {
    // Every phase is modelled, so the predecessor is simply the preceding
    // entry -- matching previousModelledPhase in the catalogue.
    const p = i - 1;
    if (p < 0 || phases[p].multipleExits) {
      out[phase.code] = undefined;
      return;
    }
    const prev = counts[phases[p].code] ?? EMPTY;
    const cur = counts[phase.code] ?? EMPTY;
    out[phase.code] = Math.max(0, prev.gereed - cur.wip - cur.gereed);
  });
  return out;
}

/** Sums mock + live per phase; keeps the live figures alongside for the
 *  "· N live" annotation shown next to each combined number. */
export function combinePhaseCounts(
  mock: Record<string, PhaseCounts>,
  live: Record<string, PhaseCounts>
): Record<string, AnnotatedPhaseCounts> {
  const codes = new Set([...Object.keys(mock), ...Object.keys(live)]);
  const out: Record<string, AnnotatedPhaseCounts> = {};
  for (const code of codes) {
    const m = mock[code] ?? EMPTY;
    const l = live[code] ?? EMPTY;
    out[code] = {
      wip: m.wip + l.wip,
      gereed: m.gereed + l.gereed,
      liveWip: l.wip,
      liveGereed: l.gereed,
    };
  }
  return out;
}

/** The backend keys its response by processDefinitionKey (an engine
 *  fact); the UI keys everything else by phase code. Remaps one to the
 *  other. */
export function normalizeLiveCounts(
  raw: Record<string, { wip: number; gereed: number }>,
  phases: RipPhase[]
): Record<string, PhaseCounts> {
  const out: Record<string, PhaseCounts> = {};
  for (const phase of phases) {
    if (!phase.processDefinitionKey) continue;
    const c = raw[phase.processDefinitionKey];
    if (c) out[phase.code] = { wip: c.wip, gereed: c.gereed };
  }
  return out;
}
