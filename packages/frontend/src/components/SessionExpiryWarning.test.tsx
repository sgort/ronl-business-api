// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionExpiryWarning from './SessionExpiryWarning';

const mockKeycloak = vi.hoisted(() => ({
  authenticated: true,
  tokenParsed: { exp: 0 },
  updateToken: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../services/keycloak', () => ({
  default: mockKeycloak,
}));

function setExpiryInSeconds(seconds: number) {
  mockKeycloak.tokenParsed.exp = Math.floor(Date.now() / 1000) + seconds;
}

describe('SessionExpiryWarning', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = true;
    mockKeycloak.updateToken.mockReset().mockResolvedValue(true);
    mockKeycloak.login.mockReset();
    mockKeycloak.logout.mockReset();
  });

  it('renders nothing when the token has plenty of time left', () => {
    setExpiryInSeconds(600);
    render(<SessionExpiryWarning />);
    expect(screen.queryByText(/Sessie verloopt binnenkort/)).not.toBeInTheDocument();
  });

  it('shows the warning modal once the token enters the warning window', () => {
    setExpiryInSeconds(90);
    render(<SessionExpiryWarning />);
    expect(screen.getByText(/Sessie verloopt binnenkort/)).toBeInTheDocument();
  });

  it('extends the session and hides the modal on "Sessie verlengen"', async () => {
    const user = userEvent.setup();
    setExpiryInSeconds(90);
    render(<SessionExpiryWarning />);

    await user.click(screen.getByRole('button', { name: 'Sessie verlengen' }));

    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(-1);
    expect(screen.queryByText(/Sessie verloopt binnenkort/)).not.toBeInTheDocument();
  });

  it('logs out on "Uitloggen"', async () => {
    const user = userEvent.setup();
    setExpiryInSeconds(90);
    render(<SessionExpiryWarning />);

    await user.click(screen.getByRole('button', { name: 'Uitloggen' }));

    expect(mockKeycloak.logout).toHaveBeenCalledWith({ redirectUri: window.location.origin });
  });

  it('stays silent for an anonymous visitor', () => {
    // The component is mounted app-wide, including on the public routes; with
    // no session there is nothing to warn about.
    mockKeycloak.authenticated = false;
    setExpiryInSeconds(10);
    render(<SessionExpiryWarning />);
    expect(screen.queryByText(/Sessie verloopt binnenkort/)).not.toBeInTheDocument();
  });

  it('stays silent when the adapter has no parsed token yet', () => {
    // Between init() and the first token exchange, keycloak.authenticated can
    // already be true while tokenParsed is still undefined.
    const saved = mockKeycloak.tokenParsed;
    (mockKeycloak as { tokenParsed?: { exp: number } }).tokenParsed = undefined;
    try {
      render(<SessionExpiryWarning />);
      expect(screen.queryByText(/Sessie verloopt binnenkort/)).not.toBeInTheDocument();
    } finally {
      mockKeycloak.tokenParsed = saved;
    }
  });

  it('says the session has expired once the countdown passes zero', () => {
    setExpiryInSeconds(-30);
    render(<SessionExpiryWarning />);
    expect(screen.getByText(/Uw sessie is verlopen\./)).toBeInTheDocument();
    expect(screen.queryByText(/verloopt over/)).not.toBeInTheDocument();
  });

  it('counts down in minutes and zero-padded seconds', () => {
    setExpiryInSeconds(65);
    render(<SessionExpiryWarning />);
    expect(screen.getByText(/verloopt over 1:0\d\./)).toBeInTheDocument();
  });

  it('sends the user to the login page when the forced refresh fails', async () => {
    // The refresh token or the SSO session is gone; re-authenticating is the
    // only thing "Sessie verlengen" can still mean.
    const user = userEvent.setup();
    mockKeycloak.updateToken.mockRejectedValue(new Error('refresh token expired'));
    setExpiryInSeconds(90);
    render(<SessionExpiryWarning />);

    await user.click(screen.getByRole('button', { name: 'Sessie verlengen' }));

    expect(mockKeycloak.login).toHaveBeenCalled();
    expect(screen.getByText(/Sessie verloopt binnenkort/)).toBeInTheDocument();
  });
});

describe('SessionExpiryWarning silent refresh on activity', () => {
  beforeEach(() => {
    mockKeycloak.authenticated = true;
    mockKeycloak.updateToken.mockReset().mockResolvedValue(true);
    mockKeycloak.login.mockReset();
    mockKeycloak.logout.mockReset();
  });

  it('refreshes the token on real interaction, so an active user never sees the modal', () => {
    // Filling in a long form makes no API calls, so without this the token
    // expires under someone who is plainly still working.
    setExpiryInSeconds(600);
    render(<SessionExpiryWarning />);

    fireEvent.keyDown(window, { key: 'a' });

    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(180);
  });

  it('throttles to one refresh attempt however many events fire', () => {
    setExpiryInSeconds(600);
    render(<SessionExpiryWarning />);

    fireEvent.mouseMove(window);
    fireEvent.mouseMove(window);
    fireEvent.scroll(window);
    fireEvent.pointerDown(window);

    expect(mockKeycloak.updateToken).toHaveBeenCalledTimes(1);
  });

  it('ignores activity once the modal is up, so the dialog cannot be yanked away', () => {
    // Merely moving the mouse toward "Sessie verlengen" would otherwise
    // auto-refresh and unmount the dialog before the click lands.
    setExpiryInSeconds(90);
    render(<SessionExpiryWarning />);
    expect(screen.getByText(/Sessie verloopt binnenkort/)).toBeInTheDocument();

    fireEvent.mouseMove(window);

    expect(mockKeycloak.updateToken).not.toHaveBeenCalled();
  });

  it('ignores activity from an anonymous visitor', () => {
    mockKeycloak.authenticated = false;
    render(<SessionExpiryWarning />);

    fireEvent.mouseMove(window);

    expect(mockKeycloak.updateToken).not.toHaveBeenCalled();
  });

  it('swallows a failed silent refresh rather than redirecting mid-typing', () => {
    // The countdown and the modal own re-authentication; a redirect fired from
    // a mousemove would discard whatever the user was filling in.
    mockKeycloak.updateToken.mockRejectedValue(new Error('sso session gone'));
    setExpiryInSeconds(600);
    render(<SessionExpiryWarning />);

    expect(() => fireEvent.mouseMove(window)).not.toThrow();
    expect(mockKeycloak.login).not.toHaveBeenCalled();
  });

  it('unsubscribes from every activity event on unmount', () => {
    setExpiryInSeconds(600);
    const { unmount } = render(<SessionExpiryWarning />);
    unmount();

    fireEvent.mouseMove(window);

    expect(mockKeycloak.updateToken).not.toHaveBeenCalled();
  });
});
