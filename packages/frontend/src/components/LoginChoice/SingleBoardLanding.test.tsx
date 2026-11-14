// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SingleBoardLanding from './SingleBoardLanding';
import { BOARDS } from '../../pages/login-choice/boards.config';
import { SINGLE_BOARD_COPY } from '../../pages/login-choice/single-board.copy';
import type { OrganisationType, TenantConfig } from '../../services/tenant';
import tenantsJson from '../../../public/tenants.json';

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

vi.mock('../../pages/ChangelogPanel', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>changelog-open</div> : null),
}));

const caseworker = BOARDS.find((b) => b.id === 'caseworker')!;

function makeTenant(overrides: Partial<TenantConfig> = {}): TenantConfig {
  return {
    id: 'amsterdam',
    name: 'Amsterdam',
    displayName: 'Gemeente Amsterdam',
    organisationType: 'municipality',
    theme: {
      primary: '#EC0000',
      primaryDark: '#B80000',
      primaryLight: '#FF4444',
      secondary: '#000000',
      accent: '#FFD700',
    },
    contact: { phone: '', email: '', address: '', postalCode: '', city: '' },
    enabled: true,
    boards: ['caseworker'],
    logo: { src: '/tenants/amsterdam/logo.png', shape: 'wide' },
    ...overrides,
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('SingleBoardLanding', () => {
  it.each<Exclude<OrganisationType, 'province'>>(['municipality', 'national', 'commercial'])(
    'shows the %s copy',
    (organisationType) => {
      const copy = SINGLE_BOARD_COPY[organisationType];
      render(<SingleBoardLanding tenant={makeTenant({ organisationType })} board={caseworker} />);

      expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
      expect(screen.getByText(copy.lede)).toBeInTheDocument();
      expect(screen.getByText(copy.note)).toBeInTheDocument();
      for (const [title, body] of copy.points) {
        expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
        expect(screen.getByText(body)).toBeInTheDocument();
      }
    }
  );

  it('shows the eyebrow and footer with the tenant name', () => {
    render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);

    expect(screen.getByText('Werkomgeving · Gemeente Amsterdam')).toBeInTheDocument();
    expect(screen.getByText('© Gemeente Amsterdam · Werkomgeving medewerkers')).toBeInTheDocument();
  });

  it('the CTA stores the board redirect and the tenant test-user hint, then navigates to /auth', async () => {
    const user = userEvent.setup();
    render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);

    await user.click(screen.getByRole('button', { name: /Inloggen als medewerker/ }));

    expect(sessionStorage.getItem('post_login_redirect')).toBe('/dashboard/caseworker');
    expect(sessionStorage.getItem('username_hint')).toBe('test-caseworker-amsterdam');
    expect(sessionStorage.getItem('selected_idp')).toBe('medewerker');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('the top-bar "Inloggen" hints the tenant test caseworker, without a board target', async () => {
    const user = userEvent.setup();
    render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);

    await user.click(screen.getByRole('button', { name: 'Inloggen' }));

    expect(sessionStorage.getItem('post_login_redirect')).toBeNull();
    expect(sessionStorage.getItem('username_hint')).toBe('test-caseworker-amsterdam');
    expect(sessionStorage.getItem('selected_idp')).toBe('medewerker');
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('offers exactly one button named exactly "Inloggen"', () => {
    render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);

    expect(screen.getAllByRole('button', { name: /^Inloggen$/ })).toHaveLength(1);
  });

  it('the DigiD link starts a DigiD login with the tenant test-citizen hint', async () => {
    sessionStorage.setItem('post_login_redirect', '/dashboard/caseworker');
    const user = userEvent.setup();
    render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);

    await user.click(screen.getByRole('button', { name: 'Inwoner? Log in met DigiD' }));

    expect(sessionStorage.getItem('selected_idp')).toBe('digid');
    expect(sessionStorage.getItem('username_hint')).toBe('test-citizen-amsterdam');
    expect(sessionStorage.getItem('post_login_redirect')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
  });

  it('offers no eHerkenning login', () => {
    render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);

    expect(screen.queryByText(/eHerkenning/)).not.toBeInTheDocument();
  });

  it('a wide logo shows the image only', () => {
    render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);
    const banner = screen.getByRole('banner');

    expect(within(banner).getByRole('img', { name: 'Gemeente Amsterdam' })).toHaveAttribute(
      'src',
      '/tenants/amsterdam/logo.png'
    );
    expect(within(banner).queryByText('Werkomgeving medewerkers')).not.toBeInTheDocument();
  });

  it('sizes the top-bar logo from logo.height', () => {
    render(
      <SingleBoardLanding
        tenant={makeTenant({
          logo: { src: '/tenants/heusden/logo.jpg', shape: 'wide', height: 58 },
        })}
        board={caseworker}
      />
    );

    expect(screen.getByRole('img', { name: 'Gemeente Amsterdam' }).parentElement).toHaveStyle({
      height: '58px',
    });
  });

  it('keeps the top-bar logo at 44 px without logo.height', () => {
    render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);

    expect(screen.getByRole('img', { name: 'Gemeente Amsterdam' }).parentElement).toHaveStyle({
      height: '44px',
    });
  });

  it('a square logo shows the image with the display name', () => {
    render(
      <SingleBoardLanding
        tenant={makeTenant({
          id: 'toeslagen',
          displayName: 'Dienst Toeslagen',
          organisationType: 'national',
          logo: { src: '/tenants/toeslagen/logo.png', shape: 'square' },
        })}
        board={caseworker}
      />
    );
    const banner = screen.getByRole('banner');

    expect(within(banner).getByRole('img', { name: 'Dienst Toeslagen' })).toBeInTheDocument();
    expect(within(banner).getByText('Werkomgeving medewerkers')).toBeInTheDocument();
  });

  it('falls back to a text wordmark when the tenant has no logo', () => {
    render(
      <SingleBoardLanding
        tenant={makeTenant({
          id: 'unive',
          displayName: 'Univé Verzekeringen',
          organisationType: 'commercial',
          logo: undefined,
        })}
        board={caseworker}
      />
    );
    const banner = screen.getByRole('banner');

    expect(within(banner).queryByRole('img')).not.toBeInTheDocument();
    expect(within(banner).getByText('Univé')).toBeInTheDocument();
    expect(within(banner).getByText('Verzekeringen · medewerkers')).toBeInTheDocument();
  });

  it('a one-word name gets a wordmark with "medewerkers" underneath', () => {
    render(
      <SingleBoardLanding
        tenant={makeTenant({ id: 'uwv', displayName: 'UWV', logo: undefined })}
        board={caseworker}
      />
    );
    const banner = screen.getByRole('banner');

    expect(within(banner).getByText('UWV')).toBeInTheDocument();
    expect(within(banner).getByText('medewerkers')).toBeInTheDocument();
  });

  it('a province tenant falls back to the municipality copy', () => {
    render(
      <SingleBoardLanding
        tenant={makeTenant({ organisationType: 'province' })}
        board={caseworker}
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: SINGLE_BOARD_COPY.municipality.title })
    ).toBeInTheDocument();
  });

  it('marks the board preview as decorative', () => {
    const { container } = render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);

    const preview = container.querySelector('.shot');
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    expect(preview).toHaveTextContent('Omgevingsvergunning — kap 2 iepen');
  });

  it('"Changelog" opens the ChangelogPanel', async () => {
    const user = userEvent.setup();
    render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);

    await user.click(screen.getByRole('button', { name: 'Changelog' }));

    expect(screen.getByText('changelog-open')).toBeInTheDocument();
  });

  describe('copy overrides and the citizen section', () => {
    // The real entry, so the test follows what /bes actually ships.
    // Through unknown: other entries' contact objects predate TenantContact's shape.
    const bes = (tenantsJson as unknown as { tenants: Record<string, TenantConfig> }).tenants.bes;
    const citizenRegion = () =>
      screen.getByRole('region', { name: 'Regel uw zaken met het openbaar lichaam online.' });

    it('a copy override wins over the organisation-type copy', () => {
      render(<SingleBoardLanding tenant={bes} board={caseworker} />);

      expect(
        screen.getByRole('heading', { level: 1, name: 'Eén werkvoorraad voor drie eilanden.' })
      ).toBeInTheDocument();
      expect(screen.getByText('BON-2026-0412')).toBeInTheDocument();
    });

    it('a tenant without overrides keeps the organisation-type copy', () => {
      render(<SingleBoardLanding tenant={makeTenant({ id: 'heusden' })} board={caseworker} />);

      expect(
        screen.getByRole('heading', { level: 1, name: SINGLE_BOARD_COPY.municipality.title })
      ).toBeInTheDocument();
    });

    it('a preview override without nav2 keeps the base nav2', () => {
      render(<SingleBoardLanding tenant={bes} board={caseworker} />);

      expect(screen.getByText(SINGLE_BOARD_COPY.municipality.preview.nav2)).toBeInTheDocument();
    });

    it('renders the citizen section only when tenant.citizen is set', () => {
      const { unmount } = render(<SingleBoardLanding tenant={bes} board={caseworker} />);
      expect(citizenRegion()).toBeInTheDocument();
      unmount();

      render(<SingleBoardLanding tenant={makeTenant()} board={caseworker} />);
      expect(
        screen.queryByRole('region', { name: 'Regel uw zaken met het openbaar lichaam online.' })
      ).toBeNull();
    });

    it('the citizen button starts a DigiD login with the tenant test-citizen hint', async () => {
      const user = userEvent.setup();
      render(<SingleBoardLanding tenant={bes} board={caseworker} />);

      await user.click(within(citizenRegion()).getByRole('button', { name: /Inloggen met DigiD/ }));

      expect(sessionStorage.getItem('selected_idp')).toBe('digid');
      expect(sessionStorage.getItem('username_hint')).toBe('test-citizen-bes');
      expect(mockNavigate).toHaveBeenCalledWith('/auth');
    });

    it('greetings carry their lang attribute', () => {
      render(<SingleBoardLanding tenant={bes} board={caseworker} />);

      expect(screen.getByText('Bon bini')).toHaveAttribute('lang', 'pap');
      expect(screen.getByText('Welcome')).toHaveAttribute('lang', 'en');
    });

    it('shows the islands and the services', () => {
      render(<SingleBoardLanding tenant={bes} board={caseworker} />);
      const region = citizenRegion();

      for (const name of ['Bonaire', 'Sint Eustatius', 'Saba']) {
        expect(within(region).getByText(name)).toBeInTheDocument();
      }
      for (const title of ['Aanvraag doen', 'Melding maken', 'Status volgen']) {
        expect(within(region).getByText(title)).toBeInTheDocument();
      }
      expect(within(region).getByText(bes.citizen!.note)).toBeInTheDocument();
    });

    it('renders without greetings or islands', () => {
      const { greetings: _g, islands: _i, ...rest } = bes.citizen!;
      render(<SingleBoardLanding tenant={{ ...bes, citizen: rest }} board={caseworker} />);
      const region = citizenRegion();

      expect(within(region).getByText('Aanvraag doen')).toBeInTheDocument();
      expect(within(region).getByText(rest.eyebrow)).toBeInTheDocument();
      // A flag is <img alt="">, which has no img role, so look for the list itself.
      expect(within(region).queryByRole('list', { name: 'Eilanden' })).toBeNull();
      expect(within(region).queryByText('Bonaire')).toBeNull();
      expect(within(region).queryByText('Bon bini')).toBeNull();
    });

    it('shows greeting markup as text', () => {
      const citizen = { ...bes.citizen!, greetings: [{ lang: 'en', text: '<b>x</b>' }] };
      render(<SingleBoardLanding tenant={{ ...bes, citizen }} board={caseworker} />);

      expect(screen.getByText('<b>x</b>')).toBeInTheDocument();
    });
  });
});
