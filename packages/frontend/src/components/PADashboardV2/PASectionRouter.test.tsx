// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PASectionRouter from './PASectionRouter';
import { makePaDataStub } from '@ronl/pa-cockpit/test-utils';

const mockDossiers = vi.hoisted(() => [
  { id: 'jeugdzorg', naam: 'Jeugdzorg', status: 'sluimerend' },
  { id: 'stikstof', naam: 'Stikstof & landbouw', status: 'actief' },
]);

const mockIssuekaart = vi.hoisted(() => vi.fn());
const mockMonitoring = vi.hoisted(() => vi.fn());
const mockVoortgang = vi.hoisted(() => vi.fn());
const mockDossierbeheer = vi.hoisted(() => vi.fn());

// PASectionRouter now sources its section-content components from the
// package rather than from sibling files in packages/frontend, so they are
// mocked as one module rather than per relative path. `importOriginal` keeps
// every real export PASectionRouter also relies on at runtime (MONITORING_TABS)
// intact, overriding only usePaData and the components under test here.
vi.mock('@ronl/pa-cockpit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ronl/pa-cockpit')>();
  return {
    ...actual,
    usePaData: () =>
      makePaDataStub({ dossiers: { data: mockDossiers, status: 'ok', refetch: vi.fn() } }),
    Vandaag: () => <div>vandaag</div>,
    Issuekaart: (props: never) => {
      mockIssuekaart(props);
      return <div>issuekaart</div>;
    },
    Monitoring: (props: never) => {
      mockMonitoring(props);
      return <div>monitoring</div>;
    },
    AgendaView: () => <div>agenda-view</div>,
    Voortgang: (props: never) => {
      mockVoortgang(props);
      return <div>voortgang</div>;
    },
    FeitenView: () => <div>feiten-view</div>,
    KompasSpecSection: () => <div>kompas-spec</div>,
    CuratieSpecSection: () => <div>curatie-spec</div>,
    NotificatiesSection: () => <div>notificaties</div>,
    ZoekcriteriaSection: () => <div>zoekcriteria</div>,
    BronnenSection: () => <div>bronnen</div>,
    Dossierbeheer: (props: never) => {
      mockDossierbeheer(props);
      return <div>dossierbeheer</div>;
    },
  };
});

vi.mock('../CaseworkerDashboard/ProfielSection', () => ({ default: () => <div>profiel</div> }));
vi.mock('../CaseworkerDashboard/RollenSection', () => ({ default: () => <div>rollen</div> }));
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
vi.mock('../CaseworkerDashboard/GereedschapSection', () => ({
  default: () => <div>gereedschap</div>,
}));

const baseProps = {
  sectionId: 'vandaag',
  prioritering: 'kompas' as never,
  kompasViz: 'radar' as never,
  user: null,
  tenantConfig: null,
  onOpenDossier: vi.fn(),
};

describe('PASectionRouter', () => {
  it('routes "vandaag" to Vandaag', () => {
    render(<PASectionRouter {...baseProps} sectionId="vandaag" />);
    expect(screen.getByText('vandaag')).toBeInTheDocument();
  });

  it('routes "agenda" to AgendaView, ahead of the Monitoring tab match', () => {
    render(<PASectionRouter {...baseProps} sectionId="agenda" />);
    expect(screen.getByText('agenda-view')).toBeInTheDocument();
  });

  it('routes "feiten" to FeitenView', () => {
    render(<PASectionRouter {...baseProps} sectionId="feiten" />);
    expect(screen.getByText('feiten-view')).toBeInTheDocument();
  });

  it('routes a monitoring tab id to Monitoring with that tab active', () => {
    render(<PASectionRouter {...baseProps} sectionId="politiek" />);
    expect(screen.getByText('monitoring')).toBeInTheDocument();
    expect(mockMonitoring).toHaveBeenCalledWith(expect.objectContaining({ activeTab: 'politiek' }));
  });

  it('routes a voortgang id to Voortgang with that view', () => {
    render(<PASectionRouter {...baseProps} sectionId="kompas-log" />);
    expect(screen.getByText('voortgang')).toBeInTheDocument();
    expect(mockVoortgang).toHaveBeenCalledWith(expect.objectContaining({ view: 'kompas-log' }));
  });

  it('"db-overzicht" and "db-nieuw" both route to Dossierbeheer, only the latter sets startCreate', () => {
    const { rerender } = render(<PASectionRouter {...baseProps} sectionId="db-overzicht" />);
    expect(screen.getByText('dossierbeheer')).toBeInTheDocument();
    expect(mockDossierbeheer).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ startCreate: true })
    );

    rerender(<PASectionRouter {...baseProps} sectionId="db-nieuw" />);
    expect(mockDossierbeheer).toHaveBeenLastCalledWith(
      expect.objectContaining({ startCreate: true })
    );
  });

  it.each([
    ['bronnen', 'bronnen'],
    ['zoekcriteria', 'zoekcriteria'],
    ['notificaties', 'notificaties'],
    ['kompas-spec', 'kompas-spec'],
    ['curatie-spec', 'curatie-spec'],
    ['profiel', 'profiel'],
    ['rollen', 'rollen'],
    ['iou-gebruiksscenario', 'iou-gebruiksscenario'],
    ['iou-feedback', 'iou-feedback'],
    ['gereedschap-overzicht', 'gereedschap'],
  ])('beheer section "%s" routes to its component', (sectionId, text) => {
    render(<PASectionRouter {...baseProps} sectionId={sectionId} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('iou-actieve-zaken and iou-archief pass the right state to IouZakenSection', () => {
    const { rerender } = render(<PASectionRouter {...baseProps} sectionId="iou-actieve-zaken" />);
    expect(mockIouZakenSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'opened' })
    );

    rerender(<PASectionRouter {...baseProps} sectionId="iou-archief" />);
    expect(mockIouZakenSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'closed' })
    );
  });

  it('a sectionId matching a dossier id renders Issuekaart for that dossier', () => {
    render(<PASectionRouter {...baseProps} sectionId="jeugdzorg" />);
    expect(screen.getByText('issuekaart')).toBeInTheDocument();
    expect(mockIssuekaart).toHaveBeenCalledWith(
      expect.objectContaining({ dossier: mockDossiers[0] })
    );
  });

  it('an unknown sectionId falls back to the first actief dossier with a way back', async () => {
    const onOpenDossier = vi.fn();
    const user = userEvent.setup();
    render(
      <PASectionRouter {...baseProps} sectionId="deleted-dossier" onOpenDossier={onOpenDossier} />
    );

    expect(screen.getByText(/Deze sectie is niet \(meer\) beschikbaar/)).toBeInTheDocument();
    const link = screen.getByRole('button', { name: /Naar Stikstof & landbouw/ });
    await user.click(link);

    expect(onOpenDossier).toHaveBeenCalledWith('stikstof');
  });
});
