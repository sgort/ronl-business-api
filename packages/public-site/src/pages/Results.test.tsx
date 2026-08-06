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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Results t={t} lang="nl" />
    </MemoryRouter>
  );
}

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
});
