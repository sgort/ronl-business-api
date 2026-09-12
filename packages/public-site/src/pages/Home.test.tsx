// packages/public-site/src/pages/Home.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';
import { translations } from '../i18n';
import * as api from '../lib/api';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    getBerichten: vi.fn(),
    getNieuws: vi.fn(),
    getProducten: vi.fn(),
    getRegelcatalogus: vi.fn(),
    getProcessen: vi.fn(),
  };
});

function allSourcesRespond() {
  vi.mocked(api.getBerichten).mockResolvedValue({ items: [], total: 12 });
  vi.mocked(api.getNieuws).mockResolvedValue({ items: [], total: 34 });
  vi.mocked(api.getProducten).mockResolvedValue({ items: [], total: 56 });
  vi.mocked(api.getRegelcatalogus).mockResolvedValue({
    services: [{ id: 's1' }, { id: 's2' }],
    organizations: [],
    concepts: [],
    rules: [],
  } as unknown as api.RegelcatalogusData);
  vi.mocked(api.getProcessen).mockResolvedValue([
    { key: 'p1' },
    { key: 'p2' },
    { key: 'p3' },
  ] as unknown as api.PublicProcess[]);
}

const renderHome = (lang: 'nl' | 'en' = 'nl') =>
  render(
    <MemoryRouter>
      <Home t={translations[lang]} lang={lang} />
    </MemoryRouter>
  );

beforeEach(() => vi.clearAllMocks());

describe('Home', () => {
  it('shows a per-source item count once every source has answered', async () => {
    allSourcesRespond();
    renderHome();

    await waitFor(() => expect(screen.getByText(/^12 items/)).toBeInTheDocument());
    for (const n of ['12', '34', '56', '2', '3']) {
      expect(screen.getByText(new RegExp(`^${n} items`))).toBeInTheDocument();
    }
  });

  it('reports zero for a source that failed, and the real count for the rest', async () => {
    // Promise.allSettled, not Promise.all: one dead upstream must not blank out
    // the whole card grid. A failed source reads as 0, which is the honest
    // answer for "how many of these can this site show you right now".
    allSourcesRespond();
    vi.mocked(api.getNieuws).mockRejectedValue(new Error('rijksoverheid down'));
    vi.mocked(api.getProcessen).mockRejectedValue(new Error('camunda down'));
    renderHome();

    await waitFor(() => expect(screen.getByText(/^12 items/)).toBeInTheDocument());
    expect(screen.getAllByText(/^0 items/)).toHaveLength(2);
  });

  it('still renders every card when all five sources fail', async () => {
    vi.mocked(api.getBerichten).mockRejectedValue(new Error('down'));
    vi.mocked(api.getNieuws).mockRejectedValue(new Error('down'));
    vi.mocked(api.getProducten).mockRejectedValue(new Error('down'));
    vi.mocked(api.getRegelcatalogus).mockRejectedValue(new Error('down'));
    vi.mocked(api.getProcessen).mockRejectedValue(new Error('down'));
    renderHome();

    await waitFor(() => expect(screen.getAllByText(/^0 items/)).toHaveLength(5));
  });

  it('does not set state after the page has been navigated away from', async () => {
    // The counts land well after first paint, and a visitor who clicks through
    // immediately unmounts this page mid-flight. Without the cancelled guard
    // React logs a state-update-on-unmounted-component warning on every such
    // click, which is how a real leak would be hidden in the noise.
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
    let resolveBerichten!: (v: { items: never[]; total: number }) => void;
    vi.mocked(api.getBerichten).mockReturnValue(
      new Promise((resolve) => {
        resolveBerichten = resolve;
      })
    );
    vi.mocked(api.getNieuws).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.getProducten).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.getRegelcatalogus).mockResolvedValue({
      services: [],
      organizations: [],
      concepts: [],
      rules: [],
    } as unknown as api.RegelcatalogusData);
    vi.mocked(api.getProcessen).mockResolvedValue([]);

    const { unmount } = renderHome();
    unmount();
    resolveBerichten({ items: [], total: 12 });
    await new Promise((r) => setTimeout(r, 0));

    expect(errors).toEqual([]);
    spy.mockRestore();
  });

  it('shows a placeholder rather than a zero while the counts are still loading', () => {
    // A zero here would be a wrong statement of fact, not a neutral default --
    // and it is the first thing a visitor reads on the page.
    allSourcesRespond();
    renderHome();
    expect(screen.getAllByText(/^… items/).length).toBeGreaterThan(0);
  });

  it('navigates to the search route with the query encoded', () => {
    allSourcesRespond();
    renderHome();

    fireEvent.change(screen.getByLabelText(translations.nl.searchLabel), {
      target: { value: 'groen & blauw' },
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(translations.nl.search) }));

    expect(navigate).toHaveBeenCalledWith('/zoeken?q=groen%20%26%20blauw');
  });

  it('navigates to the bare search route for an empty query', () => {
    allSourcesRespond();
    renderHome();

    fireEvent.click(screen.getByRole('button', { name: new RegExp(translations.nl.search) }));

    expect(navigate).toHaveBeenCalledWith('/zoeken');
  });

  it('renders the search hint in English when lang=en', () => {
    allSourcesRespond();
    renderHome('en');
    expect(screen.getByText(/Searches all five sources at once/)).toBeInTheDocument();
  });
});
