// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CuratieSpecSection from './CuratieSpecSection';

const mockTriggerCurationCycle = vi.hoisted(() => vi.fn());
vi.mock('../../services/pa.api', () => ({ triggerCurationCycle: mockTriggerCurationCycle }));

afterEach(() => {
  vi.clearAllMocks();
});

describe('CuratieSpecSection', () => {
  it('shows a running state then a success message once the cycle starts', async () => {
    mockTriggerCurationCycle.mockResolvedValue({ started: true, tenantId: 't1' });
    const user = userEvent.setup();

    render(<CuratieSpecSection />);
    await user.click(screen.getByRole('button', { name: 'Curatie nu uitvoeren' }));

    await waitFor(() => expect(screen.getByText(/Cycle gestart om/)).toBeInTheDocument());
    expect(mockTriggerCurationCycle).toHaveBeenCalled();
  });

  it('shows an error message when the cycle fails to start', async () => {
    mockTriggerCurationCycle.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();

    render(<CuratieSpecSection />);
    await user.click(screen.getByRole('button', { name: 'Curatie nu uitvoeren' }));

    await waitFor(() => expect(screen.getByText(/Kon de cycle niet starten/)).toBeInTheDocument());
  });

  it('disables the button while the cycle is running', async () => {
    let resolve!: () => void;
    mockTriggerCurationCycle.mockReturnValue(new Promise((r) => (resolve = () => r(undefined))));
    const user = userEvent.setup();

    render(<CuratieSpecSection />);
    const button = screen.getByRole('button', { name: 'Curatie nu uitvoeren' });
    await user.click(button);

    expect(screen.getByRole('button', { name: '⏳ Bezig…' })).toBeDisabled();
    resolve();
  });
});
