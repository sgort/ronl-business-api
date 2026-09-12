// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProcessStepsTimeline from './ProcessStepsTimeline';
import type { ActivityHistoryItem } from '@ronl/shared';

const mockBusinessApi = vi.hoisted(() => ({
  process: { activityHistory: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

function makeStep(overrides: Partial<ActivityHistoryItem> = {}): ActivityHistoryItem {
  return {
    id: 'a1',
    activityId: 'Task_1',
    activityName: 'Intake beoordelen',
    activityType: 'userTask',
    assignee: null,
    startTime: '2026-07-01T10:00:00Z',
    endTime: '2026-07-01T10:05:00Z',
    durationInMillis: 300000,
    canceled: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockBusinessApi.process.activityHistory.mockResolvedValue({ success: true, data: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProcessStepsTimeline', () => {
  it('shows a loading message before the history resolves', () => {
    mockBusinessApi.process.activityHistory.mockReturnValue(new Promise(() => {}));
    render(<ProcessStepsTimeline instanceId="pi-1" />);
    expect(screen.getByText('Processtappen laden…')).toBeInTheDocument();
  });

  it('shows an error message when the history fails to load', async () => {
    mockBusinessApi.process.activityHistory.mockResolvedValue({ success: false });
    render(<ProcessStepsTimeline instanceId="pi-1" />);
    expect(
      await screen.findByText('Processtappen konden niet worden geladen.')
    ).toBeInTheDocument();
  });

  it('shows an error message when the request throws', async () => {
    mockBusinessApi.process.activityHistory.mockRejectedValue(new Error('network'));
    render(<ProcessStepsTimeline instanceId="pi-1" />);
    expect(
      await screen.findByText('Processtappen konden niet worden geladen.')
    ).toBeInTheDocument();
  });

  it('shows an empty state when there are no steps', async () => {
    render(<ProcessStepsTimeline instanceId="pi-1" />);
    expect(await screen.findByText('Geen processtappen.')).toBeInTheDocument();
  });

  it('renders a step with its label, type, and "Afgerond" status', async () => {
    mockBusinessApi.process.activityHistory.mockResolvedValue({
      success: true,
      data: [makeStep()],
    });
    render(<ProcessStepsTimeline instanceId="pi-1" />);

    expect(await screen.findByText('Intake beoordelen')).toBeInTheDocument();
    expect(screen.getByText('Gebruikerstaak')).toBeInTheDocument();
    expect(screen.getByText('Afgerond')).toBeInTheDocument();
  });

  it('falls back to activityId when activityName is null', async () => {
    mockBusinessApi.process.activityHistory.mockResolvedValue({
      success: true,
      data: [makeStep({ activityName: null })],
    });
    render(<ProcessStepsTimeline instanceId="pi-1" />);
    expect(await screen.findByText('Task_1')).toBeInTheDocument();
  });

  it('shows "Loopt nog" for a step with no endTime', async () => {
    mockBusinessApi.process.activityHistory.mockResolvedValue({
      success: true,
      data: [makeStep({ endTime: null })],
    });
    render(<ProcessStepsTimeline instanceId="pi-1" />);
    expect(await screen.findByText('Loopt nog')).toBeInTheDocument();
  });

  it('shows "Afgebroken" for a canceled step', async () => {
    mockBusinessApi.process.activityHistory.mockResolvedValue({
      success: true,
      data: [makeStep({ canceled: true })],
    });
    render(<ProcessStepsTimeline instanceId="pi-1" />);
    expect(await screen.findByText('Afgebroken')).toBeInTheDocument();
  });

  it('dims automated step types and labels them correctly', async () => {
    mockBusinessApi.process.activityHistory.mockResolvedValue({
      success: true,
      data: [makeStep({ activityType: 'serviceTask', activityName: 'Auto-check' })],
    });
    render(<ProcessStepsTimeline instanceId="pi-1" />);

    expect(await screen.findByText('Servicetaak')).toBeInTheDocument();
    expect(screen.getByText('Auto-check')).toHaveClass('text-gray-500');
  });
});
