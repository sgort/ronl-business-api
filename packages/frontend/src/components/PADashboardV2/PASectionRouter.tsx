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

const MONITORING_IDS = new Set<string>(MONITORING_TABS.map((t) => t.id));
const VOORTGANG_IDS = new Set<string>(['voortgang', 'kompas-log', 'interventie-log']);
const BEHEER_IDS = new Set<string>([
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
}

export default function PASectionRouter({
  sectionId,
  prioritering,
  kompasViz,
  user,
  tenantConfig,
  onOpenDossier,
}: Props) {
  const { dossiers } = usePaData();
  if (sectionId === 'vandaag') {
    return <Vandaag onOpenDossier={onOpenDossier} prioritering={prioritering} />;
  }

  if (sectionId === 'agenda') {
    return <AgendaView onOpenDossier={onOpenDossier} />;
  }

  if (MONITORING_IDS.has(sectionId)) {
    return <Monitoring activeTab={sectionId as MonitoringTabId} onOpenDossier={onOpenDossier} />;
  }

  if (VOORTGANG_IDS.has(sectionId)) {
    return <Voortgang view={sectionId as VoortgangView} onOpenDossier={onOpenDossier} />;
  }

  if (BEHEER_IDS.has(sectionId)) {
    let content: React.ReactNode;
    switch (sectionId) {
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
    return <Issuekaart dossier={dossier} kompasViz={kompasViz} />;
  }

  return (
    <div style={{ padding: '24px 0', color: '#6b7280' }}>
      <p style={{ fontSize: 14 }}>
        Sectie <code style={{ background: '#f3f4f6', padding: '2px 6px' }}>{sectionId}</code> is nog
        niet aangesloten.
      </p>
    </div>
  );
}
