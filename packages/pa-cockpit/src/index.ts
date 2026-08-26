/**
 * The package's public surface. Everything a host needs and nothing it does not
 * — notably not __resetPaCockpitHostForTests, and not the internal components,
 * which are reached only through the shell.
 *
 * Deliberately absent: `allStaticSections` and `findPaModeForSection`. Neither
 * host calls them — packages/frontend passes PA_MODES straight through and
 * packages/pa-demo passes buildAllowedModes(PA_MODES) — and both operate on the
 * unfiltered PA_MODES, so re-exporting them here would hand a host a second,
 * unguarded door onto the full section list. src/modes/no-module-scope-modes.test.ts
 * exists to keep that door shut inside the package; opening it at the package
 * boundary for a use case nobody has would defeat the point. A host that needs
 * either one gets it from usePaModes(), narrowed to the modes it supplied.
 */
export { default as PADashboardV2 } from './pages/PADashboardV2';
export type {
  PaCockpitHost,
  PaSectionRouterProps,
  PaDockProps,
  PaChangelogPanelProps,
} from './pages/PADashboardV2';

export { configurePaCockpit, getPaCockpitAuth, getPaCockpitTenant } from './host';
export type { PaCockpitAuth, PaCockpitTenant, PaCockpitServices, PaTenantConfig } from './host';

export {
  PA_MODES,
  SORT_SECTION_IDS,
  isPaItemVisible,
} from './pages/public-affairs-v2/modes.config';
export type {
  PaModeId,
  PaModeConfig,
  PaRailItem,
  PaRailGroup,
  PaGateContext,
  OrgTypeGate,
} from './pages/public-affairs-v2/modes.config';

export { deriveDossierRole } from './pages/public-affairs-v2/dossierbeheer.data';
export type { DossierRole } from './pages/public-affairs-v2/dossierbeheer.data';
