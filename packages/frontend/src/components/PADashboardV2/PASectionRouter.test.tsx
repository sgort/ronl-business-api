// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { expectMockNamesRealExports } from '@ronl/pa-cockpit/test-utils';
import PASectionRouter from './PASectionRouter';

// One stub, not twelve: everything this file doesn't own — Vandaag,
// Issuekaart, Monitoring, Voortgang, the package's own "beheer" panels, and
// the dossier-lookup-or-placeholder fallthrough — now lives behind a single
// package export. Its own behaviour is covered by
// packages/pa-cockpit/src/components/PADashboardV2/PaSectionsRouter.test.tsx;
// this file only needs to prove it is reached, with the right props, for
// anything this host doesn't recognise itself.
//
// Spreading the real module before the override is the pattern
// packages/pa-cockpit/src/test/mockModule.ts documents, and
// expectMockNamesRealExports (below) is the assertion half of the same fix:
// a wholesale replacement would leave any other name this file starts
// importing from the package silently undefined instead of failing loudly.
const mockPaSectionsRouter = vi.hoisted(() => vi.fn());
const paCockpitMock = vi.hoisted(() => ({
  exports: {
    PaSectionsRouter: (props: never) => {
      mockPaSectionsRouter(props);
      return <div>pa-sections-router</div>;
    },
  },
}));

vi.mock('@ronl/pa-cockpit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ronl/pa-cockpit')>()),
  ...paCockpitMock.exports,
}));

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
  it('mocks only names @ronl/pa-cockpit really exports', async () => {
    // vi.importActual, not import(): the path is mocked, so a plain dynamic
    // import would hand back the mock and compare it with itself.
    await expectMockNamesRealExports(
      vi.importActual('@ronl/pa-cockpit'),
      paCockpitMock.exports as Record<string, unknown>
    );
  });

  it.each([
    ['profiel', 'profiel'],
    ['rollen', 'rollen'],
    ['iou-gebruiksscenario', 'iou-gebruiksscenario'],
    ['iou-feedback', 'iou-feedback'],
    ['gereedschap-overzicht', 'gereedschap'],
  ])('host-owned section "%s" routes to its component', (sectionId, text) => {
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

  it('anything not host-owned delegates to PaSectionsRouter with the same props', () => {
    render(<PASectionRouter {...baseProps} sectionId="vandaag" />);
    expect(screen.getByText('pa-sections-router')).toBeInTheDocument();
    expect(mockPaSectionsRouter).toHaveBeenCalledWith(
      expect.objectContaining({ ...baseProps, sectionId: 'vandaag' })
    );
  });

  it.each([
    'agenda',
    'feiten',
    'politiek',
    'kompas-log',
    'db-overzicht',
    'bronnen',
    'some-dossier-id',
  ])(
    'delegates "%s" to PaSectionsRouter too — this file owns only its seven host ids',
    (sectionId) => {
      render(<PASectionRouter {...baseProps} sectionId={sectionId} />);
      expect(screen.getByText('pa-sections-router')).toBeInTheDocument();
    }
  );
});
