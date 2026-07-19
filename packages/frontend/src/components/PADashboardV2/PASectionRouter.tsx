/**
 * PASectionRouter — dispatches the PA shell's `activeSection` to a screen.
 *
 * Section id grammar:
 *   'vandaag'                              → Vandaag
 *   'politiek' | 'europa' | …             → Monitoring (tab)
 *   'voortgang' | 'kompas-log' | …        → Voortgang (view)
 *   '<dossierId>' (any other id)          → Issuekaart for that dossier
 *
 * Dossiers are data-driven, so any id that resolves to a dossier renders the
 * Issuekaart. Unknown ids fall through to a friendly placeholder.
 */

import Vandaag, { type Prioritering } from '../../pages/public-affairs-v2/Vandaag';
import Issuekaart from '../../pages/public-affairs-v2/Issuekaart';
import Monitoring from '../../pages/public-affairs-v2/Monitoring';
import AgendaView from '../../pages/public-affairs-v2/AgendaView';
import Voortgang, { type VoortgangView } from '../../pages/public-affairs-v2/Voortgang';
import type { KompasViz } from '../../pages/public-affairs-v2/Kompas';
import { MONITORING_TABS, type MonitoringTabId } from '../../pages/public-affairs-v2/pa.data';
import { usePaData } from '../../pages/public-affairs-v2/PaDataProvider';
import type { KeycloakUser } from '@ronl/shared';
import type { TenantConfig } from '../../services/tenant';
import ProfielSection from '../CaseworkerDashboard/ProfielSection';
import RollenSection from '../CaseworkerDashboard/RollenSection';
import IouGebruiksscenarioSection from '../CaseworkerDashboard/IouGebruiksscenarioSection';
import IouFeedbackSection from '../CaseworkerDashboard/IouFeedbackSection';
import IouZakenSection from '../CaseworkerDashboard/IouZakenSection';
import GereedschapSection from '../CaseworkerDashboard/GereedschapSection';
import { FeitenView } from '../../pages/public-affairs-v2/FeitenCijfers';
import KompasSpecSection from './KompasSpecSection';
import CuratieSpecSection from './CuratieSpecSection';
import NotificatiesSection from './NotificatiesSection';
import ZoekcriteriaSection from './ZoekcriteriaSection';
import BronnenSection from './BronnenSection';
import Dossierbeheer from './dossierbeheer/Dossierbeheer';

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
  'iou-gebruiksscenario',
  'iou-feedback',
  'iou-actieve-zaken',
  'iou-archief',
  'gereedschap-overzicht',
]);

interface Props {
  sectionId: string;
  prioritering: Prioritering;
  kompasViz: KompasViz;
  user: KeycloakUser | null;
  tenantConfig: TenantConfig | null;
  onOpenDossier: (id: string) => void;
  onNavigate?: (
    mode: import('../../pages/public-affairs-v2/modes.config').PaModeId,
    sectionId: string
  ) => void;
}

export default function PASectionRouter({
  sectionId,
  prioritering,
  kompasViz,
  user,
  tenantConfig,
  onOpenDossier,
  onNavigate,
}: Props) {
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
        content = (
          <ProfielSection user={user} tenantConfig={tenantConfig} showManualFetch={false} />
        );
        break;
      case 'rollen':
        content = <RollenSection user={user} />;
        break;
      case 'iou-gebruiksscenario':
        content = <IouGebruiksscenarioSection />;
        break;
      case 'iou-feedback':
        content = <IouFeedbackSection />;
        break;
      case 'iou-actieve-zaken':
        content = <IouZakenSection state="opened" />;
        break;
      case 'iou-archief':
        content = <IouZakenSection state="closed" />;
        break;
      case 'gereedschap-overzicht':
        content = <GereedschapSection user={user} />;
        break;
      default:
        content = (
          <ProfielSection user={user} tenantConfig={tenantConfig} showManualFetch={false} />
        );
    }
    return <div className="v2-main-pad">{content}</div>;
  }

  const dossier = dossiers.data.find((d) => d.id === sectionId);
  if (dossier) {
    return <Issuekaart dossier={dossier} kompasViz={kompasViz} onNavigate={onNavigate} />;
  }

  // Unknown id — usually a dossier that was just deleted or archived out of the
  // cockpit (the selection syncer redirects, but this covers the transient frame
  // and stale ⌘K / deep-link ids). Offer a way back to a live dossier.
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
