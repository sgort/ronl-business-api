// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CapacityClaimSection from './CapacityClaimSection';

const mockBusinessApi = vi.hoisted(() => ({
  process: { start: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const managerUser = { sub: '1', roles: ['manager'] } as never;

beforeEach(() => {
  mockBusinessApi.process.start.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CapacityClaimSection', () => {
  it('shows an access-restricted panel for a user without the manager role', () => {
    render(<CapacityClaimSection user={{ sub: '1', roles: [] } as never} />);
    expect(screen.getByText('Access restricted')).toBeInTheDocument();
  });

  it('starting the claim successfully shows the confirmation screen', async () => {
    const user = userEvent.setup();
    render(<CapacityClaimSection user={managerUser} />);

    await user.click(screen.getByRole('button', { name: 'Start capacity claim' }));

    expect(await screen.findByText('Capacity claim started')).toBeInTheDocument();
    expect(mockBusinessApi.process.start).toHaveBeenCalledWith(
      'ManagementCapacityClaimProcess',
      {}
    );
  });

  it('"Start another capacity claim" returns to the start screen', async () => {
    const user = userEvent.setup();
    render(<CapacityClaimSection user={managerUser} />);

    await user.click(screen.getByRole('button', { name: 'Start capacity claim' }));
    await screen.findByText('Capacity claim started');
    await user.click(screen.getByRole('button', { name: 'Start another capacity claim' }));

    expect(screen.getByText('Management capacity claim')).toBeInTheDocument();
  });

  it('shows an error message when the process fails to start', async () => {
    mockBusinessApi.process.start.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<CapacityClaimSection user={managerUser} />);

    await user.click(screen.getByRole('button', { name: 'Start capacity claim' }));

    expect(await screen.findByText('Capacity claim could not be started.')).toBeInTheDocument();
  });

  it('shows an error message when the request throws', async () => {
    mockBusinessApi.process.start.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<CapacityClaimSection user={managerUser} />);

    await user.click(screen.getByRole('button', { name: 'Start capacity claim' }));

    expect(await screen.findByText('Capacity claim could not be started.')).toBeInTheDocument();
  });
});
