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

describe('GereedschapSection status badges', () => {
  const cardFor = (name: string) => screen.getByText(name).closest('div.bg-white') as HTMLElement;

  it('shows eDOCS online, with its library and latency', async () => {
    mockBusinessApi.edocs.status.mockResolvedValue({
      success: true,
      data: { status: 'up', library: 'ProductieLib', latencyMs: 42 },
    });

    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);

    const card = cardFor('eDOCS');
    expect(await within(card).findByText('Online')).toBeInTheDocument();
    expect(within(card).getByText('Library: ProductieLib')).toBeInTheDocument();
    expect(within(card).getByText('42 ms')).toBeInTheDocument();
  });

  it('shows eDOCS offline, with no library or latency to report', async () => {
    mockBusinessApi.edocs.status.mockResolvedValue({ success: true, data: { status: 'down' } });

    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);

    const card = cardFor('eDOCS');
    expect(await within(card).findByText('Offline')).toBeInTheDocument();
    expect(within(card).queryByText(/Library:/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/ ms/)).not.toBeInTheDocument();
  });

  it('says the eDOCS status is unavailable when the call fails', async () => {
    // "Status niet beschikbaar" is a different claim from "Offline": the first
    // says this dashboard could not ask, the second says eDOCS answered no.
    mockBusinessApi.edocs.status.mockRejectedValue(new Error('network'));

    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);

    const card = cardFor('eDOCS');
    expect(await within(card).findByText('Status niet beschikbaar')).toBeInTheDocument();
  });

  it('shows Operaton offline with its latency', async () => {
    mockBusinessApi.health.mockResolvedValue({
      dependencies: { operaton: { status: 'down', latency: 900 } },
    });

    render(<GereedschapSection user={{ sub: '1', roles: ['admin'] } as never} />);

    const card = cardFor('Operaton Cockpit');
    expect(await within(card).findByText('Offline')).toBeInTheDocument();
    expect(within(card).getByText('900 ms')).toBeInTheDocument();
  });

  it('says the Operaton status is unavailable when the health call fails', async () => {
    mockBusinessApi.health.mockRejectedValue(new Error('network'));

    render(<GereedschapSection user={{ sub: '1', roles: ['admin'] } as never} />);

    const card = cardFor('Operaton Cockpit');
    expect(await within(card).findByText('Status niet beschikbaar')).toBeInTheDocument();
  });

  it('shows an external dependency as offline', async () => {
    mockBusinessApi.externalStatus.mockResolvedValue({
      success: true,
      data: { lde: { status: 'down', latency: 1200 } },
    });

    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);

    const card = cardFor('Linked Data Explorer');
    expect(await within(card).findByText('Offline')).toBeInTheDocument();
    expect(within(card).getByText('1200 ms')).toBeInTheDocument();
  });

  it('says an external status is unavailable when that dependency is absent from the response', async () => {
    mockBusinessApi.externalStatus.mockResolvedValue({
      success: true,
      data: { lde: { status: 'up', latency: 30 } },
    });

    render(<GereedschapSection user={{ sub: '1', roles: [] } as never} />);

    await within(cardFor('Linked Data Explorer')).findByText('Online');
    expect(within(cardFor('TriplyDB')).getByText('Status niet beschikbaar')).toBeInTheDocument();
  });

  it('treats a user with no roles at all the same as a user with an empty role list', async () => {
    // `user` is null on a route rendered before the token is parsed.
    render(<GereedschapSection user={null as never} />);
    expect(await screen.findByText('CPSV Editor')).toBeInTheDocument();
    expect(screen.queryByText('Operaton Cockpit')).not.toBeInTheDocument();
  });
});
