// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InfraCommandPalette from './InfraCommandPalette';
import { getMockPortfolio } from '../../pages/infra-board/infra-board.data';

const mockUseActivePhase1 = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return { ...actual, useActivePhase1: mockUseActivePhase1 };
});

beforeEach(() => {
  mockUseActivePhase1.mockReturnValue({
    data: null,
    loading: false,
    error: false,
    reload: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('InfraCommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <InfraCommandPalette
        open={false}
        onClose={vi.fn()}
        onSelectView={vi.fn()}
        onSelectProject={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the three static views plus every mock portfolio project when open', () => {
    render(
      <InfraCommandPalette
        open
        onClose={vi.fn()}
        onSelectView={vi.fn()}
        onSelectProject={vi.fn()}
      />
    );

    expect(screen.getByText('Mijn dag')).toBeInTheDocument();
    expect(screen.getByText('Portfolio')).toBeInTheDocument();
    expect(screen.getByText('Beheer · RIP Fase 1')).toBeInTheDocument();
    const first = getMockPortfolio()[0];
    expect(screen.getByText(`${first.nr} · ${first.naam}`)).toBeInTheDocument();
  });

  it('includes live RIP Fase 1 instances tagged "live"', () => {
    mockUseActivePhase1.mockReturnValue({
      data: [
        {
          id: 'i1',
          startTime: '2026-01-01T00:00:00Z',
          projectNumber: '99999',
          projectName: 'Live project',
          edocsWorkspaceId: 'w1',
          leadRole: 'projectleider',
        },
      ],
      loading: false,
      error: false,
      reload: vi.fn(),
    });

    const { container } = render(
      <InfraCommandPalette
        open
        onClose={vi.fn()}
        onSelectView={vi.fn()}
        onSelectProject={vi.fn()}
      />
    );

    const liveItem = screen.getByText('99999 · Live project').closest('li')!;
    expect(container.contains(liveItem)).toBe(true);
    expect(liveItem).toHaveTextContent('live');
  });

  it('typing filters the list, showing "Niets gevonden" when nothing matches', async () => {
    const user = userEvent.setup();
    render(
      <InfraCommandPalette
        open
        onClose={vi.fn()}
        onSelectView={vi.fn()}
        onSelectProject={vi.fn()}
      />
    );

    await user.type(
      screen.getByPlaceholderText('Spring naar weergave of project (nr, naam)…'),
      'zzz-nonexistent'
    );

    expect(screen.getByText(/Niets gevonden voor/)).toBeInTheDocument();
  });

  it('selecting a view calls onSelectView and closes the palette', async () => {
    const onSelectView = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <InfraCommandPalette
        open
        onClose={onClose}
        onSelectView={onSelectView}
        onSelectProject={vi.fn()}
      />
    );

    await user.click(screen.getByText('Portfolio'));

    expect(onSelectView).toHaveBeenCalledWith('portfolio');
    expect(onClose).toHaveBeenCalled();
  });

  it('selecting a mock project calls onSelectProject with its ref and closes the palette', async () => {
    const onSelectProject = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <InfraCommandPalette
        open
        onClose={onClose}
        onSelectView={vi.fn()}
        onSelectProject={onSelectProject}
      />
    );

    const first = getMockPortfolio()[0];
    await user.click(screen.getByText(`${first.nr} · ${first.naam}`));

    expect(onSelectProject).toHaveBeenCalledWith({ nr: first.nr });
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape closes the palette', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <InfraCommandPalette
        open
        onClose={onClose}
        onSelectView={vi.fn()}
        onSelectProject={vi.fn()}
      />
    );

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('ArrowDown then Enter selects the second item (Portfolio)', async () => {
    const onSelectView = vi.fn();
    const user = userEvent.setup();
    render(
      <InfraCommandPalette
        open
        onClose={vi.fn()}
        onSelectView={onSelectView}
        onSelectProject={vi.fn()}
      />
    );

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSelectView).toHaveBeenCalledWith('portfolio');
  });
});
