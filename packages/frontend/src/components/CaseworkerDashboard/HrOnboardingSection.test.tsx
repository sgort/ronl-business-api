// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HrOnboardingSection from './HrOnboardingSection';

const mockBusinessApi = vi.hoisted(() => ({
  process: { start: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const hrUser = { sub: '1', roles: ['hr-medewerker'] } as never;

beforeEach(() => {
  mockBusinessApi.process.start.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('HrOnboardingSection', () => {
  it('shows an access-restricted panel for a user without the hr-medewerker role', () => {
    render(<HrOnboardingSection user={{ sub: '1', roles: [] } as never} />);
    expect(screen.getByText('Toegang beperkt')).toBeInTheDocument();
  });

  it('shows the access-restricted panel when there is no user', () => {
    render(<HrOnboardingSection user={null} />);
    expect(screen.getByText('Toegang beperkt')).toBeInTheDocument();
  });

  it('starting the process successfully shows the confirmation screen', async () => {
    const user = userEvent.setup();
    render(<HrOnboardingSection user={hrUser} />);

    await user.click(screen.getByRole('button', { name: 'Onboardingsproces starten' }));

    expect(await screen.findByText('Onboardingsproces gestart')).toBeInTheDocument();
    expect(mockBusinessApi.process.start).toHaveBeenCalledWith('HrOnboardingProcess', {});
  });

  it('"Nieuw onboardingsproces starten" returns to the start screen', async () => {
    const user = userEvent.setup();
    render(<HrOnboardingSection user={hrUser} />);

    await user.click(screen.getByRole('button', { name: 'Onboardingsproces starten' }));
    await screen.findByText('Onboardingsproces gestart');
    await user.click(screen.getByRole('button', { name: 'Nieuw onboardingsproces starten' }));

    expect(screen.getByText('Medewerker onboarden')).toBeInTheDocument();
  });

  it('shows an error message when the process fails to start', async () => {
    mockBusinessApi.process.start.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<HrOnboardingSection user={hrUser} />);

    await user.click(screen.getByRole('button', { name: 'Onboardingsproces starten' }));

    expect(
      await screen.findByText('Onboardingsproces kon niet worden gestart.')
    ).toBeInTheDocument();
  });

  it('shows an error message when the request throws', async () => {
    mockBusinessApi.process.start.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<HrOnboardingSection user={hrUser} />);

    await user.click(screen.getByRole('button', { name: 'Onboardingsproces starten' }));

    expect(
      await screen.findByText('Onboardingsproces kon niet worden gestart.')
    ).toBeInTheDocument();
  });
});
