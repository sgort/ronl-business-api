// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhaseDetail from './PhaseDetail';
import { ripPhaseByCode, RIP_PHASES } from '../../pages/infra-board/rip-phases.catalog';
import {
  getReadyProjects,
  getOutOfSequenceProjects,
  getMockPortfolio,
} from '../../pages/infra-board/infra-board.data';

const mockUseDeployedProcessKeys = vi.hoisted(() => vi.fn());
const mockUseLivePhaseCounts = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return {
    ...actual,
    useDeployedProcessKeys: mockUseDeployedProcessKeys,
    useLivePhaseCounts: mockUseLivePhaseCounts,
  };
});

// getPhaseDeployStatus is overridden per-test so the Starten tab's
// enabled/disabled behavior can be exercised for a phase other than
// R2.1 — no other phase has a real processDefinitionKey today, so this
// is the only way to test the "deployed, non-first phase" path at all.
const mockGetPhaseDeployStatus = vi.hoisted(() => vi.fn());
vi.mock('../../pages/infra-board/rip-phases.catalog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../pages/infra-board/rip-phases.catalog')>();
  return { ...actual, getPhaseDeployStatus: mockGetPhaseDeployStatus };
});

const mockStart = vi.hoisted(() => vi.fn());
const mockPhaseActive = vi.hoisted(() => vi.fn());
const mockActivityHistory = vi.hoisted(() => vi.fn());
const mockPhaseCompleted = vi.hoisted(() => vi.fn());
const mockInstanceDocuments = vi.hoisted(() => vi.fn());
vi.mock('../../services/api', () => ({
  businessApi: {
    process: { start: mockStart, activityHistory: mockActivityHistory },
    rip: {
      phaseActive: mockPhaseActive,
      phaseCompleted: mockPhaseCompleted,
      instanceDocuments: mockInstanceDocuments,
    },
  },
}));

beforeEach(() => {
  mockUseDeployedProcessKeys.mockReturnValue({
    data: { deployedKeys: ['RipR21Process'] },
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockUseLivePhaseCounts.mockReturnValue({
    data: { counts: {} },
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockGetPhaseDeployStatus.mockImplementation((phase: { code: string }) =>
    phase.code === 'R2.1' ? 'gedeployed' : 'ontwerp'
  );
  mockStart.mockResolvedValue({ success: true, data: { processInstanceId: 'pi-1' } });
  mockPhaseActive.mockResolvedValue({ success: true, data: [] });
  mockActivityHistory.mockResolvedValue({ success: true, data: [] });
  mockPhaseCompleted.mockResolvedValue({ success: true, data: [] });
  mockInstanceDocuments.mockResolvedValue({
    success: true,
    data: { variables: {}, intakeReport: null, psuReport: null, pdp: null },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('PhaseDetail — header and side panel', () => {
  it('renders the header meta strip and side panel figures from the catalogue', () => {
    const { container } = render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);
    const phase = ripPhaseByCode('R2.3')!;
    // Scoped to the meta strip: phase.exit and phase.lead are also echoed
    // in the side panel's "what happens when you start" narrative, so an
    // unscoped getByText would match twice and throw.
    const metaStrip = within(container.querySelector('.pb-meta-strip')!);
    expect(metaStrip.getByText(phase.entry, { exact: false })).toBeInTheDocument();
    expect(metaStrip.getByText(phase.exit, { exact: false })).toBeInTheDocument();
    expect(metaStrip.getByText(phase.lead, { exact: false })).toBeInTheDocument();
    expect(metaStrip.getByText(String(phase.roles.length), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(`${phase.weeks} weken`, { exact: false })).toBeInTheDocument();
    // phase.gates.length renders as a bare digit ("2"), which as an
    // exact:false substring collides with digits elsewhere on the page
    // (e.g. the "R2.3" phase chip) — read the dd next to its dt instead.
    expect(screen.getByText('Review-loops').nextElementSibling?.textContent).toBe(
      String(phase.gates.length)
    );
    expect(screen.getByText('Ja — Infra-overleg', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(phase.bron, { exact: false })).toBeInTheDocument();
  });

  it('shows "Nee" for kredietbesluit when the phase has none', () => {
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);
    expect(screen.getByText('Nee', { exact: false })).toBeInTheDocument();
  });
});

// The 'PhaseDetail - R5.3 (beyond)' block was removed here. It exercised the
// "Niet gemodelleerd" placeholder and the geparkeerde-projecten list, both
// reachable only for a `beyond` phase. R5.3 was the only one and is modelled
// now, and PhaseDetail resolves phaseCode against the real catalogue, so no
// synthetic fixture can drive that branch. The branch itself is kept in
// PhaseDetail.tsx for a future phase catalogued ahead of its sheet.

describe('PhaseDetail — Starten tab, R2.1 fallback', () => {
  it('shows the single-button fallback when the ready-list is empty and there is no predecessor', () => {
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);
    expect(getReadyProjects('R2.1')).toEqual([]);
    expect(screen.getByRole('button', { name: 'R2.1 starten' })).toBeInTheDocument();
  });

  it('starts RipR21Process on click and shows success', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'R2.1 starten' }));

    expect(mockStart).toHaveBeenCalledWith('RipR21Process', {});
    expect(await screen.findByText('R2.1 gestart', { exact: false })).toBeInTheDocument();
  });

  it('guards against double-submit', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'R2.1 starten' });
    await user.dblClick(button);

    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('shows the error detail on failure', async () => {
    mockStart.mockResolvedValue({
      success: false,
      error: { details: 'Proces niet gevonden', instance: 'http://localhost:8081' },
    });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'R2.1 starten' }));

    expect(await screen.findByText('Proces niet gevonden')).toBeInTheDocument();
  });

  it('refetches live WIP data after successfully starting a process', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);
    await screen.findByRole('button', { name: 'R2.1 starten' });
    mockPhaseActive.mockClear();

    await user.click(screen.getByRole('button', { name: 'R2.1 starten' }));
    await screen.findByText('R2.1 gestart', { exact: false });

    expect(mockPhaseActive).toHaveBeenCalled();
  });
});

describe('PhaseDetail — Starten tab, undeployed phase', () => {
  it('shows the not-deployed banner with the ready-count and disables checkboxes', () => {
    render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);
    const readyCount = getReadyProjects('R2.3').length;
    expect(
      screen.getByText(`Er staan wel ${readyCount} projecten klaar voor deze fase.`, {
        exact: false,
      })
    ).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
    checkboxes.forEach((cb) => expect(cb).toBeDisabled());
  });
});

describe('PhaseDetail — Starten tab, deployed phase with ready projects', () => {
  beforeEach(() => {
    mockGetPhaseDeployStatus.mockReturnValue('gedeployed');
  });

  it('enables checkboxes and the start button once a ready project is selected', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);

    // R2.2 is used elsewhere in this file, but its predecessor phase
    // (R2.1, the first rung) can never carry a 'wachtend' project in the
    // mock data model — getMockPortfolio() only marks a project
    // 'wachtend' past ladder position 1 — so getReadyProjects('R2.2') is
    // always empty. R2.3 is the first phase with a real ready list.
    const ready = getReadyProjects('R2.3');
    expect(ready.length).toBeGreaterThan(0);

    const startButton = screen.getByRole('button', { name: 'R2.3 starten' });
    expect(startButton).toBeDisabled();

    const firstCheckbox = screen.getAllByRole('checkbox')[0];
    expect(firstCheckbox).not.toBeDisabled();
    await user.click(firstCheckbox);

    expect(startButton).not.toBeDisabled();
  });

  it('reveals out-of-sequence projects and requires an afwijkingsreden before their checkbox enables', async () => {
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);

    const outOfSequence = getOutOfSequenceProjects('R2.3');
    expect(outOfSequence.length).toBeGreaterThan(0);

    await user.click(screen.getByText(`Toon ${outOfSequence.length} projecten`, { exact: false }));

    // Scope both queries to the same row (by the first out-of-sequence
    // project's own <li>) — with more than one out-of-sequence project,
    // picking the reason input and checkbox independently could pair up
    // two different projects' elements.
    const reasonInput = screen.getAllByLabelText('Afwijkingsreden')[0];
    const row = reasonInput.closest('li')!;
    const outOfSequenceCheckbox = within(row).getByRole('checkbox');
    expect(outOfSequenceCheckbox).toBeDisabled();

    await user.type(reasonInput, 'ab');
    expect(outOfSequenceCheckbox).toBeDisabled();

    await user.type(reasonInput, 'cd');
    expect(outOfSequenceCheckbox).not.toBeDisabled();
  });
});

describe('PhaseDetail — WIP tab', () => {
  it('renders a real R2.1 row with a LIVE badge, using the live activity history', async () => {
    mockPhaseActive.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'live-1',
          startTime: '2026-08-10T10:54:47.658+0200',
          projectNumber: '99999',
          projectName: 'Live testproject',
          edocsWorkspaceId: 'w1',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'a1',
          activityId: 'Task_OrganiserenIntakeoverleg',
          activityName: 'Organiseren intake-overleg',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-08-10T10:55:38.009+0200',
          endTime: null,
          durationInMillis: null,
          canceled: false,
        },
      ],
    });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    expect(await screen.findByText('Live testproject', { exact: false })).toBeInTheDocument();
    expect(
      await screen.findByText('Organiseren intake-overleg', { exact: false })
    ).toBeInTheDocument();
    expect(screen.getAllByText('LIVE', { exact: false }).length).toBeGreaterThan(0);
  });

  it('renders mock rows for a phase with wip projects, unbadged', async () => {
    mockGetPhaseDeployStatus.mockReturnValue('gedeployed');
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    const wipProject = getMockPortfolio().find(
      (p) => p.ripPhaseCode === 'R2.3' && p.ripPhaseState === 'wip'
    );
    expect(wipProject).toBeDefined();
    expect(screen.getByText(wipProject!.naam, { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('shows a loading indicator while live WIP data is in flight', async () => {
    mockPhaseActive.mockImplementation(() => new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    expect(screen.getByText('Bezig met laden…')).toBeInTheDocument();
  });

  it('shows an error banner with a retry button when live WIP data fails to load', async () => {
    mockPhaseActive.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    expect(
      await screen.findByText('Live WIP-gegevens konden niet worden geladen.', { exact: false })
    ).toBeInTheDocument();
    mockPhaseActive.mockClear();
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect(mockPhaseActive).toHaveBeenCalledTimes(1);
  });

  it('computes Producten (docsDone/docsTotal) for a live WIP row from its activity history', async () => {
    mockPhaseActive.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'live-2',
          startTime: '2026-08-01T00:00:00Z',
          projectNumber: '55555',
          projectName: 'Doc progress project',
          edocsWorkspaceId: 'w4',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'a1',
          activityId: 'Task_AanlevrenProjectplan',
          activityName: 'Aanleveren Projectplan',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-08-01T00:00:00Z',
          endTime: '2026-08-01T01:00:00Z',
          durationInMillis: 1,
          canceled: false,
        },
        {
          id: 'a2',
          activityId: 'Task_AanvullenProjectplan2',
          activityName: 'Aanvullen Projectplan',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-08-02T00:00:00Z',
          endTime: '2026-08-02T01:00:00Z',
          durationInMillis: 1,
          canceled: false,
        },
        {
          id: 'a3',
          activityId: 'Task_OrganiserenIntakeoverleg',
          activityName: 'Organiseren intake-overleg',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-08-03T00:00:00Z',
          endTime: null,
          durationInMillis: null,
          canceled: false,
        },
      ],
    });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    const row = (await screen.findByText('Doc progress project', { exact: false })).closest('tr');
    // Producten is populated by a SECOND async hop (activity-history fetch,
    // chained off the first list fetch resolving) — use findByText, not a
    // synchronous getByText, so this doesn't race the two hops.
    expect(await within(row!).findByText('2/4')).toBeInTheDocument();
  });

  it('renders a dash for Gezondheid, not a false "Op schema", when a live row has no derivable step info', async () => {
    mockPhaseActive.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'live-3',
          startTime: '2026-08-01T00:00:00Z',
          projectNumber: '44444',
          projectName: 'Unknown state project',
          edocsWorkspaceId: 'w6',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /WIP/ }));

    // Scoped to this live row: R2.1 also has its own mock WIP rows
    // rendered in the same table, some of which legitimately have
    // 'groen' health ("Op schema") — an unscoped query would false-fail
    // on those unrelated rows.
    const row = (await screen.findByText('Unknown state project', { exact: false })).closest('tr');
    expect(within(row!).queryByText('Op schema')).not.toBeInTheDocument();
  });
});

describe('PhaseDetail — Gereed tab', () => {
  it('renders the summary line and a real R2.1 row with a LIVE badge', async () => {
    mockPhaseCompleted.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'done-1',
          startTime: '2026-01-01T00:00:00Z',
          endTime: '2026-03-15T00:00:00Z',
          projectNumber: '88888',
          projectName: 'Afgerond testproject',
          edocsWorkspaceId: 'w2',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({ success: true, data: [] });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));

    // The mock portfolio's own "gereed for R2.1" backlog (any project whose
    // current ladder position is past R2.1) is non-trivial — 35 projects at
    // time of writing — so the summary is 1 live row plus that mock count,
    // not just "1". Computed dynamically rather than hardcoded so this
    // doesn't silently drift if the mock catalogue changes size.
    const mockGereedCount = getMockPortfolio().filter(
      (p) => RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode) > 0
    ).length;
    expect(await screen.findByText('Afgerond testproject', { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText(`${mockGereedCount + 1} afgerond`, { exact: false })
    ).toBeInTheDocument();
    expect(screen.getAllByText('LIVE', { exact: false }).length).toBeGreaterThan(0);
  });

  it('reveals the document viewer when Openen is clicked on a real row', async () => {
    mockPhaseCompleted.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'done-1',
          startTime: '2026-01-01T00:00:00Z',
          endTime: '2026-03-15T00:00:00Z',
          projectNumber: '88888',
          projectName: 'Afgerond testproject',
          edocsWorkspaceId: 'w2',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({ success: true, data: [] });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));
    await user.click(await screen.findByRole('button', { name: 'Openen' }));

    expect(mockInstanceDocuments).toHaveBeenCalledWith('done-1');
  });

  it('shows the computed rework-loop count for a real completed row', async () => {
    mockPhaseCompleted.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'done-2',
          startTime: '2026-01-01T00:00:00Z',
          endTime: '2026-03-15T00:00:00Z',
          projectNumber: '77777',
          projectName: 'Project met rework',
          edocsWorkspaceId: 'w3',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'a1',
          activityId: 'Task_AanvullenProjectplan2',
          activityName: 'Aanvullen Projectplan',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-01-05T00:00:00Z',
          endTime: '2026-01-06T00:00:00Z',
          durationInMillis: 1,
          canceled: false,
        },
        {
          id: 'a2',
          activityId: 'Gateway_Akkoord2',
          activityName: 'Akkoord?',
          activityType: 'exclusiveGateway',
          assignee: null,
          startTime: '2026-01-06T00:00:00Z',
          endTime: '2026-01-06T00:00:01Z',
          durationInMillis: 1,
          canceled: false,
        },
        {
          id: 'a3',
          activityId: 'Task_AanvullenProjectplan2',
          activityName: 'Aanvullen Projectplan',
          activityType: 'userTask',
          assignee: null,
          startTime: '2026-01-07T00:00:00Z',
          endTime: '2026-01-08T00:00:00Z',
          durationInMillis: 1,
          canceled: false,
        },
      ],
    });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));

    const row = (await screen.findByText('Project met rework', { exact: false })).closest('tr');
    expect(await within(row!).findByText('1')).toBeInTheDocument();
  });

  it('shows mock rows without a Dossier link', async () => {
    mockGetPhaseDeployStatus.mockReturnValue('gedeployed');
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.4" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));

    const gereedProject = getMockPortfolio().find(
      (p) => RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode) > 3
    );
    expect(gereedProject).toBeDefined();
    const row = screen.getByText(gereedProject!.naam, { exact: false }).closest('tr');
    expect(within(row!).queryByRole('button', { name: 'Openen' })).not.toBeInTheDocument();
  });

  it('shows a loading indicator while live Gereed data is in flight', async () => {
    mockPhaseCompleted.mockImplementation(() => new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));

    expect(screen.getByText('Bezig met laden…')).toBeInTheDocument();
  });

  it('shows an error banner with a retry button when live Gereed data fails to load', async () => {
    mockPhaseCompleted.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));

    expect(
      await screen.findByText('Live Gereed-gegevens konden niet worden geladen.', { exact: false })
    ).toBeInTheDocument();
    mockPhaseCompleted.mockClear();
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect(mockPhaseCompleted).toHaveBeenCalledTimes(1);
  });

  it('renders the full Gereed summary line with average doorlooptijd, norm, and review-loop count', async () => {
    mockPhaseCompleted.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'done-3',
          startTime: '2026-01-01T00:00:00Z',
          endTime: '2026-03-15T00:00:00Z',
          projectNumber: '66666',
          projectName: 'Summary testproject',
          edocsWorkspaceId: 'w5',
        },
      ],
    });
    mockActivityHistory.mockResolvedValue({ success: true, data: [] });
    const user = userEvent.setup();
    render(<PhaseDetail phaseCode="R2.1" onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Gereed/ }));

    expect(
      await screen.findByText(
        /afgerond · Gemiddelde doorlooptijd \d+ wk · norm 10 wk · \d+ met review-loop/
      )
    ).toBeInTheDocument();
  });
});

describe('PhaseDetail — starting the next phase from a finished predecessor', () => {
  const completedR21 = {
    id: 'pi-r21',
    businessKey: 'flevoland-1788277164739',
    startTime: '2026-01-05T09:00:00Z',
    endTime: '2026-02-10T15:30:00Z',
    projectNumber: '24011',
    projectName: 'Larserweg — ongelijkvloerse aansluiting',
    edocsWorkspaceId: 'w1',
  };

  function deployR22() {
    mockGetPhaseDeployStatus.mockImplementation((phase: { code: string }) =>
      phase.code === 'R2.1' || phase.code === 'R2.2' ? 'gedeployed' : 'ontwerp'
    );
    mockPhaseCompleted.mockImplementation((code: string) =>
      Promise.resolve({ success: true, data: code === 'R2.1' ? [completedR21] : [] })
    );
    mockPhaseActive.mockResolvedValue({ success: true, data: [] });
  }

  it('lists a project whose R2.1 instance finished as ready to start R2.2', async () => {
    deployR22();
    render(<PhaseDetail phaseCode="R2.2" onBack={vi.fn()} />);

    expect(await screen.findByText('24011')).toBeInTheDocument();
    expect(
      screen.getByText('Larserweg — ongelijkvloerse aansluiting', { exact: false })
    ).toBeInTheDocument();
    expect(mockPhaseCompleted).toHaveBeenCalledWith('R2.1');
  });

  it('carries the project number and business key into the new instance', async () => {
    const user = userEvent.setup();
    deployR22();
    render(<PhaseDetail phaseCode="R2.2" onBack={vi.fn()} />);

    await screen.findByText('24011');
    const startButton = screen.getByRole('button', { name: 'R2.2 starten' });
    expect(startButton).toBeDisabled();

    await user.click(screen.getAllByRole('checkbox')[0]);
    expect(startButton).not.toBeDisabled();
    await user.click(startButton);

    // The business key travels with the project, so every phase instance of
    // one project shares the key its originating R2.1 run minted.
    expect(mockStart).toHaveBeenCalledWith(
      'RipR22Process',
      expect.objectContaining({ projectNumber: '24011' }),
      'flevoland-1788277164739'
    );
  });

  it('does not offer a project that already has a running R2.2 instance', async () => {
    deployR22();
    mockPhaseActive.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'pi-r22',
          businessKey: 'flevoland-1788277164739',
          startTime: '2026-02-11T08:00:00Z',
          projectNumber: '24011',
          projectName: 'Larserweg — ongelijkvloerse aansluiting',
          edocsWorkspaceId: 'w1',
          leadRole: '',
        },
      ],
    });
    render(<PhaseDetail phaseCode="R2.2" onBack={vi.fn()} />);

    await screen.findByRole('button', { name: 'R2.2 starten' });
    expect(screen.queryByText('24011')).not.toBeInTheDocument();
  });

  it('counts the same projects in the Starten tab badge as in the list below it', async () => {
    deployR22();
    const { container } = render(<PhaseDetail phaseCode="R2.2" onBack={vi.fn()} />);

    await screen.findByText('24011');

    // The badge used to read `klaar`, the Faseladder's arithmetic estimate
    // (gereed[predecessor] - wip - gereed across mock and live combined),
    // while the heading counted the rows actually rendered. On R2.2 those
    // disagreed by one, because the mock fixtures report projects gereed on
    // R2.1 that getReadyProjects can never return.
    const startenTab = [...container.querySelectorAll('.pb-tab-badge')][0];
    expect(startenTab?.textContent).toBe('1');
    expect(screen.getByText(/Projecten die R2\.2 kunnen starten/)).toHaveTextContent(
      'Projecten die R2.2 kunnen starten 1'
    );
  });

  it('drops the badge to zero once the only candidate has been started', async () => {
    const user = userEvent.setup();
    deployR22();
    const { container } = render(<PhaseDetail phaseCode="R2.2" onBack={vi.fn()} />);

    await screen.findByText('24011');
    await user.click(screen.getAllByRole('checkbox')[0]);

    // Starting it makes the project's business key taken, so the next read of
    // the readiness list excludes it.
    mockPhaseActive.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'pi-r22',
          businessKey: 'flevoland-1788277164739',
          startTime: '2026-02-11T08:00:00Z',
          projectNumber: '24011',
          projectName: 'Larserweg — ongelijkvloerse aansluiting',
          edocsWorkspaceId: 'w1',
          leadRole: '',
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'R2.2 starten' }));

    await waitFor(() => {
      const startenTab = [...container.querySelectorAll('.pb-tab-badge')][0];
      expect(startenTab?.textContent).toBe('0');
    });
    expect(screen.queryByText('24011')).not.toBeInTheDocument();
  });

  it('no longer discloses a skipped phase on R5.4, now that R5.3 is modelled', () => {
    render(<PhaseDetail phaseCode="R5.4" onBack={vi.fn()} />);

    // R5.4's entry criterion is "Oplevering areaal na R5.3". That oplevering is
    // an observable exit now -- RipR53Process's "Ja, oplevering areaal" end
    // event -- so there is nothing handled outside the tool to disclose.
    expect(screen.queryByText(/buiten deze tool afgehandeld/)).not.toBeInTheDocument();
  });

  it('shows no such notice on a phase with an ordinary predecessor', () => {
    render(<PhaseDetail phaseCode="R2.3" onBack={vi.fn()} />);
    expect(screen.queryByText(/buiten deze tool afgehandeld/)).not.toBeInTheDocument();
  });
});
