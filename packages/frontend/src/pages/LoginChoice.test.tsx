// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginChoice from './LoginChoice';
import { BOARDS } from './login-choice/boards.config';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

vi.mock('../components/LoginChoice/BoardCard', () => ({
  default: ({ board, onOpen }: never) => (
    <div>
      <span>board:{(board as { id: string }).id}</span>
      <button onClick={() => (onOpen as () => void)()}>open-{(board as { id: string }).id}</button>
    </div>
  ),
}));

vi.mock('./ChangelogPanel', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>changelog-open</div> : null),
}));

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('LoginChoice', () => {
  it('renders every board with the total count', () => {
    render(<LoginChoice />);

    expect(screen.getByText(`${BOARDS.length} borden · allemaal beschikbaar`)).toBeInTheDocument();
    for (const board of BOARDS) {
      expect(screen.getByText(`board:${board.id}`)).toBeInTheDocument();
    }
  });

  it('the header "Inloggen" link starts a medewerker login with no target and navigates to /auth', async () => {
    const user = userEvent.setup();
    render(<LoginChoice />);

    await user.click(screen.getByRole('button', { name: /Inloggen/ }));

    expect(sessionStorage.getItem('selected_idp')).toBe('medewerker');
    expect(sessionStorage.getItem('post_login_redirect')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('the citizen link starts a DigiD login and navigates to /auth', async () => {
    const user = userEvent.setup();
    render(<LoginChoice />);

    await user.click(screen.getByRole('button', { name: /Inwoner\? Log in met DigiD/ }));

    expect(sessionStorage.getItem('selected_idp')).toBe('digid');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('opening a board sets the post-login redirect target and username hint', async () => {
    const user = userEvent.setup();
    render(<LoginChoice />);

    const first = BOARDS[0];
    await user.click(screen.getByRole('button', { name: `open-${first.id}` }));

    expect(sessionStorage.getItem('post_login_redirect')).toBe(first.route);
    expect(sessionStorage.getItem('username_hint')).toBe(first.testUser);
    expect(sessionStorage.getItem('selected_idp')).toBe('medewerker');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('"Changelog" opens the ChangelogPanel', async () => {
    const user = userEvent.setup();
    render(<LoginChoice />);

    expect(screen.queryByText('changelog-open')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Changelog' }));

    expect(screen.getByText('changelog-open')).toBeInTheDocument();
  });
});
