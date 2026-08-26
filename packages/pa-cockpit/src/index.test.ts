import { describe, expect, it } from 'vitest';
import * as pkg from './index';

/**
 * Pins the package's public surface to an explicit list.
 *
 * Nothing was watching this before: eighteen names were added to the public
 * surface in one pass (Task 9) and reverted to one (PaSectionsRouter) in the
 * next, with no test noticing either change. The next widening should be a
 * failing assertion someone has to update on purpose, not a silent diff.
 *
 * Values and types are both listed, even though only values are runtime-
 * visible via `Object.keys` — the type-only names document the full
 * contract for a human reading this file; only the value names are what the
 * assertion below actually checks.
 */
const EXPECTED_VALUE_EXPORTS = [
  'PADashboardV2',
  'configurePaCockpit',
  'getPaCockpitAuth',
  'getPaCockpitTenant',
  'PA_MODES',
  'SORT_SECTION_IDS',
  'isPaItemVisible',
  'deriveDossierRole',
  'PaSectionsRouter',
].sort();

/**
 * Type-only exports for reference — not checked below (types are erased at
 * build and never appear in `Object.keys`), but kept here so this file
 * doubles as the one place that lists the package's entire public contract.
 */
const _TYPE_ONLY_EXPORTS_FOR_REFERENCE = [
  'PaCockpitHost',
  'PaSectionRouterProps',
  'PaDockProps',
  'PaChangelogPanelProps',
  'PaCockpitAuth',
  'PaCockpitTenant',
  'PaCockpitServices',
  'PaTenantConfig',
  'PaModeId',
  'PaModeConfig',
  'PaRailItem',
  'PaRailGroup',
  'PaGateContext',
  'OrgTypeGate',
  'DossierRole',
];
void _TYPE_ONLY_EXPORTS_FOR_REFERENCE;

describe('the package public surface (src/index.ts)', () => {
  it('exports exactly the expected value names, no more, no fewer', () => {
    expect(Object.keys(pkg).sort()).toEqual(EXPECTED_VALUE_EXPORTS);
  });
});
