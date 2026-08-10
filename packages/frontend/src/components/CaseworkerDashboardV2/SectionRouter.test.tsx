// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SectionRouter from './SectionRouter';
import { INFRA_PROCESS_KEYS } from '../../services/infra.api';

afterEach(() => {
  vi.clearAllMocks();
});

const mockTakenInbox = vi.hoisted(() => vi.fn());
vi.mock('./TakenInbox', () => ({
  default: (props: never) => {
    mockTakenInbox(props);
    return <div>taken-inbox</div>;
  },
}));

const mockNoAccessPanel = vi.hoisted(() => vi.fn());
vi.mock('./NoAccessPanel', () => ({
  default: (props: never) => {
    mockNoAccessPanel(props);
    return <div>no-access</div>;
  },
}));

vi.mock('../CaseworkerDashboard/RegelCatalogus', () => ({
  default: () => <div>regelcatalogus</div>,
}));
vi.mock('../CaseworkerDashboard/ProcesBibliotheek', () => ({
  default: () => <div>procesbibliotheek</div>,
}));
vi.mock('./GegevenswoordenboekV2', () => ({ default: () => <div>gegevenswoordenboek</div> }));
const mockArchiefSection = vi.hoisted(() => vi.fn());
vi.mock('../CaseworkerDashboard/ArchiefSection', () => ({
  default: (props: never) => {
    mockArchiefSection(props);
    return <div>archief</div>;
  },
}));
vi.mock('../CaseworkerDashboard/BerichtenSection', () => ({ default: () => <div>berichten</div> }));
vi.mock('../CaseworkerDashboard/NieuwsSection', () => ({ default: () => <div>nieuws</div> }));
vi.mock('../CaseworkerDashboard/ProductenDienstenCatalogus', () => ({
  default: () => <div>producten-diensten</div>,
}));
vi.mock('../CaseworkerDashboard/ProfielSection', () => ({ default: () => <div>profiel</div> }));
vi.mock('../CaseworkerDashboard/RollenSection', () => ({ default: () => <div>rollen</div> }));
vi.mock('../CaseworkerDashboard/HrOnboardingSection', () => ({
  default: () => <div>hr-onboarding</div>,
}));
vi.mock('../CaseworkerDashboard/OnboardingArchiefSection', () => ({
  default: () => <div>onboarding-archief</div>,
}));
vi.mock('../CaseworkerDashboard/RipFase1WipSection', () => ({
  default: () => <div>rip-fase1-wip</div>,
}));
vi.mock('../CaseworkerDashboard/RipFase1GereedSection', () => ({
  default: () => <div>rip-fase1-gereed</div>,
}));
vi.mock('../CaseworkerDashboard/IouGebruiksscenarioSection', () => ({
  default: () => <div>iou-gebruiksscenario</div>,
}));
vi.mock('../CaseworkerDashboard/IouFeedbackSection', () => ({
  default: () => <div>iou-feedback</div>,
}));
const mockIouZakenSection = vi.hoisted(() => vi.fn());
vi.mock('../CaseworkerDashboard/IouZakenSection', () => ({
  default: (props: never) => {
    mockIouZakenSection(props);
    return <div>iou-zaken</div>;
  },
}));
const mockAuditSection = vi.hoisted(() => vi.fn());
vi.mock('../CaseworkerDashboard/AuditSection', () => ({
  default: (props: never) => {
    mockAuditSection(props);
    return <div>audit</div>;
  },
}));
vi.mock('../CaseworkerDashboard/CapacityClaimSection', () => ({
  default: () => <div>capacity-claim</div>,
}));
vi.mock('../CaseworkerDashboard/CapacityClaimArchiefSection', () => ({
  default: () => <div>capacity-claim-archief</div>,
}));
const mockDvtpStartSection = vi.hoisted(() => vi.fn());
vi.mock('../CaseworkerDashboard/DvtpStartSection', () => ({
  default: (props: never) => {
    mockDvtpStartSection(props);
    return <div>dvtp-start</div>;
  },
}));
vi.mock('../CaseworkerDashboard/DvtpTakenSection', () => ({
  default: () => <div>dvtp-taken</div>,
}));
vi.mock('../CaseworkerDashboard/GereedschapSection', () => ({
  default: () => <div>gereedschap</div>,
}));

// Covers every role/org-type gate defined in modes.config.ts, so the
// "routes X to its component" loop below isn't blocked by the
// defence-in-depth gate — gating itself is covered separately below.
const superUser = {
  sub: '1',
  roles: ['hr-medewerker', 'manager', 'infra-projectteam', 'admin'],
  organisation_type: 'municipality',
} as never;

const baseProps = {
  sectionId: 'taken',
  user: superUser,
  tenantConfig: null,
};

describe('SectionRouter', () => {
  it('routes "taken" to TakenInbox with the task-count callback', () => {
    const onTaskCountChange = vi.fn();
    render(
      <SectionRouter {...baseProps} sectionId="taken" onTaskCountChange={onTaskCountChange} />
    );
    expect(screen.getByText('taken-inbox')).toBeInTheDocument();
    expect(mockTakenInbox).toHaveBeenCalledWith(
      expect.objectContaining({ onCountChange: onTaskCountChange })
    );
  });

  it.each([
    ['filter-overdue', 'overdue'],
    ['filter-waiting', 'unassigned'],
    ['filter-today', 'today'],
    ['filter-week', 'week'],
  ])('routes "%s" to TakenInbox with initialFilter "%s"', (sectionId, filter) => {
    render(<SectionRouter {...baseProps} sectionId={sectionId} />);
    expect(mockTakenInbox).toHaveBeenCalledWith(expect.objectContaining({ initialFilter: filter }));
  });

  it.each([
    ['regelcatalogus', 'regelcatalogus'],
    ['procesbibliotheek', 'procesbibliotheek'],
    ['gegevenswoordenboek', 'gegevenswoordenboek'],
    ['producten-diensten', 'producten-diensten'],
    ['nieuws', 'nieuws'],
    ['berichten', 'berichten'],
    ['profiel', 'profiel'],
    ['rollen', 'rollen'],
    ['iou-gebruiksscenario', 'iou-gebruiksscenario'],
    ['iou-feedback', 'iou-feedback'],
    ['capacity-claim', 'capacity-claim'],
    ['dvtp-taken', 'dvtp-taken'],
    ['gereedschap-overzicht', 'gereedschap'],
  ])('routes "%s" to its component', (sectionId, text) => {
    render(<SectionRouter {...baseProps} sectionId={sectionId} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('archief passes the caseworker board id and denies the infra process keys', () => {
    render(<SectionRouter {...baseProps} sectionId="archief" />);
    expect(mockArchiefSection).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: 'caseworker', denyProcessKeys: INFRA_PROCESS_KEYS })
    );
  });

  it('iou-actieve-zaken and iou-archief pass the right state (and count callback for the active one)', () => {
    const onIouCountChange = vi.fn();
    const { rerender } = render(
      <SectionRouter
        {...baseProps}
        sectionId="iou-actieve-zaken"
        onIouCountChange={onIouCountChange}
      />
    );
    expect(mockIouZakenSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'opened', onCountChange: onIouCountChange })
    );

    rerender(<SectionRouter {...baseProps} sectionId="iou-archief" />);
    expect(mockIouZakenSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'closed' })
    );
  });

  it('audit-overzicht and audit-details both route to AuditSection with the matching active tab', () => {
    const adminUser = { sub: '1', roles: ['admin'] } as never;
    const { rerender } = render(
      <SectionRouter {...baseProps} sectionId="audit-overzicht" user={adminUser} />
    );
    expect(mockAuditSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeTab: 'audit-overzicht' })
    );

    rerender(<SectionRouter {...baseProps} sectionId="audit-details" user={adminUser} />);
    expect(mockAuditSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeTab: 'audit-details' })
    );
  });

  it('dvtp-start wires onNavigateToTasks to call onNavigate("taken")', () => {
    const onNavigate = vi.fn();
    render(
      <SectionRouter
        {...baseProps}
        sectionId="dvtp-start"
        user={{ sub: '1', organisation_type: 'municipality', roles: [] } as never}
        onNavigate={onNavigate}
      />
    );
    const onNavigateToTasks = mockDvtpStartSection.mock.calls.at(-1)![0].onNavigateToTasks;
    onNavigateToTasks();
    expect(onNavigate).toHaveBeenCalledWith('taken');
  });

  it('an unrecognised sectionId shows the "not yet connected to V2" fallback', () => {
    render(<SectionRouter {...baseProps} sectionId="some-unmapped-id" />);
    expect(screen.getByText('some-unmapped-id')).toBeInTheDocument();
    expect(screen.getByText(/nog niet aangesloten op V2/)).toBeInTheDocument();
  });

  describe('defence-in-depth role/org-type gate', () => {
    it('blocks a role-gated section for a user without the role', () => {
      render(
        <SectionRouter
          {...baseProps}
          sectionId="hr-onboarding"
          user={{ sub: '1', roles: [] } as never}
        />
      );
      expect(screen.getByText('no-access')).toBeInTheDocument();
      expect(mockNoAccessPanel).toHaveBeenCalledWith(
        expect.objectContaining({ requiredRoles: ['hr-medewerker'] })
      );
    });

    it('allows a role-gated section through for a user with the role', () => {
      render(
        <SectionRouter
          {...baseProps}
          sectionId="hr-onboarding"
          user={{ sub: '1', roles: ['hr-medewerker'] } as never}
        />
      );
      expect(screen.getByText('hr-onboarding')).toBeInTheDocument();
    });

    it('blocks an org-type-gated section for a user with a mismatched org type', () => {
      render(
        <SectionRouter
          {...baseProps}
          sectionId="dvtp-start"
          user={{ sub: '1', organisation_type: 'province', roles: [] } as never}
        />
      );
      expect(screen.getByText('no-access')).toBeInTheDocument();
      expect(mockNoAccessPanel).toHaveBeenCalledWith(
        expect.objectContaining({ requiredOrgTypes: ['municipality'] })
      );
    });

    it('allows an org-type-gated section through for a matching org type', () => {
      render(
        <SectionRouter
          {...baseProps}
          sectionId="dvtp-start"
          user={{ sub: '1', organisation_type: 'municipality', roles: [] } as never}
        />
      );
      expect(screen.getByText('dvtp-start')).toBeInTheDocument();
    });

    it('an ungated section is unaffected by the gate (no user roles needed)', () => {
      render(<SectionRouter {...baseProps} sectionId="regelcatalogus" user={null} />);
      expect(screen.getByText('regelcatalogus')).toBeInTheDocument();
      expect(mockNoAccessPanel).not.toHaveBeenCalled();
    });
  });
});
