// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FaseladderOverview from './FaseladderOverview';
import { RIP_STAGES, RIP_PHASES } from '../../pages/infra-board/rip-phases.catalog';
import { getMockPhaseCounts } from '../../pages/infra-board/infra-board.data';
import { combinePhaseCounts, getKlaarCounts } from '../../pages/infra-board/rip-phase-counts';

// Mirrors the mocked useLivePhaseCounts data below, normalized to phase
// codes the same way the component does — so expected values account for
// the live contribution, not just mock data.
const LIVE_COUNTS = { 'R2.1': { wip: 1, gereed: 2, geparkeerd: 0 } };

function kpiValue(name: string): string | null {
  const label = screen.getByText(name);
  const kpi = label.closest('.pb-kpi');
  return kpi?.querySelector('.v')?.textContent ?? null;
}

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
    data: { deployedKeys: ['RipR21Process'] },
    loading: false,
    error: false,
    reload: vi.fn(),
  });
  mockUseLivePhaseCounts.mockReturnValue({
    data: { counts: { RipR21Process: { wip: 1, gereed: 2 } } },
    loading: false,
    error: false,
    reload: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FaseladderOverview', () => {
  it('renders one row per phase, grouped under five stage headers', () => {
    render(<FaseladderOverview onOpenPhase={vi.fn()} />);
    RIP_PHASES.forEach((p) => {
      // getAllByText, not getByText: R5.3 is startable now that it is modelled,
      // so its code appears in the start control as well as its own row.
      expect(screen.getAllByText(p.code, { exact: false }).length).toBeGreaterThan(0);
    });
    RIP_STAGES.forEach((s) => {
      expect(screen.getAllByText(s.name, { exact: false }).length).toBeGreaterThan(0);
    });
  });

  it('shows a live annotation only for R2.1, which has nonzero live counts', () => {
    render(<FaseladderOverview onOpenPhase={vi.fn()} />);
    expect(screen.getAllByText('1 live').length).toBeGreaterThan(0);
  });

  it('renders the deployment pill for R2.1 as gedeployed', () => {
    render(<FaseladderOverview onOpenPhase={vi.fn()} />);
    expect(screen.getByText('Gedeployed')).toBeInTheDocument();
  });

  it('calls onOpenPhase with the phase code when a row is clicked', async () => {
    const onOpenPhase = vi.fn();
    const user = userEvent.setup();
    render(<FaseladderOverview onOpenPhase={onOpenPhase} />);

    await user.click(screen.getByText('R2.1', { exact: false }));

    expect(onOpenPhase).toHaveBeenCalledWith('R2.1');
  });

  it('shows Fasen in uitvoering as the total WIP across all phases (mock + live), not a phase-count capped at 9', () => {
    render(<FaseladderOverview onOpenPhase={vi.fn()} />);
    const mockCounts = getMockPhaseCounts();
    const totalMockWip = Object.values(mockCounts).reduce((sum, c) => sum + c.wip, 0);
    const expected = totalMockWip + 1; // + the mocked live R2.1 wip:1
    expect(expected).toBeGreaterThan(9); // sanity: proves this isn't a 9-capped phase count
    expect(kpiValue('Fasen in uitvoering')).toContain(String(expected));
  });

  it('shows Deelprocessen inzetbaar as "N / 12"', () => {
    render(<FaseladderOverview onOpenPhase={vi.fn()} />);
    expect(kpiValue('Deelprocessen inzetbaar')).toBe('1 / 12');
  });

  it('shows Klaar om te starten as the total Klaar across all non-beyond phases, not deployed-only', () => {
    render(<FaseladderOverview onOpenPhase={vi.fn()} />);
    const combined = combinePhaseCounts(getMockPhaseCounts(), LIVE_COUNTS);
    const klaar = getKlaarCounts(RIP_PHASES, combined);
    const totalKlaar = RIP_PHASES.filter((p) => !p.beyond).reduce(
      (sum, p) => sum + (klaar[p.code] ?? 0),
      0
    );
    // Only R2.1 is deployed in this test's mock; a deployed-only total would
    // be far smaller than the true portfolio-wide total computed above.
    expect(totalKlaar).toBeGreaterThan(1);
    expect(kpiValue('Klaar om te starten')).toContain(String(totalKlaar));
  });

  it('renders a zero-value Klaar cell as "—", not "0"', () => {
    render(<FaseladderOverview onOpenPhase={vi.fn()} />);
    const mockCounts = getMockPhaseCounts();
    const klaar = getKlaarCounts(RIP_PHASES, mockCounts);
    const zeroPhase = RIP_PHASES.find((p, i) => i > 0 && !p.beyond && klaar[p.code] === 0);
    expect(zeroPhase).toBeDefined();
    const row = screen.getByText(zeroPhase!.code, { exact: false }).closest('tr');
    expect(row?.textContent).toContain('—');
  });

  it('shows R5.3 in the WIP column like any other phase', () => {
    // The column is still labelled "WIP / Geparkeerd" here; R5.3 was the only
    // phase that could ever produce a geparkeerd figure and no longer does.
    render(<FaseladderOverview onOpenPhase={vi.fn()} />);
    const mockCounts = getMockPhaseCounts();
    const r53 = RIP_PHASES.find((p) => p.code === 'R5.3')!;
    const row = screen.getAllByText(r53.code, { exact: false })[0].closest('tr');
    expect(row?.textContent).toContain(String(mockCounts['R5.3'].wip));
  });
});

describe('FaseladderOverview before the live data arrives', () => {
  it('renders the ladder from mock counts alone while both hooks are still empty', () => {
    // Both hooks return { data: undefined } on the first render and after a
    // failed fetch. The ladder is the board's landing view, so it has to draw
    // itself from the mock baseline rather than blanking or throwing.
    mockUseDeployedProcessKeys.mockReturnValue({
      data: undefined,
      loading: true,
      error: false,
      reload: vi.fn(),
    });
    mockUseLivePhaseCounts.mockReturnValue({
      data: undefined,
      loading: true,
      error: false,
      reload: vi.fn(),
    });

    render(<FaseladderOverview onOpenPhase={vi.fn()} />);

    for (const stage of RIP_STAGES) {
      expect(screen.getByText(stage.name)).toBeInTheDocument();
    }
    // Nothing is deployed, so no sub-process is deployable yet.
    expect(kpiValue('Deelprocessen inzetbaar')).toBe(`0 / ${RIP_PHASES.length}`);
  });

  it('treats a phase the live feed says nothing about as zero, not blank', () => {
    mockUseDeployedProcessKeys.mockReturnValue({
      data: { deployedKeys: [] },
      loading: false,
      error: false,
      reload: vi.fn(),
    });
    mockUseLivePhaseCounts.mockReturnValue({
      data: { counts: {} },
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    const { container } = render(<FaseladderOverview onOpenPhase={vi.fn()} />);

    expect(container.textContent).not.toContain('NaN');
    expect(container.textContent).not.toContain('undefined');
  });
});
