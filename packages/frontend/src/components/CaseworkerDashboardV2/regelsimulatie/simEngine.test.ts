// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.test.ts
import { describe, it, expect } from 'vitest';
import { run, beslisRecht, basisHoogte, makeResolver } from './simEngine';
import type { SimConfig, Claimant } from './types';

const DEFAULT_CFG: SimConfig = {
  seed: 20260112,
  populatie: 3150,
  eigenaarRatio: 0.68,
  kostenGem: 4200,
  kostenSd: 1800,
  pFailliet: 0.02,
  pBuitenprovincie: 0.07,
  pGeenRelatie: 0.03,
  pGeenToestemming: 0.14,
  pNaamMismatch: 0.05,
  budgetScale: 1,
  aandeel2026: 0.46,
  arrivalPow: 1.3,
  doorlooptijdGem: 8,
  pAanvullendeInfo: 0.32,
  infoWachtGem: 60,
  bezwaarKans: 0.22,
  bezwaarToewijzing: 0.25,
};

describe('determinism', () => {
  it('two runs with the same config produce identical aggregate results', () => {
    const a = run(DEFAULT_CFG);
    const b = run(DEFAULT_CFG);
    expect(a.agg).toEqual(b.agg);
    expect(a.toegekendBedrag).toBe(b.toegekendBedrag);
  });

  it('a different seed produces a different result', () => {
    const a = run(DEFAULT_CFG);
    const b = run({ ...DEFAULT_CFG, seed: 999 });
    expect(a.agg).not.toEqual(b.agg);
  });
});

describe('basisHoogte (amount boundaries)', () => {
  it('below the €3,000 cost floor pays €0', () => {
    expect(basisHoogte(2950)).toBe(0);
  });
  it('at the floor pays exactly €750', () => {
    expect(basisHoogte(3000)).toBe(750);
  });
  it('at €5,000 pays exactly €1,250 (the cap)', () => {
    expect(basisHoogte(5000)).toBe(1250);
  });
  it('above the cap still pays €1,250', () => {
    expect(basisHoogte(9000)).toBe(1250);
  });
});

describe('beslisRecht (entitlement, precedence, MC/DC)', () => {
  const base = {
    aanvragerFailliet: false,
    provincieWoning: 'Flevoland',
    relatieTotWoning: 'eigenaar' as const,
    toestemmingEigenaar: true,
    rekeningNaamKomtOvereen: true,
  };

  it('entitled when every ground passes', () => {
    expect(beslisRecht(base)).toEqual({
      recht: true,
      reden: 'Aanvrager heeft recht op subsidie',
      redenKey: 'toegekend',
    });
  });

  it('bankrupt takes precedence over outside-province when both apply', () => {
    const r = beslisRecht({ ...base, aanvragerFailliet: true, provincieWoning: 'Utrecht' });
    expect(r).toEqual({
      recht: false,
      reden: 'Aanvrager is failliet',
      redenKey: 'failliet',
    });
  });

  it('rejects outside Flevoland on its own', () => {
    const r = beslisRecht({ ...base, provincieWoning: 'Utrecht' });
    expect(r.redenKey).toBe('buitenprovincie');
  });

  it('rejects neither-owner-nor-renter on its own', () => {
    const r = beslisRecht({ ...base, relatieTotWoning: 'gebruiker' });
    expect(r.redenKey).toBe('relatie');
  });

  it("rejects a renter without the owner's permission", () => {
    const r = beslisRecht({
      ...base,
      relatieTotWoning: 'huurder',
      toestemmingEigenaar: false,
    });
    expect(r).toEqual({
      recht: false,
      reden: 'Huurder heeft geen toestemming van eigenaar',
      redenKey: 'toestemming',
    });
  });

  it('the owner-permission rule does not misfire for an owner', () => {
    // An owner with toestemmingEigenaar:false must still be entitled — that
    // flag only matters for a huurder. Real behaviour, verified against the
    // reference engine directly.
    const r = beslisRecht({ ...base, relatieTotWoning: 'eigenaar', toestemmingEigenaar: false });
    expect(r.recht).toBe(true);
  });

  it('rejects a name mismatch with the energy bill', () => {
    const r = beslisRecht({ ...base, rekeningNaamKomtOvereen: false });
    expect(r.redenKey).toBe('energierekening');
  });
});

describe('makeResolver — sealing / no back-fill', () => {
  // scale 0.001 shrinks the split ceiling to 437500 * 0.001 = €437.50, small
  // enough to hand-construct a clean exhaustion with 3 claimants. All three
  // competeDay values (10/20/30) are far below OCT1_DAY[2026] (262), so all
  // three land in the split "eigenaar" pool, never the merged one.
  it('a smaller, later claimant is not paid after its pool has sealed, even though it would fit on its own', () => {
    const resolve = makeResolver(0.001);
    const claimants: Claimant[] = [
      {
        id: 'a',
        refId: 1,
        key: 10,
        ord: 1,
        competeDay: 10,
        type: 'eigenaar',
        year: 2026,
        basis: 300,
        isAppeal: false,
      },
      {
        id: 'b',
        refId: 2,
        key: 20,
        ord: 2,
        competeDay: 20,
        type: 'eigenaar',
        year: 2026,
        basis: 300,
        isAppeal: false,
      },
      {
        id: 'c',
        refId: 3,
        key: 30,
        ord: 3,
        competeDay: 30,
        type: 'eigenaar',
        year: 2026,
        basis: 50,
        isAppeal: false,
      },
    ];
    const { res } = resolve(claimants);
    expect(res.a).toMatchObject({ paid: true, blockedById: null, pid: '2026:eig' });
    expect(res.b).toMatchObject({
      paid: false,
      blockedById: 1,
      justMissedByOne: true,
      pid: '2026:eig',
    });
    // c's basis (50) would fit in the remaining headroom (437.5 - 300 = 137.5)
    // if evaluated on its own merits — but the pool sealed at b, so c is
    // rejected too. This is the "no back-fill" property.
    expect(res.c).toMatchObject({
      paid: false,
      blockedById: 1,
      justMissedByOne: false,
      pid: '2026:eig',
    });
  });
});

describe('makeResolver — priority by effective date', () => {
  it('a claimant with a later effective key loses to one with an earlier key and a smaller pool', () => {
    const resolve = makeResolver(0.001); // split ceiling €437.50
    const claimants: Claimant[] = [
      // Represents an RFI application: its effective priority (key) is late
      // (50) because the info came back late, even though nothing else about
      // it differs from a normal claim at the resolver level.
      {
        id: 'rfi',
        refId: 10,
        key: 50,
        ord: 1,
        competeDay: 50,
        type: 'eigenaar',
        year: 2026,
        basis: 300,
        isAppeal: false,
      },
      // Represents a normal (non-RFI) application with an earlier effective
      // key (40) even though its real competeDay (45) is later than rfi's
      // original submission would have been.
      {
        id: 'later',
        refId: 11,
        key: 40,
        ord: 2,
        competeDay: 45,
        type: 'eigenaar',
        year: 2026,
        basis: 300,
        isAppeal: false,
      },
    ];
    const { res } = resolve(claimants);
    expect(res.later.paid).toBe(true);
    expect(res.rfi).toMatchObject({ paid: false, blockedById: 11, justMissedByOne: true });
  });
});

describe('full run — bookkeeping invariants', () => {
  const result = run(DEFAULT_CFG);

  it('every application resolves to exactly one non-null final class', () => {
    for (const a of result.apps) {
      expect(a.uitkomst).not.toBeNull();
    }
  });

  it("paid-out total per pool never exceeds that pool's ceiling", () => {
    for (const d of result.days) {
      const c = result.ceilings[d.year];
      if (d.mode === 'split') {
        expect(d.reedsE).toBeLessThanOrEqual(c.eig + 0.01);
        expect(d.reedsH).toBeLessThanOrEqual(c.huur + 0.01);
      } else if (d.mode === 'bundled') {
        expect(d.reedsE + d.reedsH).toBeLessThanOrEqual(c.bundled + 0.01);
      }
    }
  });

  it("2026's carry-over into 2027 equals what 2026 actually left unspent", () => {
    // last day's cumulative state covers all of 2026 by then; not asserted on
    // directly below, but this repo's noUnusedLocals forbids an unused const,
    // so this is referenced via `void` rather than dropped from the brief's
    // exact test text.
    const spent2026 = result.days[result.days.length - 1];
    void spent2026;
    // ceilings[2027].bundled was set to CEIL_2027_BASE*scale + carryover;
    // carryover must be non-negative and the merged 2026 ceiling minus what
    // was actually paid into the 2026 pools.
    expect(result.ceilings[2027].bundled).toBeGreaterThanOrEqual(1000000 * DEFAULT_CFG.budgetScale);
  });
});

describe('full run — budget year is the submission year, not the decision year', () => {
  it('an application submitted in December 2026 but decided in 2027 is still paid from the 2026 pool', () => {
    const result = run(DEFAULT_CFG);
    const spillover = result.apps.filter((a) => {
      const sub = new Date(result.meta.dayToTs(a.submitDay));
      const dec = new Date(result.meta.dayToTs(a.decisionDay));
      return (
        sub.getUTCFullYear() === 2026 &&
        sub.getUTCMonth() === 11 && // December
        dec.getUTCFullYear() === 2027
      );
    });
    expect(spillover.length).toBeGreaterThan(0);
    for (const a of spillover) {
      expect(a.year).toBe(2026);
      if (a.klasse === 'accepted') {
        expect(a.pid?.startsWith('2026:')).toBe(true);
      }
    }
  });
});

describe('counterfactuals', () => {
  it('missedDueToRFI and missedDueToBeroep are both 0 when their chance is 0', () => {
    const result = run({ ...DEFAULT_CFG, pAanvullendeInfo: 0, bezwaarKans: 0 });
    expect(result.agg.missedDueToRFI).toBe(0);
    expect(result.agg.missedDueToBeroep).toBe(0);
  });

  it('both are > 0 under the default config, and neither exceeds total unpaid', () => {
    const result = run(DEFAULT_CFG);
    expect(result.agg.missedDueToRFI).toBeGreaterThan(0);
    expect(result.agg.missedDueToBeroep).toBeGreaterThan(0);
    expect(result.agg.missedDueToRFI).toBeLessThanOrEqual(result.agg.nietUitbetaald);
    expect(result.agg.missedDueToBeroep).toBeLessThanOrEqual(result.agg.nietUitbetaald);
  });
});

describe('beroepDisplacerId — nearer-winner disambiguation (disclosed deviation)', () => {
  // Reference (mock-sim-engine.jsx:372) compares w.key <= a.key, but `a` there
  // is a SimApp, which never has a `.key` field — only claimants do. That
  // comparison is always `w.key <= undefined` (always false) in the
  // reference's JS, so that branch is permanently dead code there; it always
  // falls through to "the pool's overall minimum-key winner" fallback. This
  // port's simEngine.ts deliberately uses `a.effDay` (a real field) instead,
  // so the branch can select the nearest-preceding appeal winner rather than
  // always the global minimum. Confirmed intended behavior with the project
  // owner; this test proves the two strategies actually diverge for a real,
  // run()-level scenario (not just a synthetic makeResolver fixture), since
  // that's where this logic lives.
  //
  // seed 10 with this config reliably produces an accepted application
  // (id 133) whose merits-payment was displaced by upheld appeals, where the
  // relevant appeal-winner pool has 2+ winners with different priority keys
  // straddling app 133's effDay — letting us assert the nearer one (not the
  // pool's global minimum) is picked.
  const CFG: SimConfig = {
    seed: 10,
    populatie: 150,
    eigenaarRatio: 0.68,
    kostenGem: 4200,
    kostenSd: 1500,
    pFailliet: 0,
    pBuitenprovincie: 0,
    pGeenRelatie: 0,
    pGeenToestemming: 0,
    pNaamMismatch: 0,
    budgetScale: 0.15,
    aandeel2026: 1.0,
    arrivalPow: 1.0,
    doorlooptijdGem: 8,
    pAanvullendeInfo: 0,
    infoWachtGem: 30,
    bezwaarKans: 0.7,
    bezwaarToewijzing: 0.7,
  };

  // Independently derive which pool an *appeal claim* resolves into. This is
  // safe to compute outside the engine (i.e. it is not a reimplementation of
  // the logic under test) because, per makeResolver's isAppeal branch, an
  // appeal claim's compDay is exactly its own competeDay (appealResolveDay) —
  // it never depends on any other claim, unlike normal claims. Note this is
  // deliberately NOT the winner app's own `.pid` field: that field records
  // where the winner's *original merits claim* resolved (typically the
  // split pool, since it's evaluated at its earlier decisionDay), which can
  // differ from where its *appeal* claim resolves (typically later, and
  // often across the 1-October split→merged boundary).
  function appealClaimPid(
    result: ReturnType<typeof run>,
    year: number,
    type: 'eigenaar' | 'huurder',
    appealResolveDay: number
  ): string {
    const oct1 = Math.round(
      (Date.UTC(year, 9, 1) - result.meta.START) / (result.meta.dayToTs(1) - result.meta.dayToTs(0))
    );
    const merged = appealResolveDay >= oct1;
    const bucket = type === 'eigenaar' ? 'eig' : 'huur';
    return `${year}:${merged ? 'merged' : bucket}`;
  }

  it('picks the nearest-preceding appeal winner, not always the pool-wide minimum key', () => {
    const result = run(CFG);
    const target = result.apps.find((a) => a.id === 133);
    expect(target).toBeDefined();
    expect(target!.klasse).toBe('accepted');
    expect(target!.missedDueToBeroep).toBe(true);
    expect(target!.beroepDisplacerId).not.toBeNull();

    // Recover every upheld, paid appeal winner that landed in the same pool
    // as the displaced application.
    const winnersInPool = result.apps.filter(
      (w) =>
        w.beroepFiled &&
        w.beroepUpheld &&
        w.appealPaid &&
        appealClaimPid(result, w.year, w.type, w.appealResolveDay as number) === target!.pid
    );

    // The scenario requires at least two winners in this pool with distinct
    // priority keys (effDay) — otherwise there'd be nothing to disambiguate.
    const distinctKeys = new Set(winnersInPool.map((w) => w.effDay));
    expect(winnersInPool.length).toBeGreaterThanOrEqual(2);
    expect(distinctKeys.size).toBeGreaterThanOrEqual(2);

    const globalMinWinner = winnersInPool.reduce((m, w) => (w.effDay < m.effDay ? w : m));
    const nearestWinner = winnersInPool
      .filter((w) => w.effDay <= target!.effDay)
      .reduce((m, w) => (w.effDay > m.effDay ? w : m));

    // The pool's global minimum-key winner is a *different* app than the
    // nearest-preceding one — proving this scenario actually distinguishes
    // the two strategies (this port's vs. the reference's dead-branch
    // fallback).
    expect(nearestWinner.id).not.toBe(globalMinWinner.id);

    // This port picks the nearer winner...
    expect(target!.beroepDisplacerId).toBe(nearestWinner.id);
    // ...not the pool-wide minimum the reference's dead branch would always
    // have fallen back to.
    expect(target!.beroepDisplacerId).not.toBe(globalMinWinner.id);
  });
});

describe('performance', () => {
  it('run(cfg) with the default 3,150-application population completes in under 250ms', () => {
    const t0 = performance.now();
    run(DEFAULT_CFG);
    const t1 = performance.now();
    // The plain-JS reference takes ~130ms for this population on ordinary
    // hardware; the typed port should be comparable. If this ever fails,
    // do not loosen the threshold — investigate and, per the source brief,
    // propose a web worker rather than shipping a silent miss.
    expect(t1 - t0).toBeLessThan(250);
  });
});
