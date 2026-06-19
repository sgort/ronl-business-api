import type { KeycloakUser } from '@ronl/shared';
import type { InfraModeId } from '../../pages/infra-board/modes.config';
import type { ProjectRef } from '../../pages/InfraBoardDashboard';
import MijnDag from './MijnDag';
import Portfolio from './Portfolio';
import ProjectDetail from './ProjectDetail';

// Reused, unchanged V1 components for the Beheer surface:
import RipFase1Section from '../CaseworkerDashboard/RipFase1Section';
import RipFase1WipSection from '../CaseworkerDashboard/RipFase1WipSection';
import RipFase1GereedSection from '../CaseworkerDashboard/RipFase1GereedSection';
import ArchiefSection from '../CaseworkerDashboard/ArchiefSection';

interface Props {
  mode: InfraModeId;
  section: string;
  openProject: ProjectRef | null;
  user: KeycloakUser | null;
  phaseLabels: string[];
  onOpenProject: (ref: ProjectRef) => void;
  onBack: () => void;
  onGotoPortfolio: () => void;
}

export default function InfraSectionRouter(p: Props) {
  if (p.openProject) {
    return (
      <ProjectDetail projectRef={p.openProject} phaseLabels={p.phaseLabels} onBack={p.onBack} />
    );
  }
  if (p.mode === 'mijn-dag') {
    return (
      <MijnDag user={p.user} onOpenProject={p.onOpenProject} onGotoPortfolio={p.onGotoPortfolio} />
    );
  }
  if (p.mode === 'portfolio') {
    return <Portfolio phaseLabels={p.phaseLabels} onOpenProject={p.onOpenProject} />;
  }
  // Beheer — reuse the existing role-gated V1 components verbatim.
  switch (p.section) {
    case 'rip-fase1':
      return <RipFase1Section user={p.user} />;
    case 'rip-fase1-wip':
      return <RipFase1WipSection user={p.user} />;
    case 'rip-fase1-gereed':
      return <RipFase1GereedSection user={p.user} />;
    case 'archief':
      return <ArchiefSection />;
    default:
      return <RipFase1WipSection user={p.user} />;
  }
}
