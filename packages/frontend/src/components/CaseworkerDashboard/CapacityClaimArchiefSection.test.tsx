// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CapacityClaimArchiefSection from './CapacityClaimArchiefSection';

const mockBusinessApi = vi.hoisted(() => ({
  capacityClaim: { completed: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const mockDocumentsViewer = vi.hoisted(() => vi.fn());
vi.mock('./CapacityClaimDocumentsViewer', () => ({
  default: (props: { instanceId: string }) => {
    mockDocumentsViewer(props);
    return <div>documents-viewer</div>;
  },
}));

const authorisedUser = { sub: '1', roles: ['manager'] } as never;

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    startTime: '2026-06-01T00:00:00Z',
    endTime: '2026-06-10T00:00:00Z',
    jobTitle: 'Senior beleidsadviseur',
    requestType: 'new',
    boardDecision: 'approved',
    advisoryGroup: 'HRM',
    ...overrides,
  };
}

beforeEach(() => {
  mockBusinessApi.capacityClaim.completed.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CapacityClaimArchiefSection', () => {
  it('shows an access-restricted panel for a user without an authorised role', () => {
    render(<CapacityClaimArchiefSection user={{ sub: '1', roles: ['caseworker'] } as never} />);
    expect(screen.getByText('Access restricted')).toBeInTheDocument();
    expect(mockBusinessApi.capacityClaim.completed).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no completed claims', async () => {
    render(<CapacityClaimArchiefSection user={authorisedUser} />);
    expect(await screen.findByText('No completed capacity claims found.')).toBeInTheDocument();
  });

  it('shows an error state and "Try again" retries the load', async () => {
    mockBusinessApi.capacityClaim.completed.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<CapacityClaimArchiefSection user={authorisedUser} />);

    expect(
      await screen.findByText('Completed capacity claims could not be loaded.')
    ).toBeInTheDocument();

    mockBusinessApi.capacityClaim.completed.mockResolvedValue({
      success: true,
      data: [makeRecord()],
    });
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(/Senior beleidsadviseur/)).toBeInTheDocument();
  });

  it('falls back to "Capacity claim" when the job title is a placeholder dash', async () => {
    mockBusinessApi.capacityClaim.completed.mockResolvedValue({
      success: true,
      data: [makeRecord({ jobTitle: '—' })],
    });
    render(<CapacityClaimArchiefSection user={authorisedUser} />);
    expect(await screen.findByText(/Capacity claim/)).toBeInTheDocument();
  });

  it.each([
    ['approved', 'bg-green-50'],
    ['rejected', 'bg-red-50'],
    ['pending', 'bg-gray-50'],
  ])('applies the right tone class for a "%s" board decision', async (decision, toneClass) => {
    mockBusinessApi.capacityClaim.completed.mockResolvedValue({
      success: true,
      data: [makeRecord({ boardDecision: decision })],
    });
    render(<CapacityClaimArchiefSection user={authorisedUser} />);

    const badge = await screen.findByText(decision);
    expect(badge).toHaveClass(toneClass);
  });

  it('expanding a record shows the CapacityClaimDocumentsViewer with its instance id', async () => {
    mockBusinessApi.capacityClaim.completed.mockResolvedValue({
      success: true,
      data: [makeRecord()],
    });
    const user = userEvent.setup();
    render(<CapacityClaimArchiefSection user={authorisedUser} />);

    const toggle = await screen.findByRole('button', { name: /Senior beleidsadviseur/ });
    expect(screen.queryByText('documents-viewer')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText('documents-viewer')).toBeInTheDocument();
    expect(mockDocumentsViewer).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 'c1' }));
  });
});
