/**
 * The package's public surface. Everything a host needs and nothing it does not
 * — notably not __resetPaCockpitHostForTests, and not the internal
 * components, which are reached only through the shell or through
 * PaSectionsRouter.
 *
 * `PaSectionsRouter` is the one exception to "internal components stay
 * internal": PADashboardV2 renders no section content itself — it
 * unconditionally delegates to the host's `SectionRouter` (see
 * PaSectionRouterProps) — so a host cannot dispatch to Vandaag, Issuekaart,
 * Monitoring, the package's own "beheer" panels, etc. without something to
 * call. Exporting the fourteen components individually and asking every
 * host to hand-write the same MONITORING_IDS/VOORTGANG_IDS/db-* dispatch
 * logic was tried and reverted — that grammar is package knowledge, not
 * host knowledge, and hand-maintaining it per host was exactly the vendored
 * fork's most-duplicated behaviour, just formalised. PaSectionsRouter is
 * that grammar, written once; see its own file header for the composition
 * contract a host must follow (its own ids checked first, this component as
 * the unconditional tail).
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

/**
 * The dossier permission model, as data.
 *
 * `deriveDossierRole` is what packages/pa-demo's role switch runs its
 * synthetic Keycloak roles through, so its demo cannot drift from real
 * behaviour. `DB_ROLES` / `DB_CAPS` are the same two tables Dossierbeheer's
 * own (disabled, reflective) role bar renders, and pa-demo's demo-owned
 * "Beheer › Rollen & rechten" page is built on them rather than on a
 * hand-written copy — for exactly that reason: a second table of the same
 * facts is a fork waiting to happen, which is the thing this whole package
 * exists to stop.
 */
export { deriveDossierRole, DB_ROLES, DB_CAPS } from './pages/public-affairs-v2/dossierbeheer.data';
export type { DossierRole } from './pages/public-affairs-v2/dossierbeheer.data';

/**
 * Whether the cockpit's services are in mock mode.
 *
 * Exported for a host that has to *guarantee* it, not merely set it:
 * packages/pa-demo is a public, backend-less deployment whose entire safety
 * story is "no request ever leaves the page", and this flag is what every
 * service in `services/pa.api.ts` branches on. Its src/mock-lock.test.ts
 * asserts the flag through this export after its own boot-time
 * `forceMockMode()`, so the guarantee is tested against the real predicate
 * rather than against a restatement of it. Deliberately read-only — the
 * matching `setPaMock` stays internal, because a host does not need a second
 * way to turn mocking off.
 */
export { isPaMock } from './services/pa.api';

export { default as PaSectionsRouter } from './components/PADashboardV2/PaSectionsRouter';
