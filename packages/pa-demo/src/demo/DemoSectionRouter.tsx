/**
 * Replaces the vendored PASectionRouter, whose "beheer" switch is the only
 * place that reaches into the internal caseworker dashboard for six section
 * components — Profiel, Rollen, the four IOU sections and Gereedschap.
 * Dropping those imports is what keeps that dashboard's components out of
 * this public bundle entirely, and deciding which sections a public demo
 * gets to show is exactly what differs here — so this file is written, not
 * vendored. `profiel` and `rollen` render this demo's own page components
 * instead; the IOU and Gereedschap cases are gone, and unmatched ids
 * (including every id in DROPPED_SECTION_IDS) render nothing rather than
 * falling through to a placeholder panel.
 *
 * Every other section below is the vendored component, unmodified.
 *
 * Role propagation: this component calls useDemoRole() purely so it becomes
 * a *consumer* of DemoRoleContext. The vendored shell (PADashboardV2.tsx)
 * snapshots getUser() into React state once at mount and never refreshes it,
 * so the `user` prop this component receives is permanently stale after the
 * demo role switches. Forwarding that prop to sections would make the demo
 * role selector silently do nothing. Two things fix that, and both are
 * required together: being a context consumer is what makes THIS component
 * re-render when the role changes at all — a non-consuming ancestor whose
 * own element is unchanged causes React to bail out of re-rendering its
 * subtree, so without the hook below no re-render happens regardless of what
 * the render reads. On top of that, calling getUser() fresh (rather than
 * forwarding the `user` prop) is what makes the re-render actually pick up
 * the new roles. Do not "simplify" this back to forwarding `user` — that
 * reintroduces the bug (see DemoSectionRouter.test.tsx's role-propagation
 * test, which exists specifically to catch that regression).
 */
import Vandaag, { type Prioritering } from '../vendor/pages/public-affairs-v2/Vandaag';
import Issuekaart from '../vendor/pages/public-affairs-v2/Issuekaart';
import Monitoring from '../vendor/pages/public-affairs-v2/Monitoring';
import AgendaView from '../vendor/pages/public-affairs-v2/AgendaView';
import Voortgang, { type VoortgangView } from '../vendor/pages/public-affairs-v2/Voortgang';
import type { KompasViz } from '../vendor/pages/public-affairs-v2/Kompas';
import { MONITORING_TABS, type MonitoringTabId } from '../vendor/pages/public-affairs-v2/pa.data';
import { usePaData } from '../vendor/pages/public-affairs-v2/PaDataProvider';
import type { KeycloakUser } from '@ronl/shared';
import type { TenantConfig } from './shims/tenant';
import { FeitenView } from '../vendor/pages/public-affairs-v2/FeitenCijfers';
import KompasSpecSection from '../vendor/components/PADashboardV2/KompasSpecSection';
import CuratieSpecSection from '../vendor/components/PADashboardV2/CuratieSpecSection';
import NotificatiesSection from '../vendor/components/PADashboardV2/NotificatiesSection';
import ZoekcriteriaSection from '../vendor/components/PADashboardV2/ZoekcriteriaSection';
import BronnenSection from '../vendor/components/PADashboardV2/BronnenSection';
import Dossierbeheer from '../vendor/components/PADashboardV2/dossierbeheer/Dossierbeheer';
import Profiel from './Profiel';
import RollenRechten from './RollenRechten';
import { useDemoRole } from './demo-role';
import { getUser } from './shims/keycloak';

const MONITORING_IDS = new Set<string>(MONITORING_TABS.map((t) => t.id));
const VOORTGANG_IDS = new Set<string>(['voortgang', 'kompas-log', 'interventie-log']);
const BEHEER_IDS = new Set<string>([
  'bronnen',
  'zoekcriteria',
  'notificaties',
  'kompas-spec',
  'curatie-spec',
  'profiel',
  'rollen',
]);

interface Props {
  sectionId: string;
  prioritering: Prioritering;
  kompasViz: KompasViz;
  user: KeycloakUser | null;
  tenantConfig: TenantConfig | null;
  onOpenDossier: (id: string) => void;
  onNavigate?: (
    mode: import('../vendor/pages/public-affairs-v2/modes.config').PaModeId,
    sectionId: string
  ) => void;
}

export default function DemoSectionRouter({
  sectionId,
  prioritering,
  kompasViz,
  // Accepted (and kept in Props) because the vendored shell passes it and
  // its type must still match — but never forwarded. See the role-
  // propagation note in the file header for why.
  user: _staleUser,
  tenantConfig: _tenantConfig,
  onOpenDossier,
  onNavigate,
}: Props) {
  // Registers this component as a DemoRoleContext consumer — see the file
  // header. The value itself isn't needed here; getUser() below is what
  // actually reads the current roles.
  useDemoRole();
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
  //
  // getUser(), not the `user` prop — see the file header.
  if (sectionId === 'db-overzicht') {
    return <Dossierbeheer key="db-overzicht" user={getUser()} onNavigate={onNavigate} />;
  }
  if (sectionId === 'db-nieuw') {
    return <Dossierbeheer key="db-nieuw" user={getUser()} startCreate onNavigate={onNavigate} />;
  }

  if (BEHEER_IDS.has(sectionId)) {
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
      case 'profiel':
        content = <Profiel />;
        break;
      case 'rollen':
        content = <RollenRechten />;
        break;
      default:
        // Unreachable: BEHEER_IDS lists exactly the cases above. TypeScript
        // can't see that a Set membership check narrows sectionId, so this
        // keeps `content` definitely assigned without a fallthrough panel.
        content = null;
    }
    return <div className="v2-main-pad">{content}</div>;
  }

  const dossier = dossiers.data.find((d) => d.id === sectionId);
  if (dossier) {
    return <Issuekaart dossier={dossier} kompasViz={kompasViz} onNavigate={onNavigate} />;
  }

  // Unknown id — includes every id in DROPPED_SECTION_IDS (IOU, Gereedschap)
  // reached via a stale ⌘K entry or deep link, plus a dossier that was just
  // deleted or archived out of the cockpit. modes.filtered already hides
  // dropped ids from the rail and the palette, so there is nothing useful to
  // offer here beyond doing nothing — unlike the vendored router, this does
  // not fall back to a "pick another dossier" panel, since that panel is
  // meaningless for a dropped section id and the dossier-selection syncer
  // already covers the transient-frame case.
  return null;
}
