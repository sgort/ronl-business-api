// packages/public-site/src/pages/Results.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, searchPublic: vi.fn() };
});

const t = translations.nl;

function renderAt(path: string, lang: 'nl' | 'en' = 'nl') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Results t={translations[lang]} lang={lang} />
    </MemoryRouter>
  );
}

const emptyResult = {
  items: [],
  total: 0,
  facets: { soort: [], bron: [], doelgroep: [] },
} as unknown as Awaited<ReturnType<typeof api.searchPublic>>;

beforeEach(() => vi.clearAllMocks());

describe('Results', () => {
  it('shows a result count and hits once loaded', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [
        {
          id: 'a',
          slug: 'a',
          type: 'regel',
          title: 'Zorgtoeslag',
          summary: 'Toeslag',
          org: 'X',
          date: null,
          audience: [],
          external: null,
          facts: [],
          tech: [],
        },
      ],
      total: 1,
      facets: { soort: [['regel', 1]], bron: [['X', 1]], doelgroep: [] },
    });
    renderAt('/zoeken?q=zorg');
    await waitFor(() => expect(screen.getByText(/1 resultaten voor/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Zorgtoeslag/ })).toBeInTheDocument();
  });

  it('shows the empty state with a real suggestion when there are no hits', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [],
      total: 0,
      facets: { soort: [], bron: [], doelgroep: [] },
    });
    renderAt('/zoeken?q=xyzxyz');
    await waitFor(() => expect(screen.getByText(t.noResults)).toBeInTheDocument());
    expect(screen.getByText(t.noResultsBody)).toBeInTheDocument();
  });

  it('checking a type facet adds it to the URL and re-queries', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [],
      total: 0,
      facets: { soort: [['regel', 2]], bron: [], doelgroep: [] },
    });
    renderAt('/zoeken');
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Regel/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Regel/ }));
    await waitFor(() =>
      expect(api.searchPublic).toHaveBeenLastCalledWith(
        expect.objectContaining({ soort: ['regel'] })
      )
    );
  });

  it('the result counter lives in an aria-live=polite region', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [],
      total: 0,
      facets: { soort: [], bron: [], doelgroep: [] },
    });
    renderAt('/zoeken');
    await waitFor(() => {
      const region = screen.getByText(/items in de kennisbank/).closest('[aria-live]');
      expect(region).toHaveAttribute('aria-live', 'polite');
    });
  });

  it('"clear filters" resets soort/bron/doelgroep but keeps q', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [],
      total: 0,
      facets: { soort: [['regel', 1]], bron: [], doelgroep: [] },
    });
    renderAt('/zoeken?q=zorg&soort=regel');
    await waitFor(() => expect(screen.getByText(/Alle filters wissen/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Alle filters wissen/));
    await waitFor(() =>
      expect(api.searchPublic).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'zorg', soort: [], bron: [], doelgroep: [] })
      )
    );
  });
  it('reports a failed search in an alert instead of an empty result list', async () => {
    // A zero here would say "we looked and there is nothing", which is a
    // different and wrong claim when the backend never answered.
    vi.mocked(api.searchPublic).mockRejectedValue(new Error('backend down'));

    renderAt('/zoeken?q=zorg');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Zoeken is mislukt.'));
  });

  it('translates the failure message', async () => {
    vi.mocked(api.searchPublic).mockRejectedValue(new Error('backend down'));

    renderAt('/zoeken?q=zorg', 'en');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Search failed.'));
  });

  it('reports zero results, not a blank, when a failed search left no data', async () => {
    vi.mocked(api.searchPublic).mockRejectedValue(new Error('backend down'));

    renderAt('/zoeken?q=zorg');

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/^0 /)).toBeInTheDocument();
  });

  it('translates the searching placeholder', () => {
    vi.mocked(api.searchPublic).mockReturnValue(new Promise(() => {}));

    renderAt('/zoeken?q=zorg', 'en');

    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('unchecking an already-selected facet removes it from the URL', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      ...emptyResult,
      facets: { soort: [['regel', 3]], bron: [], doelgroep: [] },
    } as unknown as Awaited<ReturnType<typeof api.searchPublic>>);

    renderAt('/zoeken?q=zorg&soort=regel');

    const checkbox = await screen.findByRole('checkbox', { name: /Regel/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(vi.mocked(api.searchPublic).mock.calls.at(-1)![0].soort).toEqual([])
    );
  });

  it('shows a facet value the label table does not know, verbatim', async () => {
    // The soort facet is built from whatever the backend returns; a new source
    // type must show up as itself rather than disappear from the filter list.
    vi.mocked(api.searchPublic).mockResolvedValue({
      ...emptyResult,
      facets: { soort: [['verordening', 2]], bron: [], doelgroep: [] },
    } as unknown as Awaited<ReturnType<typeof api.searchPublic>>);

    renderAt('/zoeken?q=zorg');

    expect(await screen.findByRole('checkbox', { name: /verordening/ })).toBeInTheDocument();
  });

  it('does not set state after the results page has been navigated away from', async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args));
    let resolveSearch!: (v: Awaited<ReturnType<typeof api.searchPublic>>) => void;
    vi.mocked(api.searchPublic).mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );

    const { unmount } = renderAt('/zoeken?q=zorg');
    unmount();
    resolveSearch(emptyResult);
    await new Promise((r) => setTimeout(r, 0));

    expect(errors).toEqual([]);
    spy.mockRestore();
  });
});
