// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ZoekcriteriaSection from './ZoekcriteriaSection';
import type { SavedSearch } from '../../services/pa.api';
import { makePaDataStub } from '../../test/paData.stub';
import { expectMockNamesRealExports } from '../../test/mockModule';

const mockFetchSearches = vi.hoisted(() => vi.fn());
const mockCreateSearch = vi.hoisted(() => vi.fn());
const mockUpdateSearch = vi.hoisted(() => vi.fn());
const mockDeleteSavedSearch = vi.hoisted(() => vi.fn());
const paApi = {
  fetchSearches: mockFetchSearches,
  createSearch: mockCreateSearch,
  updateSearch: mockUpdateSearch,
  deleteSavedSearch: mockDeleteSavedSearch,
};
// Built on the real module so a member nobody stubbed is not silently missing.
vi.mock('../../services/pa.api', async (importActual) => ({
  ...(await importActual<typeof import('../../services/pa.api')>()),
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

describe('the pa.api mock', () => {
  it('only names exports the real module has', async () => {
    await expectMockNamesRealExports(vi.importActual('../../services/pa.api'), paApi);
  });
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

describe('ZoekcriteriaSection best-case verdicts', () => {
  // Each card carries a prediction of what the cron will do with the criterion.
  // The prediction is the whole point of the screen -- a curator writes a
  // criterion here and gets told, before saving, whether it will ever match.
  const verdictFor = async (over: Partial<SavedSearch>) => {
    mockFetchSearches.mockResolvedValue([makeSearch(over)]);
    const view = render(<ZoekcriteriaSection />);
    await screen.findByText('Jeugdzorg');
    return view;
  };

  it('calls a TK criterion with terms a strong hit', async () => {
    await verdictFor({ query: { q: 'stikstof', source: ['tk'] } } as Partial<SavedSearch>);
    expect(screen.getByText('Wordt opgepikt')).toBeInTheDocument();
    expect(screen.getByText(/sterke treffer/)).toBeInTheDocument();
  });

  it('calls an EU criterion with terms a strong hit too', async () => {
    await verdictFor({ query: { q: 'stikstof', source: ['eu'] } } as Partial<SavedSearch>);
    expect(screen.getByText('Wordt opgepikt')).toBeInTheDocument();
  });

  it('reaches the threshold for an OB criterion with terms, with no type bump', async () => {
    // 'ob' gets no zwaartype bump in the engine, so it clears the threshold on
    // the term matches alone -- a different route to the same verdict.
    await verdictFor({ query: { q: 'stikstof', source: ['ob'] } } as Partial<SavedSearch>);
    expect(screen.getByText('Wordt opgepikt')).toBeInTheDocument();
  });

  it('makes a media criterion conditional on a regional mention', async () => {
    await verdictFor({ query: { q: 'stikstof', source: ['media'] } } as Partial<SavedSearch>);
    expect(screen.getByText('Alleen bij regio-match')).toBeInTheDocument();
    expect(screen.getByText(/zonder Flevoland-context/)).toBeInTheDocument();
  });

  it('warns that a criterion with no search term will never be picked up', async () => {
    await verdictFor({ query: { q: '', source: ['tk'] } } as Partial<SavedSearch>);
    expect(screen.getByText('Wordt niet opgepikt')).toBeInTheDocument();
    expect(screen.getByText(/geen rake term/)).toBeInTheDocument();
  });

  it('splits an OR query into separate terms and caps the match bonus', async () => {
    await verdictFor({
      query: { q: 'stikstof OR ammoniak OR natuur OR piekbelaster', source: ['tk'] },
    } as Partial<SavedSearch>);
    for (const term of ['stikstof', 'ammoniak', 'natuur', 'piekbelaster']) {
      expect(screen.getByText(term)).toBeInTheDocument();
    }
    expect(screen.getByText('Wordt opgepikt')).toBeInTheDocument();
  });

  it('survives a dossier-watch row that stores no query at all', async () => {
    // The WatchBell writes a row with an empty query and no source list. It
    // still has to render here rather than throwing on .includes(undefined).
    mockFetchSearches.mockResolvedValue([
      { id: 'w1', dossierId: 'jeugdzorg', scope: 'tenant', tags: [], notify: true, query: {} },
    ] as unknown as SavedSearch[]);

    render(<ZoekcriteriaSection />);

    expect(await screen.findByText('Jeugdzorg')).toBeInTheDocument();
    expect(screen.getByText('Wordt niet opgepikt')).toBeInTheDocument();
  });
});

describe('ZoekcriteriaSection scoring modal', () => {
  it('walks all three worked examples and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<ZoekcriteriaSection />);
    await screen.findByText('Jeugdzorg');

    await user.click(screen.getAllByLabelText('Toelichting scoringsmodel')[0]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Media-treffer' }));
    expect(screen.getByRole('tab', { name: 'Media-treffer' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await user.click(screen.getByRole('tab', { name: 'Geen treffer' }));
    expect(screen.getByRole('tab', { name: 'Geen treffer' })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    // Clicking inside the box must not close it -- the overlay handler is the
    // only one that should.
    await user.click(screen.getByRole('tab', { name: 'Sterke treffer' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes on the close button', async () => {
    const user = userEvent.setup();
    render(<ZoekcriteriaSection />);
    await screen.findByText('Jeugdzorg');

    await user.click(screen.getAllByLabelText('Toelichting scoringsmodel')[0]);
    await user.click(screen.getByLabelText('Sluiten'));

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ZoekcriteriaSection score simulator', () => {
  const openEditor = async (over: Partial<SavedSearch>) => {
    mockFetchSearches.mockResolvedValue([makeSearch(over)]);
    const user = userEvent.setup();
    render(<ZoekcriteriaSection />);
    await screen.findByText('Jeugdzorg');
    await user.click(screen.getAllByRole('button', { name: /Bewerk/i })[0]);
    return user;
  };

  it('names a Tweede Kamer example document and scores it above the threshold', async () => {
    const user = await openEditor({
      query: { q: 'stikstof', source: ['tk'] },
    } as Partial<SavedSearch>);

    expect(screen.getByText(/voorbeelddocument · TK/)).toBeInTheDocument();
    expect(screen.getByText('Motie')).toBeInTheDocument();
    expect(screen.getByText(/wordt ingediend bij de Tweede Kamer/)).toBeInTheDocument();
    expect(screen.getByText(/wordt kandidaat/)).toBeInTheDocument();

    // Turn off the heavy-type bump and the title match: nothing matched, so the
    // noise floor applies and the document is filtered out.
    await user.click(screen.getByRole('switch', { name: 'Zwaar documenttype' }));
    await user.click(screen.getByRole('switch', { name: 'Zoekwoord in de titel' }));
    expect(screen.getByText(/geen term raak/)).toBeInTheDocument();

    // A tag match alone is enough to lift it off the noise floor, so the
    // verdict stops citing "no term matched" even though nothing in the title
    // hit.
    await user.click(screen.getByRole('switch', { name: 'Tag komt ook voor' }));
    expect(screen.queryByText(/geen term raak/)).toBeNull();
  });

  it('names an EU example document', async () => {
    await openEditor({ query: { q: 'stikstof', source: ['eu'] } } as Partial<SavedSearch>);
    expect(screen.getByText(/voorbeelddocument · EU/)).toBeInTheDocument();
  });

  it('swaps the heavy-type toggle for a regional-mention toggle on media', async () => {
    await openEditor({ query: { q: 'stikstof', source: ['media'] } } as Partial<SavedSearch>);

    expect(screen.getByText(/voorbeelddocument · Media/)).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Provincie Flevoland gevonden' })
    ).toBeInTheDocument();
    expect(screen.getByText('Flevoland-artikel')).toBeInTheDocument();
    expect(screen.getByText(/verschijnt in het nieuws/)).toBeInTheDocument();
  });

  it('offers no type toggle at all for an OB criterion', async () => {
    await openEditor({ query: { q: 'stikstof', source: ['ob'] } } as Partial<SavedSearch>);

    expect(screen.getByText(/voorbeelddocument · OB/)).toBeInTheDocument();
    expect(screen.getByText('publicatie')).toBeInTheDocument();
    expect(screen.getByText(/wordt gepubliceerd in de OB/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Zwaar documenttype' })).toBeNull();
  });
});
