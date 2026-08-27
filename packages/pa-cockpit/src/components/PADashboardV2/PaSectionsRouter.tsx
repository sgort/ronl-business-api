/**
 * PaSectionsRouter — dispatches `sectionId` to the cockpit's package-owned
 * screens.
 *
 * This grammar used to be duplicated, verbatim, in every host this package
 * has had: packages/frontend's PASectionRouter.tsx and packages/pa-demo's
 * vendored PASectionRouter.tsx / DemoSectionRouter.tsx all carried identical
 * MONITORING_IDS / VOORTGANG_IDS / "beheer" `Set`s and an identical
 * db-overzicht/db-nieuw key-remount branch. That is package knowledge about
 * the package's own section ids, not host knowledge — hand-maintained by
 * every host was exactly the vendored fork's most-duplicated behaviour,
 * just formalised. Written once, here, instead.
 *
 * A host composes its own `SectionRouter` around this as the LAST resort,
 * not the first — see packages/frontend/src/components/PADashboardV2/PASectionRouter.tsx
 * for the shape: check the host's own exclusive ids first (frontend's are
 * Profiel, Rollen, the four IOU sections and Gereedschap), and fall through
 * to `<PaSectionsRouter .../>` only once none of them match.
 *
 * That order is load-bearing, not a style choice. This component's terminal
 * branch is the pre-existing "which dossier is this?" fallthrough: any id
 * it does not recognise as one of its own static sections is assumed to be
 * a dossier id, rendering Issuekaart when found and a "this dossier is no
 * longer available" placeholder when not — unconditionally, exactly as the
 * pre-extraction monolith always did (neither original router ever returned
 * null from that branch). Calling this component FIRST would send a host id
 * like 'profiel' straight into that placeholder instead of ever reaching
 * the host's own switch, because this component has no way to know
 * 'profiel' is somebody else's business until the host has already ruled
 * out everything of its own.
 */

import Vandaag from '../../pages/public-affairs-v2/Vandaag';
import Issuekaart from '../../pages/public-affairs-v2/Issuekaart';
import Monitoring from '../../pages/public-affairs-v2/Monitoring';
import AgendaView from '../../pages/public-affairs-v2/AgendaView';
import Voortgang, { type VoortgangView } from '../../pages/public-affairs-v2/Voortgang';
import { MONITORING_TABS, type MonitoringTabId } from '../../pages/public-affairs-v2/pa.data';
import { usePaData } from '../../pages/public-affairs-v2/PaDataProvider';
import { FeitenView } from '../../pages/public-affairs-v2/FeitenCijfers';
import KompasSpecSection from './KompasSpecSection';
import CuratieSpecSection from './CuratieSpecSection';
import NotificatiesSection from './NotificatiesSection';
import ZoekcriteriaSection from './ZoekcriteriaSection';
import BronnenSection from './BronnenSection';
import Dossierbeheer from './dossierbeheer/Dossierbeheer';
import type { PaSectionRouterProps } from '../../pages/PADashboardV2';

const MONITORING_IDS = new Set<string>(MONITORING_TABS.map((t) => t.id));
const VOORTGANG_IDS = new Set<string>(['voortgang', 'kompas-log', 'interventie-log']);

/**
 * The package's own "beheer" panels. Deliberately smaller than the
 * pre-extraction BEHEER_IDS set: `profiel`, `rollen` and the IOU/Gereedschap
 * ids are host business (packages/frontend supplies its own components for
 * them, and packages/pa-demo drops several of them entirely) and never
 * reach this component — see the file header.
 */
const PACKAGE_BEHEER_IDS = new Set<string>([
  'bronnen',
  'zoekcriteria',
  'notificaties',
  'kompas-spec',
  'curatie-spec',
]);

export default function PaSectionsRouter({
  sectionId,
  prioritering,
  kompasViz,
  user,
  onOpenDossier,
  onNavigate,
}: PaSectionRouterProps) {
  const { dossiers } = usePaData();

  if (sectionId === 'vandaag') {
    return <Vandaag onOpenDossier={onOpenDossier} prioritering={prioritering} />;
  }

  if (sectionId === 'agenda') {
    return <AgendaView onOpenDossier={onOpenDossier} />;
  }

  if (sectionId === 'feiten') {
    return <FeitenView onOpenDossier={onOpenDossier} />;
  }

  if (MONITORING_IDS.has(sectionId)) {
    return (
      <Monitoring
        activeTab={sectionId as MonitoringTabId}
        onOpenDossier={onOpenDossier}
        onNavigate={onNavigate}
      />
    );
  }

  if (VOORTGANG_IDS.has(sectionId)) {
    return <Voortgang view={sectionId as VoortgangView} onOpenDossier={onOpenDossier} />;
  }

  // Dossierbeheer manages its own layout (.pac-db, inside pac-main-pad), so it
  // is returned directly rather than through the shared beheer wrapper below.
  // Distinct keys force a fresh mount when switching between the two rail items,
  // so the internal view (list vs. template) always resets to match the nav.
  if (sectionId === 'db-overzicht') {
    return <Dossierbeheer key="db-overzicht" user={user} onNavigate={onNavigate} />;
  }
  if (sectionId === 'db-nieuw') {
    return <Dossierbeheer key="db-nieuw" user={user} startCreate onNavigate={onNavigate} />;
  }

  if (PACKAGE_BEHEER_IDS.has(sectionId)) {
    let content: React.ReactNode;
    switch (sectionId) {
      case 'kompas-spec':
        content = <KompasSpecSection />;
        break;
      case 'bronnen':
        content = <BronnenSection />;
        break;
      case 'zoekcriteria':
        content = <ZoekcriteriaSection />;
        break;
      case 'notificaties':
        content = <NotificatiesSection />;
        break;
      case 'curatie-spec':
        content = <CuratieSpecSection />;
        break;
      default:
        // Unreachable: PACKAGE_BEHEER_IDS lists exactly the cases above. TS
        // can't see that a Set membership check narrows sectionId, so this
        // keeps `content` definitely assigned without a fallthrough panel —
        // same idiom packages/pa-demo's DemoSectionRouter uses for the same
        // reason.
        content = null;
    }
    // `v2-main-pad` is inert here, and deliberately kept anyway.
    //
    // Its only rule anywhere is `.cwd-v2 .v2-main-pad`
    // (packages/frontend/src/pages/caseworker-v2/dashboard-v2.css:436), in a
    // stylesheet imported by CaseworkerDashboardV2.tsx alone. The PA shell
    // renders under `.pac`, which exists precisely so it cannot collide with
    // the caseworker app (see PADashboardV2's file header) and is never
    // nested inside `.cwd-v2`. So under `.pac` the class matches nothing: in
    // packages/pa-demo the rule is not even in the bundle, and in
    // packages/frontend it is present but unreachable from this markup.
    //
    // The padding a reader sees around this content comes from
    // `.pac .pac-main-pad` (dashboard-pa.css:300) on the shell's own <main>
    // wrapper at PADashboardV2.tsx:614 — one rule, with no child selectors,
    // so this inner <div> contributes no layout of its own either.
    //
    // It stays because the class is live in the `.cwd-v2` family and both PA
    // hosts spell their section wrappers the same way (packages/frontend's
    // PASectionRouter, packages/pa-demo's DemoSectionRouter). Dropping it in
    // one of the three would make the convention inconsistent rather than
    // absent. Recorded here so nobody re-derives it, and so no future comment
    // claims it supplies padding — two of them once did.
    return <div className="v2-main-pad">{content}</div>;
  }

  const dossier = dossiers.data.find((d) => d.id === sectionId);
  if (dossier) {
    return <Issuekaart dossier={dossier} kompasViz={kompasViz} onNavigate={onNavigate} />;
  }

  // Unknown id — usually a dossier that was just deleted or archived out of the
  // cockpit (the selection syncer redirects, but this covers the transient frame
  // and stale ⌘K / deep-link ids). Offer a way back to a live dossier. This is
  // the unconditional terminal branch — see the file header for why a host
  // must rule out its own ids before this component ever sees them.
  const firstDossier = dossiers.data.find((d) => d.status === 'actief') ?? dossiers.data[0];
  return (
    <div style={{ padding: '24px 0', color: '#6b7280' }}>
      <p style={{ fontSize: 14 }}>
        Deze sectie is niet (meer) beschikbaar — het dossier is mogelijk verwijderd of gearchiveerd.
      </p>
      {firstDossier && (
        <button
          type="button"
          className="pac-btn pac-btn-sm"
          onClick={() => onOpenDossier(firstDossier.id)}
        >
          Naar {firstDossier.naam} →
        </button>
      )}
    </div>
  );
}
