// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BronnenSection from './BronnenSection';
import { expectMockNamesRealExports } from '../../test/mockModule';

const paApi = vi.hoisted(() => ({
  fetchSourcesStatus: vi.fn(),
  fetchFeedToken: vi.fn(),
}));
const mockFetchSourcesStatus = paApi.fetchSourcesStatus;
const mockFetchFeedToken = paApi.fetchFeedToken;

vi.mock('../../services/keycloak', () => ({
  default: { authenticated: false, token: undefined, updateToken: vi.fn() },
}));
// Built on the real module so a member nobody stubbed is not silently missing.
vi.mock('../../services/pa.api', async (importActual) => ({
  ...(await importActual<typeof import('../../services/pa.api')>()),
  ...paApi,
}));

function makeStatus(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tk: true,
    ob: true,
    eu: true,
    epTeksten: false,
    media: true,
    feeds: [
      {
        id: 'provincie-flevoland',
        name: 'Provincie Flevoland',
        homepage: 'flevoland.nl',
        url: 'https://flevoland.nl/rss',
        type: 'regional',
        alwaysFlevoland: true,
      },
      {
        id: 'nos-algemeen',
        name: 'NOS Algemeen',
        homepage: 'nos.nl',
        url: 'https://nos.nl/rss',
        type: 'national',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockFetchSourcesStatus.mockResolvedValue(makeStatus());
  mockFetchFeedToken.mockResolvedValue({ url: 'https://example.test/feed?token=abc' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('the pa.api mock', () => {
  it('only names exports the real module has', async () => {
    // Spreading the real module covers a missing member; this covers a renamed
    // or mistyped one, which spreading cannot see.
    await expectMockNamesRealExports(vi.importActual('../../services/pa.api'), paApi);
  });
});

describe('BronnenSection', () => {
  it('shows a loading state before the status resolves', () => {
    mockFetchSourcesStatus.mockReturnValue(new Promise(() => {}));
    render(<BronnenSection />);
    expect(screen.getByText('Laden…')).toBeInTheDocument();
  });

  it('renders each source group with its resolved status once loaded', async () => {
    render(<BronnenSection />);

    expect(await screen.findByText('Tweede Kamer')).toBeInTheDocument();
    expect(screen.getByText('Europees Parlement · Ingediende teksten')).toBeInTheDocument();
    // eu enabled -> actief, epTeksten disabled -> uitgeschakeld
    expect(screen.getByText('EU_SOURCE_ENABLED = true')).toBeInTheDocument();
    expect(screen.getByText('EP_TEXTS_SUBMITTED_ENABLED = false')).toBeInTheDocument();
  });

  it('builds the Media & omgeving group from the live feeds list', async () => {
    render(<BronnenSection />);

    expect(await screen.findByText('Provincie Flevoland')).toBeInTheDocument();
    expect(screen.getByText('NOS Algemeen')).toBeInTheDocument();
    expect(screen.getByText('Sociale media & omgeving')).toBeInTheDocument();
  });

  it('fetching the personal feed link shows the URL and copying it uses the clipboard', async () => {
    const user = userEvent.setup();
    // user-event installs its own clipboard stub on setup() — override it after,
    // not in beforeEach, or setup() clobbers a pre-installed mock.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    render(<BronnenSection />);

    await user.click(await screen.findByRole('button', { name: /Persoonlijke RSS-feed ophalen/ }));

    expect(await screen.findByText('https://example.test/feed?token=abc')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Kopieer' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://example.test/feed?token=abc'
    );
    expect(await screen.findByText('✓ Gekopieerd')).toBeInTheDocument();
  });
});
