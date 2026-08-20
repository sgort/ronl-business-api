// packages/frontend/src/components/CaseworkerDashboardV2/regelsimulatie/simEngine.perf.test.ts
//
// The engine's wall-clock budget, kept out of the default `npm test` run.
//
// This assertion measures a machine as much as it measures run(). Inside the
// main suite Vitest saturates every core with 130 parallel test files, and a
// single timed call was observed at 302ms, then 837ms, then 1297ms on a host
// contended by an unrelated process starting; even the fastest of three CPU-time
// samples came out at 468ms under a full run. None of that says anything about
// run() — but all of it turns the suite red, and it would have made the CI test
// gate unusable.
//
// So the budget moved rather than moved up. `vite.config.ts` excludes
// `src/**/*.perf.test.ts` from the default run and `npm run test:perf` executes
// these specs with file parallelism disabled, as its own blocking CI step. The
// 250ms threshold is unchanged and still gates a deploy — it is simply no longer
// asked to hold while 129 other files fight it for the CPU.
import { describe, it, expect } from 'vitest';
import { run } from './simEngine';
import { DEFAULT_CFG } from './__helpers__/defaultCfg';

describe('performance', () => {
  it('run(cfg) with the default 3,150-application population completes in under 250ms', () => {
    // The plain-JS reference takes ~130ms for this population on ordinary
    // hardware; the typed port should be comparable. If this ever fails,
    // do not loosen the threshold — investigate and, per the source brief,
    // propose a web worker rather than shipping a silent miss.
    //
    // A warm-up run lets the JIT settle so the first sample is not charged for
    // compilation the later ones skip, and the fastest of several samples
    // discards any GC pause that happens to land mid-sample.
    const SAMPLES = 3;

    run(DEFAULT_CFG); // warm-up, not measured

    let fastestMs = Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      run(DEFAULT_CFG);
      const t1 = performance.now();
      fastestMs = Math.min(fastestMs, t1 - t0);
    }

    expect(fastestMs).toBeLessThan(250);
  });
});
