// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
