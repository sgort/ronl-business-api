// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RipFase1Section from './RipFase1Section';

const mockBusinessApi = vi.hoisted(() => ({
  process: { start: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const infraUser = { sub: '1', roles: ['infra-projectteam'] } as never;

beforeEach(() => {
  mockBusinessApi.process.start.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RipFase1Section', () => {
  it('shows an access-restricted panel for a user without the infra-projectteam role', () => {
    render(<RipFase1Section user={{ sub: '1', roles: [] } as never} />);
    expect(screen.getByText('Toegang beperkt')).toBeInTheDocument();
  });

  it('starting the process successfully shows the confirmation screen', async () => {
    const user = userEvent.setup();
    render(<RipFase1Section user={infraUser} />);

    await user.click(screen.getByRole('button', { name: 'RIP Fase 1 starten' }));

    expect(await screen.findByText('RIP Fase 1 gestart')).toBeInTheDocument();
    expect(mockBusinessApi.process.start).toHaveBeenCalledWith('RipPhase1Process', {});
  });

  it('"Nieuw RIP Fase 1 proces starten" returns to the start screen', async () => {
    const user = userEvent.setup();
    render(<RipFase1Section user={infraUser} />);

    await user.click(screen.getByRole('button', { name: 'RIP Fase 1 starten' }));
    await screen.findByText('RIP Fase 1 gestart');
    await user.click(screen.getByRole('button', { name: 'Nieuw RIP Fase 1 proces starten' }));

    expect(screen.getByText('RIP Fase 1 — Projectdefinitie')).toBeInTheDocument();
  });

  it('shows the process key, Operaton instance, and cause when the start fails with error details', async () => {
    mockBusinessApi.process.start.mockResolvedValue({
      success: false,
      error: { details: 'Validation failed', instance: 'pi-99' },
    });
    const user = userEvent.setup();
    render(<RipFase1Section user={infraUser} />);

    await user.click(screen.getByRole('button', { name: 'RIP Fase 1 starten' }));

    expect(await screen.findByText('RipPhase1Process')).toBeInTheDocument();
    expect(screen.getByText('pi-99')).toBeInTheDocument();
    expect(screen.getByText('Validation failed')).toBeInTheDocument();
  });

  it('shows "onbekend" for the Operaton instance when the thrown error carries no details', async () => {
    mockBusinessApi.process.start.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<RipFase1Section user={infraUser} />);

    await user.click(screen.getByRole('button', { name: 'RIP Fase 1 starten' }));

    expect(await screen.findByText('onbekend')).toBeInTheDocument();
  });
});
