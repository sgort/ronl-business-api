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
import Voortgang, { type VoortgangView } from '../../pages/public-affairs-v2/Voortgang';
import type { KompasViz } from '../../pages/public-affairs-v2/Kompas';
import {
  getDossier,
  MONITORING_TABS,
  type MonitoringTabId,
} from '../../pages/public-affairs-v2/pa.data';

const MONITORING_IDS = new Set<string>(MONITORING_TABS.map((t) => t.id));
const VOORTGANG_IDS = new Set<string>(['voortgang', 'kompas-log', 'interventie-log']);

interface Props {
  sectionId: string;
  prioritering: Prioritering;
  kompasViz: KompasViz;
  onOpenDossier: (id: string) => void;
}

export default function PASectionRouter({
  sectionId,
  prioritering,
  kompasViz,
  onOpenDossier,
}: Props) {
  if (sectionId === 'vandaag') {
    return <Vandaag onOpenDossier={onOpenDossier} prioritering={prioritering} />;
  }

  if (MONITORING_IDS.has(sectionId)) {
    return <Monitoring activeTab={sectionId as MonitoringTabId} onOpenDossier={onOpenDossier} />;
  }

  if (VOORTGANG_IDS.has(sectionId)) {
    return <Voortgang view={sectionId as VoortgangView} onOpenDossier={onOpenDossier} />;
  }

  const dossier = getDossier(sectionId);
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
