import type { KeycloakUser } from '@ronl/shared';
import type { InfraModeId } from '../../pages/infra-board/modes.config';
import type { ProjectRef } from '../../pages/InfraBoardDashboard';
import type { TenantConfig } from '../../services/tenant';
import MijnDag from './MijnDag';
import Portfolio from './Portfolio';
import ProjectDetail from './ProjectDetail';
import { getMockUpdates } from '../../pages/infra-board/infra-board.data';

// Reused, unchanged V1 components for the Beheer surface:
import RipFase1Section from '../CaseworkerDashboard/RipFase1Section';
import RipFase1WipSection from '../CaseworkerDashboard/RipFase1WipSection';
import RipFase1GereedSection from '../CaseworkerDashboard/RipFase1GereedSection';
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
  phaseLabels: string[];
  onOpenProject: (ref: ProjectRef) => void;
  onBack: () => void;
  onGotoPortfolio: () => void;
}

export default function InfraSectionRouter(p: Props) {
  const { user, tenantConfig, section } = p;
  if (p.openProject) {
    return (
      <ProjectDetail projectRef={p.openProject} phaseLabels={p.phaseLabels} onBack={p.onBack} />
    );
  }
  if (p.mode === 'mijn-dag') {
    if (section === 'project-updates') return <ProjectUpdatesView />;
    return (
      <MijnDag user={user} onOpenProject={p.onOpenProject} onGotoPortfolio={p.onGotoPortfolio} />
    );
  }
  if (p.mode === 'portfolio') {
    return <Portfolio phaseLabels={p.phaseLabels} onOpenProject={p.onOpenProject} />;
  }
  // Beheer — reuse the existing V1 components verbatim.
  switch (section) {
    case 'profiel':
      return <ProfielSection user={user} tenantConfig={tenantConfig} />;
    case 'rollen':
      return <RollenSection user={user} />;
    case 'rip-fase1':
      return <RipFase1Section user={user} />;
    case 'rip-fase1-wip':
      return <RipFase1WipSection user={user} />;
    case 'rip-fase1-gereed':
      return <RipFase1GereedSection user={user} />;
    case 'archief':
      return <ArchiefSection />;
    case 'iou-gebruiksscenario':
      return <IouGebruiksscenarioSection />;
    case 'iou-feedback':
      return <IouFeedbackSection />;
    case 'iou-actieve-zaken':
      return <IouZakenSection state="opened" />;
    case 'iou-archief':
      return <IouZakenSection state="closed" />;
    case 'gereedschap-overzicht':
      return <GereedschapSection user={user} />;
    default:
      return <ProfielSection user={user} tenantConfig={tenantConfig} />;
  }
}
