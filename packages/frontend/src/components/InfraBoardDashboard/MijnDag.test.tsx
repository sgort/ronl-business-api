// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MijnDag from './MijnDag';
import { MIJN_PROJECT_NRS, getMockPortfolio } from '../../pages/infra-board/infra-board.data';

const mockUseOpenTasks = vi.hoisted(() => vi.fn());
vi.mock('../../services/infra.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/infra.api')>();
  return { ...actual, useOpenTasks: mockUseOpenTasks };
});

const mockGetUser = vi.hoisted(() => vi.fn());
vi.mock('../../services/keycloak', () => ({ getUser: mockGetUser }));

beforeEach(() => {
  mockUseOpenTasks.mockReturnValue({ data: null, loading: false, error: false, reload: vi.fn() });
  mockGetUser.mockReturnValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('MijnDag', () => {
  it('greets the user by first name', () => {
    render(
      <MijnDag
        user={{ sub: '1', name: 'Sanne Bakker', roles: [] } as never}
        onOpenProject={vi.fn()}
        onGotoPortfolio={vi.fn()}
      />
    );
    expect(screen.getByRole('heading', { name: 'Goedemorgen, Sanne' })).toBeInTheDocument();
  });

  it("falls back to keycloak's getUser() when no user prop is given", () => {
    mockGetUser.mockReturnValue({ sub: '1', name: 'Joost Veenstra', roles: [] });
    render(<MijnDag user={null} onOpenProject={vi.fn()} onGotoPortfolio={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Goedemorgen, Joost' })).toBeInTheDocument();
  });

  it('clicking "Hele portfolio" calls onGotoPortfolio', async () => {
    const onGotoPortfolio = vi.fn();
    const user = userEvent.setup();
    render(<MijnDag user={null} onOpenProject={vi.fn()} onGotoPortfolio={onGotoPortfolio} />);

    await user.click(screen.getByRole('button', { name: /Hele portfolio/ }));

    expect(onGotoPortfolio).toHaveBeenCalled();
  });

  it('clicking a project in "Mijn projecten" calls onOpenProject with its project number', async () => {
    const onOpenProject = vi.fn();
    const user = userEvent.setup();
    render(<MijnDag user={null} onOpenProject={onOpenProject} onGotoPortfolio={vi.fn()} />);

    const firstNr = MIJN_PROJECT_NRS[0];
    const project = getMockPortfolio().find((p) => p.nr === firstNr)!;
    await user.click(screen.getByText(project.naam));

    expect(onOpenProject).toHaveBeenCalledWith({ nr: firstNr });
  });
});
