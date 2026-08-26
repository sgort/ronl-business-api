// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaSectionsRouter from './PaSectionsRouter';
import { makePaDataStub } from '../../test/paData.stub';

const mockDossiers = vi.hoisted(() => [
  { id: 'jeugdzorg', naam: 'Jeugdzorg', status: 'sluimerend' },
  { id: 'stikstof', naam: 'Stikstof & landbouw', status: 'actief' },
]);
vi.mock('../../pages/public-affairs-v2/PaDataProvider', () => ({
  usePaData: () =>
    makePaDataStub({ dossiers: { data: mockDossiers, status: 'ok', refetch: vi.fn() } }),
}));

vi.mock('../../pages/public-affairs-v2/Vandaag', () => ({ default: () => <div>vandaag</div> }));

const mockIssuekaart = vi.hoisted(() => vi.fn());
vi.mock('../../pages/public-affairs-v2/Issuekaart', () => ({
  default: (props: never) => {
    mockIssuekaart(props);
    return <div>issuekaart</div>;
  },
}));

const mockMonitoring = vi.hoisted(() => vi.fn());
vi.mock('../../pages/public-affairs-v2/Monitoring', () => ({
  default: (props: never) => {
    mockMonitoring(props);
    return <div>monitoring</div>;
  },
}));

vi.mock('../../pages/public-affairs-v2/AgendaView', () => ({
  default: () => <div>agenda-view</div>,
}));

const mockVoortgang = vi.hoisted(() => vi.fn());
vi.mock('../../pages/public-affairs-v2/Voortgang', () => ({
  default: (props: never) => {
    mockVoortgang(props);
    return <div>voortgang</div>;
  },
}));

vi.mock('../../pages/public-affairs-v2/FeitenCijfers', () => ({
  FeitenView: () => <div>feiten-view</div>,
}));

vi.mock('./KompasSpecSection', () => ({ default: () => <div>kompas-spec</div> }));
vi.mock('./CuratieSpecSection', () => ({ default: () => <div>curatie-spec</div> }));
vi.mock('./NotificatiesSection', () => ({ default: () => <div>notificaties</div> }));
vi.mock('./ZoekcriteriaSection', () => ({ default: () => <div>zoekcriteria</div> }));
vi.mock('./BronnenSection', () => ({ default: () => <div>bronnen</div> }));

const mockDossierbeheer = vi.hoisted(() => vi.fn());
vi.mock('./dossierbeheer/Dossierbeheer', () => ({
  default: (props: never) => {
    mockDossierbeheer(props);
    return <div>dossierbeheer</div>;
  },
}));

const baseProps = {
  sectionId: 'vandaag',
  prioritering: 'kompas' as never,
  kompasViz: 'radar' as never,
  user: null,
  tenantConfig: null,
  onOpenDossier: vi.fn(),
};

describe('PaSectionsRouter', () => {
  it('routes "vandaag" to Vandaag', () => {
    render(<PaSectionsRouter {...baseProps} sectionId="vandaag" />);
    expect(screen.getByText('vandaag')).toBeInTheDocument();
  });

  it('routes "agenda" to AgendaView, ahead of the Monitoring tab match', () => {
    render(<PaSectionsRouter {...baseProps} sectionId="agenda" />);
    expect(screen.getByText('agenda-view')).toBeInTheDocument();
  });

  it('routes "feiten" to FeitenView', () => {
    render(<PaSectionsRouter {...baseProps} sectionId="feiten" />);
    expect(screen.getByText('feiten-view')).toBeInTheDocument();
  });

  it('routes a monitoring tab id to Monitoring with that tab active', () => {
    render(<PaSectionsRouter {...baseProps} sectionId="politiek" />);
    expect(screen.getByText('monitoring')).toBeInTheDocument();
    expect(mockMonitoring).toHaveBeenCalledWith(expect.objectContaining({ activeTab: 'politiek' }));
  });

  it('routes a voortgang id to Voortgang with that view', () => {
    render(<PaSectionsRouter {...baseProps} sectionId="kompas-log" />);
    expect(screen.getByText('voortgang')).toBeInTheDocument();
    expect(mockVoortgang).toHaveBeenCalledWith(expect.objectContaining({ view: 'kompas-log' }));
  });

  it('"db-overzicht" and "db-nieuw" both route to Dossierbeheer, only the latter sets startCreate', () => {
    const { rerender } = render(<PaSectionsRouter {...baseProps} sectionId="db-overzicht" />);
    expect(screen.getByText('dossierbeheer')).toBeInTheDocument();
    expect(mockDossierbeheer).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ startCreate: true })
    );

    rerender(<PaSectionsRouter {...baseProps} sectionId="db-nieuw" />);
    expect(mockDossierbeheer).toHaveBeenLastCalledWith(
      expect.objectContaining({ startCreate: true })
    );
  });

  it('forwards the host-supplied `user` to Dossierbeheer', () => {
    // The one prop this component passes straight through rather than
    // deriving, and the only place in the file that does it — which is what
    // makes it worth its own case. Dossierbeheer runs `user` through
    // deriveDossierRole() to decide what its role bar and every guarded
    // action permit, so dropping the forward would not throw: it would
    // silently downgrade every visitor to "no dossier role". Nothing else
    // caught that. The cases above pin `startCreate` only, and a host's own
    // suite legitimately stops at this component's boundary (see
    // packages/pa-demo/src/demo/DemoSectionRouter.test.tsx, whose probe
    // replaces this component wholesale), so before this case the mutation
    // was visible to the e2e suite alone.
    //
    // A concrete object rather than baseProps' `user: null`: objectContaining
    // with a null value reads as "asserts nothing" to the next reader, and an
    // identity check states the property being protected.
    const user = { sub: 'u-1', roles: ['public-affairs', 'pa-admin'] } as never;

    const { rerender } = render(
      <PaSectionsRouter {...baseProps} sectionId="db-overzicht" user={user} />
    );
    expect(mockDossierbeheer).toHaveBeenLastCalledWith(expect.objectContaining({ user }));

    rerender(<PaSectionsRouter {...baseProps} sectionId="db-nieuw" user={user} />);
    expect(mockDossierbeheer).toHaveBeenLastCalledWith(expect.objectContaining({ user }));
  });

  it.each([
    ['bronnen', 'bronnen'],
    ['zoekcriteria', 'zoekcriteria'],
    ['notificaties', 'notificaties'],
    ['kompas-spec', 'kompas-spec'],
    ['curatie-spec', 'curatie-spec'],
  ])('package "beheer" section "%s" routes to its component', (sectionId, text) => {
    render(<PaSectionsRouter {...baseProps} sectionId={sectionId} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('a sectionId matching a dossier id renders Issuekaart for that dossier', () => {
    render(<PaSectionsRouter {...baseProps} sectionId="jeugdzorg" />);
    expect(screen.getByText('issuekaart')).toBeInTheDocument();
    expect(mockIssuekaart).toHaveBeenCalledWith(
      expect.objectContaining({ dossier: mockDossiers[0] })
    );
  });

  it('an unknown sectionId falls back to the first actief dossier with a way back', async () => {
    const onOpenDossier = vi.fn();
    const user = userEvent.setup();
    render(
      <PaSectionsRouter {...baseProps} sectionId="deleted-dossier" onOpenDossier={onOpenDossier} />
    );

    expect(screen.getByText(/Deze sectie is niet \(meer\) beschikbaar/)).toBeInTheDocument();
    const link = screen.getByRole('button', { name: /Naar Stikstof & landbouw/ });
    await user.click(link);

    expect(onOpenDossier).toHaveBeenCalledWith('stikstof');
  });

  it('a host-owned id (e.g. "profiel") is not recognised, and falls to the dossier fallthrough', () => {
    // PaSectionsRouter has no concept of host-owned ids — a host is
    // responsible for intercepting its own ids (profiel, rollen, the IOU
    // sections, gereedschap-overzicht) before ever reaching this component.
    // Documenting that boundary here, not asserting a host contract this
    // component cannot know about.
    render(<PaSectionsRouter {...baseProps} sectionId="profiel" />);
    expect(screen.getByText(/Deze sectie is niet \(meer\) beschikbaar/)).toBeInTheDocument();
  });
});
