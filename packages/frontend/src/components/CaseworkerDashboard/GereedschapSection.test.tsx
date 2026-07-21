// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GereedschapSection from './GereedschapSection';

const mockBusinessApi = vi.hoisted(() => ({
  edocs: { status: vi.fn() },
  health: vi.fn(),
  externalStatus: vi.fn(),
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

beforeEach(() => {
  mockBusinessApi.edocs.status.mockResolvedValue({ success: true, data: null });
  mockBusinessApi.health.mockResolvedValue({ dependencies: {} });
  mockBusinessApi.externalStatus.mockResolvedValue({ success: true, data: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GereedschapSection', () => {
  it('shows only unrestricted tools for a user without the admin role', async () => {
    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);
    await screen.findByText('CPSV Editor');
    expect(screen.queryByText('Operaton Cockpit')).not.toBeInTheDocument();
    expect(screen.queryByText('SAP')).not.toBeInTheDocument();
  });

  it('shows admin-only tools for a user with the admin role', async () => {
    render(<GereedschapSection user={{ sub: '1', roles: ['admin'] } as never} />);
    expect(await screen.findByText('Operaton Cockpit')).toBeInTheDocument();
    expect(screen.getByText('SAP')).toBeInTheDocument();
  });

  it('shows a "Binnenkort" badge for tools with no url', async () => {
    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);
    await screen.findByText('KMS');
    const kmsCard = screen.getByText('KMS').closest('div.bg-white');
    expect(kmsCard).toHaveTextContent('Binnenkort');
  });

  it('shows the eDOCS status once resolved (stub mode)', async () => {
    mockBusinessApi.edocs.status.mockResolvedValue({
      success: true,
      data: { status: 'stub', library: 'demo-lib', latencyMs: 12 },
    });
    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);

    expect(await screen.findByText('Stub')).toBeInTheDocument();
    expect(screen.getByText('Library: demo-lib')).toBeInTheDocument();
    expect(screen.getByText('12 ms')).toBeInTheDocument();
  });

  it('shows the Operaton status from the health endpoint', async () => {
    mockBusinessApi.health.mockResolvedValue({
      dependencies: { operaton: { status: 'up', latency: 42 } },
    });
    render(<GereedschapSection user={{ sub: '1', roles: ['admin'] } as never} />);

    expect(await screen.findByText('42 ms')).toBeInTheDocument();
  });

  it('shows the external status for LDE/TriplyDB/CPRMV', async () => {
    mockBusinessApi.externalStatus.mockResolvedValue({
      success: true,
      data: { lde: { status: 'down', latency: 5 } },
    });
    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);

    const ldeCard = (await screen.findByText('Linked Data Explorer')).closest('div.bg-white');
    expect(ldeCard).toHaveTextContent('Offline');
  });

  it('clicking "Openen" opens the tool url in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);

    const cpsvCard = (await screen.findByText('CPSV Editor')).closest(
      'div.bg-white'
    ) as HTMLElement;
    await user.click(within(cpsvCard).getByRole('button', { name: 'Openen' }));

    expect(openSpy).toHaveBeenCalledWith(
      'https://acc.cpsv-editor.open-regels.nl/',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
