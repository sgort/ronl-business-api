import type { KeycloakUser } from '@ronl/shared';
import type { InfraModeId } from '../../pages/infra-board/modes.config';
import { phaseCodeFromSectionId } from '../../pages/infra-board/modes.config';
import type { ProjectRef } from '../../pages/InfraBoardDashboard';
import type { TenantConfig } from '../../services/tenant';
import MijnDag from './MijnDag';
import Portfolio from './Portfolio';
import ProjectDetail from './ProjectDetail';
import PhaseDetail from './PhaseDetail';
import { getMockUpdates } from '../../pages/infra-board/infra-board.data';
import { INFRA_PROCESS_KEYS } from '../../services/infra.api';

// Reused, unchanged V1 components for the Beheer surface:
import FaseladderOverview from './FaseladderOverview';
import ArchiefSection from '../CaseworkerDashboard/ArchiefSection';
import ProfielSection from '../CaseworkerDashboard/ProfielSection';
import RollenSection from '../CaseworkerDashboard/RollenSection';
import IouGebruiksscenarioSection from '../CaseworkerDashboard/IouGebruiksscenarioSection';
import IouFeedbackSection from '../CaseworkerDashboard/IouFeedbackSection';
import IouZakenSection from '../CaseworkerDashboard/IouZakenSection';
import GereedschapSection from '../CaseworkerDashboard/GereedschapSection';

function ProjectUpdatesView() {
  return (
    <div className="pb-view">
      <div className="pb-phase-titlebar">
        <h3>Project-updates</h3>
      </div>
      <div className="pb-updates-list">
        {getMockUpdates().map((up, i) => {
          const [d1, d2] = up.datum.split(' ');
          return (
            <div className="pb-update" key={i}>
              <div className="d">
                {d1}
                <br />
                {d2}
              </div>
              <div className="x">
                <span className="proj">{up.proj}</span> — {up.tekst}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  mode: InfraModeId;
  section: string;
  openProject: ProjectRef | null;
  user: KeycloakUser | null;
  tenantConfig: TenantConfig | null;
  onOpenProject: (ref: ProjectRef) => void;
  onBack: () => void;
  onGotoPortfolio: () => void;
  onOpenPhase: (phaseCode: string) => void;
  onBackToFaseladder: () => void;
}

export default function InfraSectionRouter(p: Props) {
  const { user, tenantConfig, section } = p;
  if (p.openProject) {
    return <ProjectDetail projectRef={p.openProject} onBack={p.onBack} />;
  }
  if (p.mode === 'mijn-dag') {
    if (section === 'project-updates') return <ProjectUpdatesView />;
    return (
      <MijnDag user={user} onOpenProject={p.onOpenProject} onGotoPortfolio={p.onGotoPortfolio} />
    );
  }
  if (p.mode === 'portfolio') {
    return <Portfolio onOpenProject={p.onOpenProject} />;
  }
  // Beheer — reuse the existing V1 components verbatim, wrapped in the
  // same v2-main-pad padding that CaseworkerDashboardV2 applies.
  let content: React.ReactNode;
  const phaseCode = section.startsWith('fase-') ? phaseCodeFromSectionId(section) : undefined;
  if (phaseCode) {
    content = <PhaseDetail phaseCode={phaseCode} onBack={p.onBackToFaseladder} />;
  } else {
    switch (section) {
      case 'profiel':
        content = (
          <ProfielSection user={user} tenantConfig={tenantConfig} showManualFetch={false} />
        );
        break;
      case 'rollen':
        content = <RollenSection user={user} />;
        break;
      case 'faseladder':
        content = <FaseladderOverview onOpenPhase={p.onOpenPhase} />;
        break;
      case 'archief':
        content = <ArchiefSection boardId="infra-board" allowProcessKeys={INFRA_PROCESS_KEYS} />;
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
  }
  return <div className="v2-main-pad">{content}</div>;
}
