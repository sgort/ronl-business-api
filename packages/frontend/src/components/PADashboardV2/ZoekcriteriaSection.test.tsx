// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZoekcriteriaSection from './ZoekcriteriaSection';
import type { SavedSearch } from '../../services/pa.api';
import { makePaDataStub } from '../../test/paData.stub';

const mockFetchSearches = vi.hoisted(() => vi.fn());
const mockCreateSearch = vi.hoisted(() => vi.fn());
const mockUpdateSearch = vi.hoisted(() => vi.fn());
const mockDeleteSavedSearch = vi.hoisted(() => vi.fn());
vi.mock('../../services/pa.api', () => ({
  fetchSearches: mockFetchSearches,
  createSearch: mockCreateSearch,
  updateSearch: mockUpdateSearch,
  deleteSavedSearch: mockDeleteSavedSearch,
}));

const mockToggleSearchNotify = vi.hoisted(() => vi.fn());
vi.mock('../../pages/public-affairs-v2/PaDataProvider', () => ({
  usePaData: () =>
    makePaDataStub({
      dossiers: {
        data: [{ id: 'jeugdzorg', naam: 'Jeugdzorg' }],
        status: 'ok',
        refetch: vi.fn(),
      },
      toggleSearchNotify: mockToggleSearchNotify,
    }),
}));

function makeSearch(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: 's1',
    dossierId: 'jeugdzorg',
    scope: 'tenant',
    query: { q: 'stikstof', source: ['tk'] },
    tags: [],
    notify: false,
    ...overrides,
  } as SavedSearch;
}

beforeEach(() => {
  mockFetchSearches.mockResolvedValue([makeSearch()]);
  mockCreateSearch.mockResolvedValue(undefined);
  mockUpdateSearch.mockResolvedValue(undefined);
  mockDeleteSavedSearch.mockResolvedValue(undefined);
  mockToggleSearchNotify.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ZoekcriteriaSection', () => {
  it('groups a loaded criterion under its dossier and shows the team-criteria count', async () => {
    render(<ZoekcriteriaSection />);

    expect(await screen.findByText('Jeugdzorg')).toBeInTheDocument();
    expect(screen.getByText('stikstof')).toBeInTheDocument();
    const stat = screen.getByText('team-criteria in de cron').previousElementSibling;
    expect(stat).toHaveTextContent('1');
  });

  it('a criterion with no dossier lands in the topic/watchlist group', async () => {
    mockFetchSearches.mockResolvedValue([makeSearch({ id: 's2', dossierId: null })]);
    render(<ZoekcriteriaSection />);

    expect(await screen.findByText('Zonder dossier · topic & watchlist')).toBeInTheDocument();
  });

  it('creating a new criterion sends terms/sources through createSearch and reloads', async () => {
    const user = userEvent.setup();
    render(<ZoekcriteriaSection />);
    await screen.findByText('stikstof');

    await user.click(screen.getByRole('button', { name: '+ Nieuw zoekcriterium' }));
    await user.type(screen.getByPlaceholderText('term toevoegen…'), 'netcongestie{Enter}');

    mockFetchSearches.mockResolvedValue([
      makeSearch(),
      makeSearch({
        id: 's3',
        dossierId: null,
        query: { q: 'netcongestie', source: ['tk', 'ob'], types: [] },
      }),
    ]);
    await user.click(screen.getByRole('button', { name: 'Criterium toevoegen' }));

    await waitFor(() =>
      expect(mockCreateSearch).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'netcongestie', scope: 'tenant' })
      )
    );
  });

  it('editing a criterion and saving calls updateSearch with the new scope', async () => {
    const user = userEvent.setup();
    render(<ZoekcriteriaSection />);
    await screen.findByText('stikstof');

    await user.click(screen.getByRole('button', { name: 'Bewerken' }));
    await user.click(screen.getByRole('button', { name: 'Wijzigingen opslaan' }));

    await waitFor(() =>
      expect(mockUpdateSearch).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ q: 'stikstof', scope: 'tenant' })
      )
    );
  });

  it('promoting a personal criterion to team calls updateSearch with scope tenant', async () => {
    mockFetchSearches.mockResolvedValue([makeSearch({ scope: 'user' })]);
    const user = userEvent.setup();
    render(<ZoekcriteriaSection />);

    await user.click(await screen.findByRole('button', { name: /↗ team/ }));

    await waitFor(() => expect(mockUpdateSearch).toHaveBeenCalledWith('s1', { scope: 'tenant' }));
  });

  it('toggling the watch bell calls toggleSearchNotify with the flipped value', async () => {
    const user = userEvent.setup();
    render(<ZoekcriteriaSection />);
    await screen.findByText('stikstof');

    await user.click(screen.getByTitle('Volgen — meldingen bij nieuwe signalen'));

    await waitFor(() => expect(mockToggleSearchNotify).toHaveBeenCalledWith('s1', true));
  });

  it('deleting a criterion calls deleteSavedSearch and removes it from the list', async () => {
    const user = userEvent.setup();
    render(<ZoekcriteriaSection />);
    await screen.findByText('stikstof');

    await user.click(screen.getByRole('button', { name: 'Verwijderen' }));

    await waitFor(() => expect(mockDeleteSavedSearch).toHaveBeenCalledWith('s1'));
    expect(screen.queryByText('stikstof')).not.toBeInTheDocument();
  });

  it('opening the scoring modal from a card shows the explainer and closes on click', async () => {
    const user = userEvent.setup();
    render(<ZoekcriteriaSection />);
    await screen.findByText('stikstof');

    await user.click(screen.getByRole('button', { name: 'Toelichting scoringsmodel' }));
    expect(screen.getByText('Hoe scoort de cron een document?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Begrepen' }));
    expect(screen.queryByText('Hoe scoort de cron een document?')).not.toBeInTheDocument();
  });
});
