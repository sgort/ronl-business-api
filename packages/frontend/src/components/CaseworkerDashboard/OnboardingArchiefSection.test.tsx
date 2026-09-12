// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingArchiefSection from './OnboardingArchiefSection';

const mockBusinessApi = vi.hoisted(() => ({
  hr: { completed: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const mockDecisionViewer = vi.hoisted(() => vi.fn());
vi.mock('../DecisionViewer', () => ({
  default: (props: { processInstanceId: string; showFallback: boolean }) => {
    mockDecisionViewer(props);
    return <div>decision-viewer</div>;
  },
}));

const hrUser = { sub: '1', roles: ['hr-medewerker'] } as never;

const record = {
  id: 'r1',
  startTime: '2026-06-01T00:00:00Z',
  endTime: '2026-06-10T00:00:00Z',
  employeeId: 'e-42',
  firstName: 'Sanne',
  lastName: 'Bakker',
};

beforeEach(() => {
  mockBusinessApi.hr.completed.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OnboardingArchiefSection', () => {
  it('shows an access-restricted panel for a user without the hr-medewerker role', () => {
    render(<OnboardingArchiefSection user={{ sub: '1', roles: [] } as never} />);
    expect(screen.getByText('Toegang beperkt')).toBeInTheDocument();
    expect(mockBusinessApi.hr.completed).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no completed onboardings', async () => {
    render(<OnboardingArchiefSection user={hrUser} />);
    expect(await screen.findByText('Geen afgeronde onboardingen gevonden.')).toBeInTheDocument();
  });

  it('shows an error state and "Opnieuw proberen" retries the load', async () => {
    mockBusinessApi.hr.completed.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<OnboardingArchiefSection user={hrUser} />);

    expect(
      await screen.findByText('Afgeronde onboardingen konden niet worden geladen.')
    ).toBeInTheDocument();

    mockBusinessApi.hr.completed.mockResolvedValue({ success: true, data: [record] });
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(await screen.findByText(/Sanne Bakker/)).toBeInTheDocument();
  });

  it('expanding a record shows the DecisionViewer, collapsing hides it again', async () => {
    mockBusinessApi.hr.completed.mockResolvedValue({ success: true, data: [record] });
    const user = userEvent.setup();
    render(<OnboardingArchiefSection user={hrUser} />);

    const toggle = await screen.findByRole('button', { name: /Sanne Bakker/ });
    expect(screen.queryByText('decision-viewer')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText('decision-viewer')).toBeInTheDocument();
    expect(mockDecisionViewer).toHaveBeenCalledWith(
      expect.objectContaining({ processInstanceId: 'r1', showFallback: false })
    );

    await user.click(toggle);
    expect(screen.queryByText('decision-viewer')).not.toBeInTheDocument();
  });
});
