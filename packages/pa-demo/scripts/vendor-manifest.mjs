/**
 * The single source of truth for what is vendored.
 *
 * Paths are relative to packages/frontend/src on the origin side and to
 * packages/pa-demo/src/vendor on the copy side, so the two trees mirror each
 * other exactly and a diff needs no path translation.
 *
 * Deliberately absent from THIS LIST (not from disk — see below):
 *   components/PADashboardV2/PASectionRouter.tsx — the only carrier of the six
 *     ../CaseworkerDashboard/* imports, and section curation is what differs
 *     here. Real implementation lives at src/demo/DemoSectionRouter.tsx.
 *   components/PADashboardV2/PADock.tsx — imports McpChatSection, which pulls
 *     in businessApi and would fire real LLM calls from a public page. Real
 *     implementation lives at src/demo/shims/PADock.tsx.
 *   services/keycloak.ts, services/tenant.ts,
 *     components/SessionExpiryWarning.tsx — auth/tenant/session infra with
 *     no place in an unauthenticated demo. Real implementations live at
 *     src/demo/shims/*.
 *
 * All five of the above (plus PASectionRouter) DO have a same-path file
 * physically sitting under src/vendor/ — a one-line re-export "overlay" so
 * the vendored tree's relative imports resolve for both tsc and Vite without
 * an alias and without editing any vendored file. Those overlay files are
 * NOT vendored copies of anything (there is no packages/frontend origin for
 * PADock.tsx or PASectionRouter.tsx under these names, and keycloak.ts /
 * tenant.ts / SessionExpiryWarning.tsx are deliberately never copied), which
 * is why they stay off this list: `vendor:sync` must never overwrite them
 * and `vendor:check` must never flag them as drift. See src/vendor/README.md
 * for the full rationale, including why `paths` in tsconfig.json doesn't
 * apply here and why an ambient-module alternative was rejected.
 */
export const VENDORED_FILES = [
  'index.css',
  'services/pa.api.ts',
  'services/dossierbeheer.api.ts',
  'services/mock-demo.store.ts',
  'pages/PADashboardV2.tsx',
  'pages/ChangelogPanel.tsx',
  'pages/changelog-data.ts',
  'pages/public-affairs-v2/AgendaView.tsx',
  'pages/public-affairs-v2/dashboard-pa.css',
  'pages/public-affairs-v2/dossierbeheer.css',
  'pages/public-affairs-v2/dossierbeheer.data.ts',
  'pages/public-affairs-v2/FeitenCijfers.tsx',
  'pages/public-affairs-v2/feiten.data.ts',
  'pages/public-affairs-v2/Issuekaart.tsx',
  'pages/public-affairs-v2/Kompas.tsx',
  'pages/public-affairs-v2/modes.config.ts',
  'pages/public-affairs-v2/Monitoring.tsx',
  'pages/public-affairs-v2/NotificationsPanel.tsx',
  'pages/public-affairs-v2/PaDataProvider.tsx',
  'pages/public-affairs-v2/pa.data.ts',
  'pages/public-affairs-v2/Vandaag.tsx',
  'pages/public-affairs-v2/Voortgang.tsx',
  'components/PADashboardV2/BronnenSection.tsx',
  'components/PADashboardV2/CuratiePijplijnFlow.tsx',
  'components/PADashboardV2/CuratieSpecSection.tsx',
  'components/PADashboardV2/KompasSpecSection.tsx',
  'components/PADashboardV2/NotificatiesSection.tsx',
  'components/PADashboardV2/PACommandPalette.tsx',
  'components/PADashboardV2/PANoAccessPanel.tsx',
  'components/PADashboardV2/WatchBell.tsx',
  'components/PADashboardV2/ZoekcriteriaSection.tsx',
  'components/PADashboardV2/dossierbeheer/ArchiveDialog.tsx',
  'components/PADashboardV2/dossierbeheer/DeleteDialog.tsx',
  'components/PADashboardV2/dossierbeheer/Dossierbeheer.tsx',
  'components/PADashboardV2/dossierbeheer/DossierEditor.tsx',
  'components/PADashboardV2/dossierbeheer/DossierRow.tsx',
  'components/PADashboardV2/dossierbeheer/KompasScorer.tsx',
  'components/PADashboardV2/dossierbeheer/MdEditor.tsx',
  'components/PADashboardV2/dossierbeheer/TemplateGallery.tsx',
];

export const ORIGIN_ROOT = '../frontend/src';
export const VENDOR_ROOT = './src/vendor';

/**
 * A second vendored root: static assets from packages/frontend/public that
 * a vendored src/ file references by a hard-coded absolute path rather than
 * an import — so a file-by-file manifest walked from src/ (above) can never
 * discover them by following imports. FeitenCijfers.tsx (vendored) sets
 * `ICON_BASE = '/pa/feiten-icons/'` and reads tenants.json via `fetch`
 * (services/tenant.ts, not vendored, but src/demo/shims/tenant.ts bakes its
 * Flevoland theme values from this same file — see that shim's header).
 *
 * Deliberately absent from THIS LIST: timeline-config.json. It exists in
 * packages/frontend/public but is fetched only by packages/frontend/src/
 * pages/Dashboard.tsx (`fetch('/timeline-config.json')`), which is not part
 * of the PA Cockpit and has no vendored counterpart here — nothing in
 * pa-demo ever requests it. Confirmed by grepping packages/frontend/src for
 * 'timeline-config': Dashboard.tsx is the only hit. Vendoring it anyway
 * "just in case" would be exactly the one-off, undiscoverable copy this
 * second root exists to avoid needing.
 *
 * staticwebapp.config.json also lives in packages/frontend/public but is
 * NOT listed here either — pa-demo owns its own copy at packages/pa-demo/
 * public/staticwebapp.config.json (a different CSP: no Keycloak/API origins
 * to allow), so it is deliberately never synced from frontend's.
 */
export const ASSET_FILES = [
  'pa/feiten-icons/bredewelvaart.png',
  'pa/feiten-icons/economischprogramma.png',
  'pa/feiten-icons/inwonerspeiling.png',
  'pa/feiten-icons/kennishub.png',
  'pa/feiten-icons/klimaatenenergie.png',
  'pa/feiten-icons/landschap.png',
  'pa/feiten-icons/mobiliteitenruimte.png',
  'pa/feiten-icons/omgevingsvisie.png',
  'pa/feiten-icons/positievegezondheid.png',
  'pa/feiten-icons/regionaleenergiestrategie.png',
  'pa/feiten-icons/voorzieningenmonitor.png',
  'pa/feiten-icons/waterprogramma.png',
  'pa/feiten-icons/werkgelegenheidsonderzoek.png',
  'pa/feiten-icons/wonen.png',
  'tenants.json',
];

export const ASSET_ORIGIN_ROOT = '../frontend/public';
export const ASSET_VENDOR_ROOT = './public';
