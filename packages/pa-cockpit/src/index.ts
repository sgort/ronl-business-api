/**
 * The package's public surface. Everything a host needs and nothing it does not
 * — notably not __resetPaCockpitHostForTests.
 *
 * Two different kinds of "internal component" live under src/, and they are
 * NOT treated the same:
 *
 *  - Shell-internals (PACommandPalette, PANoAccessPanel, NotificationsPanel,
 *    WatchBell, CuratiePijplijnFlow, ...) are rendered directly by
 *    PADashboardV2 itself and never by a host. Those stay unexported, reached
 *    only through the shell.
 *  - Section-content building blocks (Vandaag, Issuekaart, Monitoring,
 *    AgendaView, Voortgang, FeitenView, the "beheer" panels, Dossierbeheer,
 *    and the usePaData()/MONITORING_TABS data they need) are the opposite:
 *    PADashboardV2 renders NONE of them — it unconditionally delegates all
 *    section content to the host's `SectionRouter` (see PaSectionRouterProps).
 *    A host's SectionRouter (packages/frontend's PASectionRouter.tsx,
 *    packages/pa-demo's DemoSectionRouter.tsx) is what dispatches
 *    `sectionId` to one of these, so they must be exported for a host to
 *    build one at all. Exporting them does not reopen the modes bypass this
 *    file used to warn about below (that bypass is about the *rail/palette*
 *    seeing sections a host tried to hide, not about the section renderers
 *    themselves being reusable).
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

/**
 * Section-content building blocks. A host's SectionRouter composes these
 * (plus its own host-specific sections, e.g. packages/frontend's Profiel,
 * Rollen and IOU panels) into the full `sectionId` dispatch PADashboardV2
 * requires. See the file header for why these are exported at all.
 */
export { default as Vandaag } from './pages/public-affairs-v2/Vandaag';
export type { Prioritering } from './pages/public-affairs-v2/Vandaag';
export { default as Issuekaart } from './pages/public-affairs-v2/Issuekaart';
export { default as Monitoring } from './pages/public-affairs-v2/Monitoring';
export { default as AgendaView } from './pages/public-affairs-v2/AgendaView';
export { default as Voortgang } from './pages/public-affairs-v2/Voortgang';
export type { VoortgangView } from './pages/public-affairs-v2/Voortgang';
export type { KompasViz } from './pages/public-affairs-v2/Kompas';
export { MONITORING_TABS } from './pages/public-affairs-v2/pa.data';
export type { MonitoringTabId } from './pages/public-affairs-v2/pa.data';
export { usePaData } from './pages/public-affairs-v2/PaDataProvider';
export { FeitenView } from './pages/public-affairs-v2/FeitenCijfers';

export { default as KompasSpecSection } from './components/PADashboardV2/KompasSpecSection';
export { default as CuratieSpecSection } from './components/PADashboardV2/CuratieSpecSection';
export { default as NotificatiesSection } from './components/PADashboardV2/NotificatiesSection';
export { default as ZoekcriteriaSection } from './components/PADashboardV2/ZoekcriteriaSection';
export { default as BronnenSection } from './components/PADashboardV2/BronnenSection';
export { default as Dossierbeheer } from './components/PADashboardV2/dossierbeheer/Dossierbeheer';
