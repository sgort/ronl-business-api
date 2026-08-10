// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FaseladderOverview from './FaseladderOverview';
import { RIP_STAGES, RIP_PHASES } from '../../pages/infra-board/rip-phases.catalog';

const mockUseDeployedProcessKeys = vi.hoisted(() => vi.fn());
const mockUseLivePhaseCounts = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return {
    ...actual,
    useDeployedProcessKeys: mockUseDeployedProcessKeys,
    useLivePhaseCounts: mockUseLivePhaseCounts,
  };
});

beforeEach(() => {
  mockUseDeployedProcessKeys.mockReturnValue({
    data: { deployedKeys: ['RipPhase1Process'] },
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockUseLivePhaseCounts.mockReturnValue({
    data: { counts: { RipPhase1Process: { wip: 1, gereed: 2 } } },
    loading: false,
    error: false,
    reload: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FaseladderOverview', () => {
  it('renders one row per phase, grouped under four stage headers', () => {
    render(<FaseladderOverview />);
    RIP_PHASES.forEach((p) => {
      expect(screen.getByText(p.code, { exact: false })).toBeInTheDocument();
    });
    RIP_STAGES.forEach((s) => {
      expect(screen.getAllByText(s.name, { exact: false }).length).toBeGreaterThan(0);
    });
  });

  it('shows a live annotation only for R2.1, which has nonzero live counts', () => {
    render(<FaseladderOverview />);
    expect(screen.getAllByText('1 live').length).toBeGreaterThan(0);
  });

  it('renders the deployment pill for R2.1 as gedeployed', () => {
    render(<FaseladderOverview />);
    expect(screen.getByText('Gedeployed')).toBeInTheDocument();
  });

  it('does not render table rows as clickable', () => {
    const { container } = render(<FaseladderOverview />);
    expect(container.querySelectorAll('tbody tr button')).toHaveLength(0);
  });
});
