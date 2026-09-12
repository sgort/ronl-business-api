// The reference simulation config, shared by simEngine.test.ts (correctness)
// and simEngine.perf.test.ts (the wall-clock budget). Per this repo's testing
// convention, a fixture moves into __helpers__ at the point a second file in
// the directory needs it — which the perf split is.
//
// The 3,150-application population is what the 250ms budget in
// simEngine.perf.test.ts is stated against; changing `populatie` invalidates
// that threshold.
import type { SimConfig } from '../types';

export const DEFAULT_CFG: SimConfig = {
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
