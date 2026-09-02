// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Monitoring from './Monitoring';
import type { FeedItem, Signal } from '@ronl/shared';
import { makePaDataStub } from '../../test/paData.stub';
import { expectMockNamesRealExports } from '../../test/mockModule';

const mockUsePaData = vi.hoisted(() => vi.fn());
vi.mock('./PaDataProvider', () => ({ usePaData: mockUsePaData }));

vi.mock('../../components/PADashboardV2/CuratiePijplijnFlow', () => ({ default: () => null }));

const paApi = vi.hoisted(() => ({
  fetchSignals: vi.fn(),
  fetchInbox: vi.fn(),
  fetchFeed: vi.fn(),
  fetchFeedSources: vi.fn(),
  fetchSearches: vi.fn(),
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  promoteSearchToTenant: vi.fn(),
  promoteToInbox: vi.fn(),
  fetchFeedToken: vi.fn(),
  paTabBronnen: vi.fn(() => ['Tweede Kamer']),
  signalTag: vi.fn(() => 'nl'),
  signalTagLabel: vi.fn(() => 'Politiek NL'),
  BRON_LABEL: { tk: 'Tweede Kamer', ob: 'Officiële Bekendmakingen', eu: 'Europees Parlement' },
}));
// Built on the real module so a member nobody stubbed is not silently missing.
vi.mock('../../services/pa.api', async (importActual) => ({
  ...(await importActual<typeof import('../../services/pa.api')>()),
  ...paApi,
}));

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 's1',
    tab: 'politiek',
    dossierId: 'stikstof',
    title: 'Test signaal',
    src: 'Tweede Kamer',
    bron: 'tk',
    rel: 8,
    impact: 'kans',
    impactLabel: 'Kans',
    duiding: 'Duiding tekst',
    status: 'confirmed',
    ...overrides,
  };
}

/** The shared stub, so a new context member cannot be missed here. */
const defaultPaData = makePaDataStub;

beforeEach(() => {
  mockUsePaData.mockReturnValue(defaultPaData());
  paApi.fetchSignals.mockResolvedValue([]);
  paApi.fetchInbox.mockResolvedValue({ data: [], meta: { total: 0, cap: 100, capped: false } });
  paApi.fetchFeed.mockResolvedValue({ items: [] as FeedItem[], total: 0 });
  paApi.fetchFeedSources.mockResolvedValue(['tk', 'ob', 'media']);
  paApi.fetchSearches.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('the Ongefilterd view', () => {
  // Third segment beside Gecureerd and Inbox: the tab's own sources, fetched
  // raw with no query. The backend has always accepted a null q — the source
  // clients default to it and the curation cycle uses that "blanco" path — but
  // runSearch bailed on an empty string, so there was no way to reach it from
  // the UI without typing something.
  //
  // It appears only on the signaalbronnen. Agenda is a monitoring tab with no
  // TAB_SOURCES entry (it is fed by fetchAgenda, a different path), and Feiten
  // & cijfers is not a monitoring tab at all — it is its own section and never
  // renders this control. So the condition is derived from the source map
  // rather than hardcoded, and a future source tab gets the segment for free.

  it('offers the segment on a signaalbron tab', async () => {
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /Ongefilterd/ })).toBeInTheDocument();
  });

  it('does not offer it on Agenda, which has no feed sources', async () => {
    render(<Monitoring activeTab="agenda" onOpenDossier={vi.fn()} />);
    // Wait for the page to settle so this is not a false pass on an unrendered tree.
    await screen.findByRole('button', { name: /Gecureerd/ });
    expect(screen.queryByRole('button', { name: /Ongefilterd/ })).not.toBeInTheDocument();
  });

  it("fetches the tab's source with no query at all", async () => {
    const user = userEvent.setup();
    render(<Monitoring activeTab="europa" onOpenDossier={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Ongefilterd/ }));

    await waitFor(() => expect(paApi.fetchFeed).toHaveBeenCalled());
    const call = paApi.fetchFeed.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(call.source).toBe('eu');
    // Not `q: ''` — absent. An empty string would be indistinguishable from a
    // user clearing the search box, and the whole point is the unfiltered feed.
    expect('q' in call).toBe(false);
  });

  it('issues one call per source when the tab draws from several', async () => {
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Ongefilterd/ }));

    // politiek is ['tk','ob']. FeedSource is single-valued and 'both' is not
    // equivalent: it also pulls media when that flag is on, and deliberately
    // excludes eu. So the tab fans out rather than widening its scope.
    await waitFor(() => {
      const sources = paApi.fetchFeed.mock.calls.map((c) => (c[0] as { source?: string }).source);
      expect(sources).toContain('tk');
      expect(sources).toContain('ob');
    });
  });
});

describe('the pa.api mock', () => {
  it('only names exports the real module has', async () => {
    // Spreading the real module covers a missing member; this covers a renamed
    // or mistyped one, which spreading cannot see.
    await expectMockNamesRealExports(vi.importActual('../../services/pa.api'), paApi);
  });
});

describe('Monitoring', () => {
  it('loads signals and inbox for the active tab on mount, then shows the curated view', async () => {
    const signal = makeSignal({ id: 'sig-1', title: 'Curated signal' });
    paApi.fetchSignals.mockResolvedValue([signal]);
    paApi.fetchInbox.mockResolvedValue({ data: [], meta: { total: 2, cap: 100, capped: false } });
    const updateInboxCount = vi.fn();
    mockUsePaData.mockReturnValue(defaultPaData({ updateInboxCount }));

    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Curated signal')).toBeInTheDocument());
    expect(paApi.fetchSignals).toHaveBeenCalledWith({ tab: 'politiek' });
    expect(paApi.fetchInbox).toHaveBeenCalledWith({ tab: 'politiek' });
    expect(updateInboxCount).toHaveBeenCalledWith('politiek', 2);
  });

  it('refetches the cockpit-wide confirmed signals on tab load', async () => {
    // The rail's confirmed counter comes from the provider resource, which
    // useResource fetches only on mount. Without this it keeps showing a
    // snapshot — it survived the ACC database being emptied underneath it.
    const refetch = vi.fn();
    mockUsePaData.mockReturnValue(
      defaultPaData({ signals: { data: [] as Signal[], status: 'ok', refetch } })
    );

    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);

    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it('re-reads every badge on tab load, not just the open one', async () => {
    // updateInboxCount above fixes the open tab; this covers the other three,
    // which otherwise keep whatever they showed at mount. Asserted rather than
    // left implicit because the context is hand-mocked here: a field added to
    // the provider and missed in defaultPaData surfaces as an unhandled
    // rejection that still lets every test pass.
    const refreshInboxCounts = vi.fn().mockResolvedValue(undefined);
    mockUsePaData.mockReturnValue(defaultPaData({ refreshInboxCounts }));

    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);

    await waitFor(() => expect(refreshInboxCounts).toHaveBeenCalled());
  });

  it('switching to the Inbox view shows inbox items instead of curated signals', async () => {
    paApi.fetchSignals.mockResolvedValue([makeSignal({ id: 'sig-1', title: 'Curated signal' })]);
    paApi.fetchInbox.mockResolvedValue({
      data: [makeSignal({ id: 'in-1', title: 'Inbox signal', status: 'candidate' })],
      meta: { total: 1, cap: 100, capped: false },
    });
    const user = userEvent.setup();

    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Curated signal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Inbox/ }));

    expect(screen.getByText('Inbox signal')).toBeInTheDocument();
    expect(screen.queryByText('Curated signal')).not.toBeInTheDocument();
  });

  it('confirming an inbox item calls confirmSignal and removes it from the visible inbox', async () => {
    const inboxSignal = makeSignal({ id: 'in-1', title: 'Inbox signal', status: 'candidate' });
    paApi.fetchInbox.mockResolvedValue({
      data: [inboxSignal],
      meta: { total: 1, cap: 100, capped: false },
    });
    const confirmSignal = vi.fn().mockResolvedValue({ ...inboxSignal, status: 'confirmed' });
    mockUsePaData.mockReturnValue(defaultPaData({ confirmSignal }));
    const user = userEvent.setup();

    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await waitFor(() => expect(paApi.fetchInbox).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /Inbox/ }));
    await user.click(screen.getByRole('button', { name: 'Bevestigen' }));

    expect(confirmSignal).toHaveBeenCalledWith('in-1', undefined);
    await waitFor(() => expect(screen.queryByText('Inbox signal')).not.toBeInTheDocument());
  });

  it('dismissing an inbox item hides it and persists the dismissal', async () => {
    // It used to be client-only state, so an ignored signal came back on the
    // next reload — the button did not do what it said.
    const inboxSignal = makeSignal({ id: 'in-1', title: 'Inbox signal', status: 'candidate' });
    paApi.fetchInbox.mockResolvedValue({
      data: [inboxSignal],
      meta: { total: 1, cap: 100, capped: false },
    });
    const confirmSignal = vi.fn();
    const dismissSignal = vi.fn().mockResolvedValue(undefined);
    mockUsePaData.mockReturnValue(defaultPaData({ confirmSignal, dismissSignal }));
    const user = userEvent.setup();

    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await waitFor(() => expect(paApi.fetchInbox).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /Inbox/ }));

    await user.click(screen.getByRole('button', { name: 'Negeren' }));

    expect(screen.queryByText('Inbox signal')).not.toBeInTheDocument();
    await waitFor(() => expect(dismissSignal).toHaveBeenCalledWith('in-1'));
    expect(confirmSignal).not.toHaveBeenCalled();
  });

  it('puts a dismissed item back when persisting it fails', async () => {
    // Leaving it hidden would tell the user it was ignored when it was not.
    const inboxSignal = makeSignal({ id: 'in-1', title: 'Inbox signal', status: 'candidate' });
    paApi.fetchInbox.mockResolvedValue({
      data: [inboxSignal],
      meta: { total: 1, cap: 100, capped: false },
    });
    const dismissSignal = vi.fn().mockRejectedValue(new Error('offline'));
    mockUsePaData.mockReturnValue(defaultPaData({ dismissSignal }));
    const user = userEvent.setup();

    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await waitFor(() => expect(paApi.fetchInbox).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /Inbox/ }));

    await user.click(screen.getByRole('button', { name: 'Negeren' }));

    await waitFor(() => expect(screen.getByText('Inbox signal')).toBeInTheDocument());
  });

  it('free-text search calls fetchFeed with the query and shows the result count', async () => {
    paApi.fetchFeed.mockResolvedValue({
      items: [
        {
          id: 'f1',
          title: 'Found item',
          type: 'Motie',
          number: '1',
          date: null,
          url: null,
          source: 'tk',
        },
      ],
      total: 1,
    });
    const user = userEvent.setup();

    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await waitFor(() => expect(paApi.fetchSignals).toHaveBeenCalled());

    await user.type(screen.getByPlaceholderText(/Zoek in álle signaalbronnen/), 'stikstof');
    await user.click(screen.getByRole('button', { name: 'Zoek' }));

    await waitFor(() =>
      expect(paApi.fetchFeed).toHaveBeenCalledWith({ q: 'stikstof', source: 'both', top: 30 })
    );
    expect(screen.getByText('Found item')).toBeInTheDocument();
  });
});

describe('raw search band', () => {
  const feedItem = {
    id: 'f1',
    title: 'Rauwe treffer',
    type: 'Motie',
    number: '2026D1',
    date: '2026-08-01',
    url: 'https://example.test/doc',
    source: 'tk' as const,
  };

  async function search(user: ReturnType<typeof userEvent.setup>, q = 'energie') {
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await waitFor(() => expect(paApi.fetchInbox).toHaveBeenCalled());
    await user.type(screen.getByRole('textbox'), q);
    await user.click(screen.getByRole('button', { name: 'Zoek' }));
  }

  it('saves the query as a zoekopdracht', async () => {
    paApi.fetchFeed.mockResolvedValue({ items: [feedItem], total: 1 });
    paApi.createSavedSearch.mockResolvedValue({ id: 'srch-1' });
    const user = userEvent.setup();
    await search(user);

    await user.click(await screen.findByRole('button', { name: /Bewaar als zoekopdracht/ }));

    await waitFor(() =>
      expect(paApi.createSavedSearch).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'energie' })
      )
    );
  });

  it('promotes a raw hit into the inbox', async () => {
    paApi.fetchFeed.mockResolvedValue({ items: [feedItem], total: 1 });
    paApi.promoteToInbox.mockResolvedValue({ id: 'sig-new', status: 'candidate' });
    const user = userEvent.setup();
    await search(user);

    await user.click(await screen.findByRole('button', { name: 'Naar inbox' }));

    await waitFor(() =>
      expect(paApi.promoteToInbox).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }))
    );
  });

  it('reports a hit that was already curated instead of re-adding it', async () => {
    paApi.fetchFeed.mockResolvedValue({ items: [feedItem], total: 1 });
    paApi.promoteToInbox.mockResolvedValue({ id: 'sig-new', status: 'confirmed' });
    const user = userEvent.setup();
    await search(user);

    await user.click(await screen.findByRole('button', { name: 'Naar inbox' }));

    expect(await screen.findByText('Staat al in Gecureerd')).toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    paApi.fetchFeed.mockResolvedValue({ items: [], total: 0 });
    const user = userEvent.setup();
    await search(user, 'nietsdat');

    expect(await screen.findByText(/Geen treffers voor/)).toBeInTheDocument();
  });
});

describe('watchlist signals', () => {
  it('links an unrouted signal to a dossier', async () => {
    const orphan = makeSignal({
      id: 'sig-orphan',
      title: 'Zwevend signaal',
      routing: 'watchlist',
      dossierId: null,
    });
    paApi.fetchSignals.mockResolvedValue([orphan]);
    const linkSignalDossier = vi
      .fn()
      .mockResolvedValue({ ...orphan, dossierId: 'stikstof', routing: null });
    mockUsePaData.mockReturnValue(
      defaultPaData({
        linkSignalDossier,
        dossiers: {
          data: [{ id: 'stikstof', naam: 'Stikstofdossier' }] as never,
          status: 'ok',
          refetch: vi.fn(),
        },
      })
    );
    const user = userEvent.setup();

    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await screen.findByText('Zwevend signaal');

    await user.selectOptions(screen.getByRole('combobox'), 'stikstof');
    await user.click(screen.getByRole('button', { name: /Koppel/ }));

    await waitFor(() => expect(linkSignalDossier).toHaveBeenCalledWith('sig-orphan', 'stikstof'));
  });
});
