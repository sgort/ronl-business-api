// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const theme = (primary: string) => ({
  primary,
  primaryDark: primary,
  primaryLight: primary,
  secondary: primary,
  accent: primary,
});

function tenant(id: string, extra: Record<string, unknown>) {
  return {
    id,
    name: id,
    displayName: `Gemeente ${id}`,
    organisationType: 'municipality',
    theme: theme('#123456'),
    features: {},
    contact: {},
    enabled: true,
    ...extra,
  };
}

const TENANTS_JSON = {
  default: 'flevoland',
  tenants: {
    flevoland: tenant('flevoland', {
      organisationType: 'province',
      boards: ['caseworker', 'public-affairs', 'infra-board', 'woo'],
    }),
    amsterdam: tenant('amsterdam', { boards: ['caseworker'], theme: theme('#ec0000') }),
    oldtown: tenant('oldtown', { boards: ['caseworker'], enabled: false }),
  },
};

function visit(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  sessionStorage.clear();
  visit('');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(TENANTS_JSON) })
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
  sessionStorage.clear();
  visit('');
});

describe('LoginChoice', () => {
  it('renders every board with the total count', () => {
    render(<LoginChoice />);

    expect(screen.getByText(`${BOARDS.length} borden · allemaal beschikbaar`)).toBeInTheDocument();
    for (const board of BOARDS) {
      expect(screen.getByText(`board:${board.id}`)).toBeInTheDocument();
    }
  });

  it('the header "Inloggen" link starts a medewerker login with no target, hinting the Flevoland test caseworker', async () => {
    const user = userEvent.setup();
    render(<LoginChoice />);

    await user.click(screen.getByRole('button', { name: 'Inloggen' }));

    expect(sessionStorage.getItem('selected_idp')).toBe('medewerker');
    expect(sessionStorage.getItem('post_login_redirect')).toBeNull();
    expect(sessionStorage.getItem('username_hint')).toBe('test-caseworker-flevoland');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('the citizen link starts a DigiD login hinting the Flevoland test citizen', async () => {
    const user = userEvent.setup();
    render(<LoginChoice />);

    await user.click(screen.getByRole('button', { name: /Inwoner\? Log in met DigiD/ }));

    expect(sessionStorage.getItem('selected_idp')).toBe('digid');
    expect(sessionStorage.getItem('username_hint')).toBe('test-citizen-flevoland');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('the Flevoland button starts an Entra ID login and navigates to /auth', async () => {
    const user = userEvent.setup();
    render(<LoginChoice />);

    await user.click(screen.getByRole('button', { name: /Inloggen met uw Flevoland-account/ }));

    expect(sessionStorage.getItem('selected_idp')).toBe('entra-flevoland');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('the Flevoland button clears a redirect and username hint left by an earlier board click', async () => {
    sessionStorage.setItem('post_login_redirect', '/dashboard/woo');
    sessionStorage.setItem('username_hint', 'test-woo-flevoland');
    const user = userEvent.setup();
    render(<LoginChoice />);

    await user.click(screen.getByRole('button', { name: /Inloggen met uw Flevoland-account/ }));

    expect(sessionStorage.getItem('post_login_redirect')).toBeNull();
    expect(sessionStorage.getItem('username_hint')).toBeNull();
    expect(sessionStorage.getItem('selected_idp')).toBe('entra-flevoland');
  });

  it('"Bekijk de borden" remains as a link to the boards section', () => {
    render(<LoginChoice />);

    expect(screen.getByRole('link', { name: 'Bekijk de borden' })).toHaveAttribute(
      'href',
      '#boards'
    );
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

  describe('tenant landing', () => {
    it('?tenant=amsterdam shows the single-board layout, themed for the tenant', async () => {
      visit('?tenant=amsterdam');
      render(<LoginChoice />);

      expect(
        await screen.findByRole('button', { name: /Inloggen als medewerker/ })
      ).toBeInTheDocument();
      expect(screen.getByText('Werkomgeving · Gemeente amsterdam')).toBeInTheDocument();
      expect(screen.queryByText(/borden · allemaal beschikbaar/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Flevoland-account/ })).not.toBeInTheDocument();
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#ec0000');
    });

    it('renders nothing until the named tenant is resolved, so Flevoland never flashes', () => {
      visit('?tenant=amsterdam');
      vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
      const { container } = render(<LoginChoice />);

      expect(container).toBeEmptyDOMElement();
    });

    it('no ?tenant= shows the Flevoland grid', async () => {
      render(<LoginChoice />);

      await waitFor(() =>
        expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#123456')
      );
      expect(
        screen.getByText(`${BOARDS.length} borden · allemaal beschikbaar`)
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Inloggen als medewerker/ })
      ).not.toBeInTheDocument();
    });

    it.each([
      ['an unknown tenant', '?tenant=nowhere'],
      ['a disabled tenant', '?tenant=oldtown'],
    ])('%s falls back to the Flevoland grid', async (_label, search) => {
      visit(search);
      render(<LoginChoice />);

      expect(
        await screen.findByText(`${BOARDS.length} borden · allemaal beschikbaar`)
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Inloggen als medewerker/ })
      ).not.toBeInTheDocument();
    });

    it('falls back to the Flevoland grid when tenants.json cannot be loaded', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      visit('?tenant=amsterdam');
      render(<LoginChoice />);

      expect(
        await screen.findByText(`${BOARDS.length} borden · allemaal beschikbaar`)
      ).toBeInTheDocument();
    });
  });
});
