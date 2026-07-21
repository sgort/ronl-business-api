// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RipFase1WipViewer from './RipFase1WipViewer';

const mockBusinessApi = vi.hoisted(() => ({
  rip: { phase1Documents: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

vi.mock('./ProcessStepsTimeline', () => ({
  default: ({ instanceId }: { instanceId: string }) => <div>steps-timeline-{instanceId}</div>,
}));

const intakeTemplate = {
  id: 't1',
  name: 'Intake',
  zones: {
    letterhead: { blocks: [] },
    contactInformation: { blocks: [] },
    reference: { blocks: [] },
    body: { blocks: [{ type: 'variable', variableKey: 'projectName' }] },
    closing: { blocks: [] },
    signOff: { blocks: [] },
  },
};

beforeEach(() => {
  mockBusinessApi.rip.phase1Documents.mockResolvedValue({
    success: true,
    data: {
      variables: { projectName: 'Rondweg Noord' },
      intakeReport: intakeTemplate,
      psuReport: null,
      pdp: null,
    },
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RipFase1WipViewer', () => {
  it('shows a loading message before the documents resolve', () => {
    mockBusinessApi.rip.phase1Documents.mockReturnValue(new Promise(() => {}));
    render(<RipFase1WipViewer instanceId="pi-1" />);
    expect(screen.getByText('Documenten laden…')).toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    mockBusinessApi.rip.phase1Documents.mockResolvedValue({ success: false });
    render(<RipFase1WipViewer instanceId="pi-1" />);
    expect(await screen.findByText('Documenten konden niet worden geladen.')).toBeInTheDocument();
  });

  it('shows "Nog niet beschikbaar" for documents that were not produced', async () => {
    render(<RipFase1WipViewer instanceId="pi-1" />);
    expect(await screen.findByText('PSU-verslag (Kolom 3)')).toBeInTheDocument();
    const cards = screen.getAllByText('Nog niet beschikbaar');
    expect(cards).toHaveLength(2); // psuReport + pdp
  });

  it('expanding a produced document section substitutes its variables', async () => {
    const user = userEvent.setup();
    render(<RipFase1WipViewer instanceId="pi-1" />);

    await user.click(await screen.findByText('Intakeverslag (Kolom 2)'));

    expect(screen.getByText('Rondweg Noord')).toBeInTheDocument();
  });

  it('the process-steps section is open by default and shows the timeline', async () => {
    render(<RipFase1WipViewer instanceId="pi-1" />);
    expect(await screen.findByText('steps-timeline-pi-1')).toBeInTheDocument();
  });

  it('collapsing the process-steps section hides the timeline', async () => {
    const user = userEvent.setup();
    render(<RipFase1WipViewer instanceId="pi-1" />);
    await screen.findByText('steps-timeline-pi-1');

    await user.click(screen.getByText('Processtappen'));

    expect(screen.queryByText('steps-timeline-pi-1')).not.toBeInTheDocument();
  });
});
