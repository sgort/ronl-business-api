// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RipFase1WipSection from './RipFase1WipSection';

const mockBusinessApi = vi.hoisted(() => ({
  rip: { phase1Active: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const mockRipFase1WipViewer = vi.hoisted(() => vi.fn());
vi.mock('./RipFase1WipViewer', () => ({
  default: (props: { instanceId: string }) => {
    mockRipFase1WipViewer(props);
    return <div>wip-viewer</div>;
  },
}));

const infraUser = { sub: '1', roles: ['infra-projectteam'] } as never;

const project = {
  id: 'p1',
  startTime: '2026-06-01T00:00:00Z',
  projectNumber: '12345',
  projectName: 'Rondweg Noord',
  edocsWorkspaceId: 'w-1',
};

beforeEach(() => {
  mockBusinessApi.rip.phase1Active.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RipFase1WipSection', () => {
  it('shows an access-restricted panel for a user without the infra-projectteam role', () => {
    render(<RipFase1WipSection user={{ sub: '1', roles: [] } as never} />);
    expect(screen.getByText('Toegang beperkt')).toBeInTheDocument();
    expect(mockBusinessApi.rip.phase1Active).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no active projects', async () => {
    render(<RipFase1WipSection user={infraUser} />);
    expect(
      await screen.findByText('Geen lopende RIP Fase 1 projecten gevonden.')
    ).toBeInTheDocument();
  });

  it('shows an error state and "Opnieuw proberen" retries the load', async () => {
    mockBusinessApi.rip.phase1Active.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<RipFase1WipSection user={infraUser} />);

    expect(await screen.findByText('Projecten konden niet worden geladen.')).toBeInTheDocument();

    mockBusinessApi.rip.phase1Active.mockResolvedValue({ success: true, data: [project] });
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(await screen.findByText(/Rondweg Noord/)).toBeInTheDocument();
  });

  it('falls back to "Naamloos project" when the project name is a placeholder dash', async () => {
    mockBusinessApi.rip.phase1Active.mockResolvedValue({
      success: true,
      data: [{ ...project, projectName: '—' }],
    });
    render(<RipFase1WipSection user={infraUser} />);
    expect(await screen.findByText(/Naamloos project/)).toBeInTheDocument();
  });

  it('expanding a project shows the RipFase1WipViewer with its instance id', async () => {
    mockBusinessApi.rip.phase1Active.mockResolvedValue({ success: true, data: [project] });
    const user = userEvent.setup();
    render(<RipFase1WipSection user={infraUser} />);

    const toggle = await screen.findByRole('button', { name: /Rondweg Noord/ });
    expect(screen.queryByText('wip-viewer')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText('wip-viewer')).toBeInTheDocument();
    expect(mockRipFase1WipViewer).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'p1' })
    );
  });
});
