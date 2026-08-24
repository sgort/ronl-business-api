/**
 * The single source of truth for what is vendored.
 *
 * Paths are relative to packages/frontend/src on the origin side and to
 * packages/pa-demo/src/vendor on the copy side, so the two trees mirror each
 * other exactly and a diff needs no path translation.
 *
 * Deliberately absent:
 *   components/PADashboardV2/PASectionRouter.tsx — the only carrier of the six
 *     ../CaseworkerDashboard/* imports, and section curation is what differs
 *     here. Replaced by src/demo/DemoSectionRouter.tsx.
 *   components/PADashboardV2/PADock.tsx — imports McpChatSection, which pulls
 *     in businessApi and would fire real LLM calls from a public page.
 *     Replaced by src/demo/shims/PADock.tsx.
 */
export const VENDORED_FILES = [
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
