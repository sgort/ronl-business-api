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

  function rawItems(n: number, source: 'tk' | 'ob' | 'eu' | 'media' = 'eu') {
    return Array.from({ length: n }, (_, i) => ({
      id: `r${i}`,
      title: `Rauw item ${i}`,
      type: null,
      number: null,
      date: null,
      url: null,
      source,
    }));
  }

  it('marks the count as capped when a source holds more than it returned', async () => {
    // The number on the segment is a page size, not an answer. Politiek shows
    // 60 and the others 30 because that is top:30 per source — so a bare count
    // reads as "this is all there is" when it is "this is all we asked for".
    paApi.fetchFeed.mockResolvedValue({ items: rawItems(30), total: 500 });
    const user = userEvent.setup();
    render(<Monitoring activeTab="europa" onOpenDossier={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Ongefilterd/ }));

    expect(await screen.findByRole('button', { name: /Ongefilterd\s*30\+/ })).toBeInTheDocument();
    expect(await screen.findByText(/500/)).toBeInTheDocument();
  });

  it('shows a plain count when the feed fits inside the page', async () => {
    paApi.fetchFeed.mockResolvedValue({ items: rawItems(4), total: 4 });
    const user = userEvent.setup();
    render(<Monitoring activeTab="europa" onOpenDossier={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Ongefilterd/ }));

    const seg = await screen.findByRole('button', { name: /Ongefilterd/ });
    await waitFor(() => expect(seg).toHaveAccessibleName(/Ongefilterd\s*4$/));
  });

  it('treats a full page with an unknown total as capped', async () => {
    // TK returns total: null for multi-term queries. A blank feed is not
    // multi-term so it should carry a real total, but the view must not read a
    // null as "nothing more" — a full page is the signal that survives either way.
    paApi.fetchFeed.mockResolvedValue({ items: rawItems(30), total: null });
    const user = userEvent.setup();
    render(<Monitoring activeTab="europa" onOpenDossier={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Ongefilterd/ }));

    expect(await screen.findByRole('button', { name: /Ongefilterd\s*30\+/ })).toBeInTheDocument();
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

describe('Monitoring signal provenance chips', () => {
  // Every one of these is display-only -- none of it feeds scoring -- but it is
  // how a curator tells a plenary document from a committee text, or a
  // provincial news item from a national one, without opening the source.
  const renderCurated = async (signals: Signal[]) => {
    paApi.fetchSignals.mockResolvedValue(signals);
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await waitFor(() => expect(paApi.fetchSignals).toHaveBeenCalled());
  };

  it('names each source, and shows no badge at all when the source is unknown', async () => {
    await renderCurated([
      makeSignal({ id: 'a', bron: 'tk' }),
      makeSignal({ id: 'b', bron: 'ob' }),
      makeSignal({ id: 'c', bron: 'eu' }),
      makeSignal({ id: 'd', bron: null }),
    ]);

    expect((await screen.findAllByText('Tweede Kamer')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Off. Bekendmakingen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Europees Parlement').length).toBeGreaterThan(0);
  });

  it('shows a source key verbatim when there is no display name for it', async () => {
    // Deliberately outside the declared union: the fallback exists for signals
    // persisted under a source key this build no longer knows about, which is
    // by definition a value the current type forbids.
    await renderCurated([
      makeSignal({ id: 'a', bron: 'nieuwe-bron' } as unknown as Partial<Signal>),
    ]);
    expect(await screen.findByText('nieuwe-bron')).toBeInTheDocument();
  });

  it('labels the EP sub-source and names the responsible committee', async () => {
    await renderCurated([
      makeSignal({
        id: 'a',
        bron: 'eu',
        subbron: 'ep-rss',
        commissie: 'ENVI',
      } as Partial<Signal>),
      makeSignal({ id: 'b', bron: 'eu', subbron: 'ep-teksten' } as Partial<Signal>),
    ]);

    expect(await screen.findByText('Plenaire documenten')).toBeInTheDocument();
    expect(screen.getByText('Ingediende teksten')).toBeInTheDocument();
    expect(screen.getByText('ENVI')).toBeInTheDocument();
  });

  it('still labels a press release, the sub-source nothing produces any more', async () => {
    // The press-release feed was dropped in f355fce -- the EP Open Data API has
    // no equivalent endpoint -- but signals persisted under 'ep-persbericht'
    // before that are still in the inbox and must keep their label. The entry
    // is deliberate backward compatibility, not a leftover: deleting it would
    // silently downgrade historical rows to a raw key.
    await renderCurated([
      makeSignal({ id: 'a', bron: 'eu', subbron: 'ep-persbericht' } as Partial<Signal>),
    ]);
    expect(await screen.findByText('Persbericht')).toBeInTheDocument();
  });

  it('shows an unrecognised EP sub-source key verbatim', async () => {
    // Signals persisted before a feed changed keep their old key; showing the
    // raw key beats showing nothing where a label belongs.
    await renderCurated([
      makeSignal({ id: 'a', bron: 'eu', subbron: 'ep-nieuw' } as Partial<Signal>),
    ]);
    expect(await screen.findByText('ep-nieuw')).toBeInTheDocument();
  });

  it('carries region and sentiment on a media signal', async () => {
    await renderCurated([
      makeSignal({
        id: 'a',
        bron: 'media',
        subbron: 'nieuws-regionaal',
        regio: 'Flevoland',
        sentiment: 'negatief',
      } as Partial<Signal>),
      makeSignal({
        id: 'b',
        bron: 'media',
        subbron: 'nieuws-nationaal',
        sentiment: 'positief',
      } as Partial<Signal>),
      makeSignal({
        id: 'c',
        bron: 'media',
        subbron: 'social',
        sentiment: 'neutraal',
      } as Partial<Signal>),
    ]);

    expect(await screen.findByText('Regionaal')).toBeInTheDocument();
    expect(screen.getByText('Landelijk')).toBeInTheDocument();
    expect(screen.getByText('Sociaal')).toBeInTheDocument();
    expect(screen.getByText('◎ Flevoland')).toBeInTheDocument();
    expect(screen.getByText('Negatief')).toBeInTheDocument();
    expect(screen.getByText('Positief')).toBeInTheDocument();
    expect(screen.getByText('Neutraal')).toBeInTheDocument();
  });

  it('shows unrecognised media sub-source and sentiment keys verbatim', async () => {
    await renderCurated([
      makeSignal({
        id: 'a',
        bron: 'media',
        subbron: 'podcast',
        sentiment: 'gemengd',
      } as unknown as Partial<Signal>),
    ]);
    expect(await screen.findByText('podcast')).toBeInTheDocument();
    expect(screen.getByText('gemengd')).toBeInTheDocument();
  });

  it('flags a confirmed signal that has no dossier as watchlist work', async () => {
    await renderCurated([
      makeSignal({ id: 'a', routing: 'watchlist', dossierId: null } as Partial<Signal>),
    ]);
    expect(await screen.findByText(/staat op de watchlist/)).toBeInTheDocument();
  });

  it('names the curator who confirmed a signal, and links its source reference', async () => {
    await renderCurated([
      makeSignal({
        id: 'a',
        confirmedBy: 'Sanne Bakker',
        confirmedAt: '2 jul 2026',
        ref: { type: 'Motie', nr: '2026Z001', url: 'https://tk.nl/x' },
      } as Partial<Signal>),
    ]);

    expect(await screen.findByText(/Bevestigd door Sanne Bakker/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2026Z001/ })).toHaveAttribute(
      'href',
      'https://tk.nl/x'
    );
  });
});

describe('Monitoring inbox rendering', () => {
  const renderInbox = async (signals: Signal[]) => {
    paApi.fetchInbox.mockResolvedValue({
      data: signals,
      meta: { total: signals.length, cap: 100, capped: false },
    });
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Inbox/ }));
    return user;
  };

  it('separates an AI concept from a rule candidate, and says which needs a human reading', async () => {
    await renderInbox([
      makeSignal({
        id: 'i1',
        status: 'ai_drafted',
        duiding: 'AI-duiding',
        impact: 'risico',
        impactLabel: 'Risico',
      }),
      makeSignal({ id: 'i2', status: 'candidate', duiding: null, impact: null, dossierId: null }),
    ]);

    expect(await screen.findByText('✦ AI-concept')).toBeInTheDocument();
    expect(screen.getByText('Regel-kandidaat')).toBeInTheDocument();
    expect(screen.getByText('AI-duiding')).toBeInTheDocument();
    expect(screen.getByText('Risico')).toBeInTheDocument();
    expect(screen.getByText(/Handmatige duiding nodig/)).toBeInTheDocument();
    // A candidate the rules could not route says so, rather than showing an
    // empty dossier chip.
    expect(screen.getByText('⚑ Geen dossier-match')).toBeInTheDocument();
  });

  it('locks the koppel control while the link is in flight', async () => {
    // The select and the button both drive one write; leaving either live
    // during the round trip lets a second pick overwrite the first.
    const linked = makeSignal({
      id: 'a',
      title: 'Zwevend signaal',
      routing: null,
      dossierId: 'stikstof',
    } as Partial<Signal>);
    let release!: () => void;
    const linkSignalDossier = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve(linked);
        })
    );
    mockUsePaData.mockReturnValue(
      defaultPaData({
        dossiers: {
          data: [{ id: 'stikstof', naam: 'Stikstof' }] as never,
          status: 'ok',
          refetch: vi.fn(),
        },
        linkSignalDossier,
      })
    );
    paApi.fetchSignals.mockResolvedValue([
      makeSignal({
        id: 'a',
        title: 'Zwevend signaal',
        routing: 'watchlist',
        dossierId: null,
      } as Partial<Signal>),
    ]);
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await screen.findByText('Zwevend signaal');

    await user.selectOptions(screen.getByRole('combobox'), 'stikstof');
    await user.click(screen.getByRole('button', { name: 'Koppelen' }));

    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('button', { name: '…' })).toBeDisabled();

    release();
    await waitFor(() => expect(screen.queryByRole('button', { name: '…' })).toBeNull());
  });
});

describe('Monitoring raw feed rendering', () => {
  const rawItem = (over: Partial<FeedItem> = {}): FeedItem =>
    ({
      id: 'r1',
      title: 'Ruwe treffer',
      type: 'Motie',
      number: '2026Z001',
      date: new Date().toISOString(),
      url: 'https://tk.nl/x',
      source: 'tk',
      ...over,
    }) as FeedItem;

  const openOngefilterd = async (items: FeedItem[]) => {
    paApi.fetchFeed.mockResolvedValue({ items, total: items.length });
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Ongefilterd/ }));
    return user;
  };

  it('dates each hit relatively, and copes with an undated or unparseable one', async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    await openOngefilterd([
      rawItem({ id: 'a', date: hoursAgo(0) }),
      rawItem({ id: 'b', date: hoursAgo(5) }),
      rawItem({ id: 'c', date: hoursAgo(30) }),
      rawItem({ id: 'd', date: hoursAgo(24 * 4) }),
      rawItem({ id: 'e', date: null }),
      rawItem({ id: 'f', date: 'onbekend' }),
    ]);

    expect(await screen.findByText(/· nu/)).toBeInTheDocument();
    expect(screen.getByText(/· 5 u/)).toBeInTheDocument();
    expect(screen.getByText(/· 1 dg$/)).toBeInTheDocument();
    expect(screen.getByText(/· 4 dgn/)).toBeInTheDocument();
    // An unparseable date is shown as-is rather than silently dropped or
    // rendered as "NaN dgn".
    expect(screen.getByText(/· onbekend/)).toBeInTheDocument();
  });

  it('renders a hit with no type and no URL', async () => {
    await openOngefilterd([rawItem({ id: 'a', type: null, url: null, number: null })]);
    expect(await screen.findByText('Ruwe treffer')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('falls back to the hit id when it carries no document number', async () => {
    await openOngefilterd([rawItem({ id: 'zonder-nummer', number: null })]);
    expect(await screen.findByRole('link', { name: /zonder-nummer/ })).toBeInTheDocument();
  });
});

describe('Monitoring view states', () => {
  it('falls back to the first monitoring tab for an unknown tab id', async () => {
    render(<Monitoring activeTab={'onbekend' as never} onOpenDossier={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Agenda' })).toBeInTheDocument();
    await waitFor(() => expect(paApi.fetchSignals).toHaveBeenCalledWith({ tab: 'agenda' }));
  });

  it('explains the news coverage on the Media & omgeving tab', async () => {
    render(<Monitoring activeTab="media" onOpenDossier={vi.fn()} />);
    expect(await screen.findByText(/volgt als tweede subbron/)).toBeInTheDocument();
  });

  it('shows 100+ and the cap banner when the inbox is capped', async () => {
    paApi.fetchInbox.mockResolvedValue({
      data: [makeSignal({ id: 'in-1', title: 'Inbox signal', status: 'candidate' })],
      meta: { total: 240, cap: 100, capped: true },
    });
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: /Inbox\s*100\+/ }));

    expect(screen.getByText('Top 100')).toBeInTheDocument();
    expect(screen.getByText(/240 kandidaten in deze inbox/)).toBeInTheDocument();
    expect(screen.getByText(/140 met lagere relevantie/)).toBeInTheDocument();
  });

  it('links the source reference of an inbox candidate', async () => {
    paApi.fetchInbox.mockResolvedValue({
      data: [
        makeSignal({
          id: 'in-1',
          status: 'candidate',
          ref: { type: 'Motie', nr: '36123-7', url: 'https://tk.nl/36123-7' },
        }),
      ],
      meta: { total: 1, cap: 100, capped: false },
    });
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Inbox/ }));

    expect(screen.getByRole('link', { name: /36123-7/ })).toHaveAttribute(
      'href',
      'https://tk.nl/36123-7'
    );
  });

  it('filters the curated list down to watchlist signals and back', async () => {
    paApi.fetchSignals.mockResolvedValue([
      makeSignal({ id: 'a', title: 'Dossiersignaal' }),
      makeSignal({ id: 'b', title: 'Zwevend signaal', routing: 'watchlist', dossierId: null }),
    ]);
    const user = userEvent.setup();
    const { container } = render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await screen.findByText('Dossiersignaal');

    // "Alle" is also the search band's source chip, so scope to the filter bar.
    const [alle, watchlist] = Array.from(
      container.querySelectorAll<HTMLElement>('.pac-orphan-fbtn')
    );
    expect(watchlist).toHaveTextContent(/⚑ Watchlist\s*1/);
    expect(alle).toHaveClass('active');

    await user.click(watchlist);
    expect(watchlist).toHaveClass('active');
    expect(screen.queryByText('Dossiersignaal')).not.toBeInTheDocument();
    expect(screen.getByText('Zwevend signaal')).toBeInTheDocument();

    await user.click(alle);
    expect(screen.getByText('Dossiersignaal')).toBeInTheDocument();
  });

  it('keeps the other curated signals in place when one is linked to a dossier', async () => {
    const orphan = makeSignal({
      id: 'b',
      title: 'Zwevend signaal',
      routing: 'watchlist',
      dossierId: null,
    });
    paApi.fetchSignals.mockResolvedValue([
      makeSignal({ id: 'a', title: 'Dossiersignaal' }),
      orphan,
    ]);
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
    await user.click(screen.getByRole('button', { name: 'Koppelen' }));

    expect(await screen.findByText('Gekoppeld aan Stikstofdossier')).toBeInTheDocument();
    expect(screen.getByText('Dossiersignaal')).toBeInTheDocument();
    // No watchlist signal is left, so the filter bar goes.
    expect(screen.queryByRole('button', { name: /⚑ Watchlist/ })).not.toBeInTheDocument();
  });
});

describe('Monitoring confirming an AI draft', () => {
  it('adopts the AI draft fields as the patch and marks the card as just confirmed', async () => {
    const full = makeSignal({
      id: 'in-full',
      title: 'Volledig concept',
      status: 'ai_drafted',
      aiDraft: { rel: 9, impact: 'risico', impactLabel: 'Risico', duiding: 'AI-duiding' },
    });
    // A draft whose fields are all empty must send no values, not nulls.
    const empty = makeSignal({
      id: 'in-empty',
      title: 'Leeg concept',
      status: 'ai_drafted',
      aiDraft: { rel: null, impact: null, impactLabel: null, duiding: null } as never,
    });
    paApi.fetchInbox.mockResolvedValue({
      data: [full, empty],
      meta: { total: 2, cap: 100, capped: false },
    });
    const confirmSignal = vi.fn((id: string) =>
      Promise.resolve({ ...(id === full.id ? full : empty), status: 'confirmed' })
    );
    mockUsePaData.mockReturnValue(defaultPaData({ confirmSignal }));
    const user = userEvent.setup();
    const { container } = render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: /Inbox/ }));

    await user.click(screen.getAllByRole('button', { name: 'Bevestigen' })[0]);
    await waitFor(() => expect(screen.queryByText('Volledig concept')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Bevestigen' }));

    expect(confirmSignal).toHaveBeenNthCalledWith(1, 'in-full', {
      duiding: 'AI-duiding',
      impact: 'risico',
      impactLabel: 'Risico',
      rel: 9,
    });
    expect(confirmSignal).toHaveBeenNthCalledWith(2, 'in-empty', {
      duiding: undefined,
      impact: undefined,
      impactLabel: undefined,
      rel: undefined,
    });

    await user.click(screen.getByRole('button', { name: /Gecureerd/ }));
    expect(await screen.findByText('Volledig concept')).toBeInTheDocument();
    expect(container.querySelectorAll('.pac-signal-fresh')).toHaveLength(2);
    expect(screen.getAllByText(/Zojuist bevestigd/)).toHaveLength(2);
  });
});

describe('Monitoring search band interactions', () => {
  const hit = (over: Partial<FeedItem> = {}): FeedItem =>
    ({
      id: 'h1',
      title: 'Treffer',
      type: 'Motie',
      number: '1',
      date: null,
      url: null,
      source: 'tk',
      ...over,
    }) as FeedItem;

  const settle = async () => {
    await waitFor(() => expect(paApi.fetchInbox).toHaveBeenCalled());
  };

  it('submits on Enter, and an empty query clears the results instead of searching', async () => {
    paApi.fetchFeed.mockResolvedValue({ items: [hit()], total: 1 });
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await settle();

    await user.click(screen.getByRole('button', { name: 'Zoek' }));
    expect(paApi.fetchFeed).not.toHaveBeenCalled();
    expect(screen.queryByText('Zoekresultaten')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), 'stikstof{Enter}');
    expect(await screen.findByText('Treffer')).toBeInTheDocument();
    expect(paApi.fetchFeed).toHaveBeenCalledWith({ q: 'stikstof', source: 'both', top: 30 });
  });

  it('re-runs an active search on a source chip, and saves it scoped to that source', async () => {
    paApi.fetchFeed.mockResolvedValue({ items: [hit()], total: 1 });
    paApi.createSavedSearch.mockResolvedValue({ id: 'srch-1' });
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await settle();

    await user.type(screen.getByRole('textbox'), 'stikstof{Enter}');
    await screen.findByText('Treffer');
    await user.click(screen.getByRole('button', { name: 'Off. Bekendmakingen' }));

    await waitFor(() =>
      expect(paApi.fetchFeed).toHaveBeenLastCalledWith({ q: 'stikstof', source: 'ob', top: 30 })
    );
    await user.click(screen.getByRole('button', { name: /Bewaar als zoekopdracht/ }));
    await waitFor(() =>
      expect(paApi.createSavedSearch).toHaveBeenCalledWith({ q: 'stikstof', source: ['ob'] })
    );
    expect(await screen.findByRole('button', { name: '✓ Bewaard' })).toBeDisabled();
  });

  it('shows a source key verbatim as a chip label when it has no display name', async () => {
    paApi.fetchFeedSources.mockResolvedValue(['tk', 'rss-extra']);
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'rss-extra' })).toBeInTheDocument();
  });

  it('counts the loaded hits when the source reports no total', async () => {
    paApi.fetchFeed.mockResolvedValue({ items: [hit({ id: 'a' }), hit({ id: 'b' })], total: null });
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await settle();

    await user.type(screen.getByRole('textbox'), 'energie{Enter}');

    expect(await screen.findByText(/· 2 treffers/)).toBeInTheDocument();
  });

  it('re-runs a saved search in its stored scope: one source as-is, several as Alle', async () => {
    paApi.fetchSearches.mockResolvedValue([
      {
        id: 'ss-1',
        dossierId: null,
        query: { q: 'windpark', types: [], source: ['ob'] },
        tags: [],
        scope: 'user',
        notify: false,
      },
      {
        id: 'ss-2',
        dossierId: null,
        query: { q: 'netcongestie', types: [], source: ['tk', 'ob'] },
        tags: [],
        scope: 'user',
        notify: false,
      },
    ]);
    const user = userEvent.setup();
    render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: /windpark/ }));
    await waitFor(() =>
      expect(paApi.fetchFeed).toHaveBeenLastCalledWith({ q: 'windpark', source: 'ob', top: 30 })
    );

    await user.click(screen.getByRole('button', { name: /netcongestie/ }));
    await waitFor(() =>
      expect(paApi.fetchFeed).toHaveBeenLastCalledWith({
        q: 'netcongestie',
        source: 'both',
        top: 30,
      })
    );
  });

  it('adds a hit promoted into the open tab to its inbox, counting it only once', async () => {
    const existing = makeSignal({ id: 'in-1', title: 'Al in inbox', status: 'candidate' });
    paApi.fetchInbox.mockResolvedValue({
      data: [existing],
      meta: { total: 1, cap: 100, capped: false },
    });
    paApi.fetchFeed.mockResolvedValue({
      items: [
        hit({ id: 'h1', title: 'Nieuwe treffer', type: 'Besluit', source: 'ob' }),
        hit({ id: 'h2', title: 'Bekende treffer' }),
      ],
      total: 2,
    });
    paApi.promoteToInbox
      .mockResolvedValueOnce(
        makeSignal({ id: 'sig-new', title: 'Nieuw inboxsignaal', status: 'candidate' })
      )
      .mockResolvedValueOnce(existing);
    const updateInboxCount = vi.fn();
    mockUsePaData.mockReturnValue(defaultPaData({ updateInboxCount }));
    const user = userEvent.setup();
    const { container } = render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await settle();

    await user.type(screen.getByRole('textbox'), 'energie{Enter}');
    await screen.findByText('Nieuwe treffer');
    // An OB hit's type chip carries the regional styling.
    expect(container.querySelector('.pac-tag.regio')).toHaveTextContent('Besluit');

    const [promoteNew, promoteKnown] = screen.getAllByRole('button', { name: 'Naar inbox' });
    await user.click(promoteNew);
    await waitFor(() => expect(updateInboxCount).toHaveBeenLastCalledWith('politiek', 2));
    await user.click(promoteKnown);
    await waitFor(() => expect(screen.getAllByText('In inbox ✓')).toHaveLength(2));
    // The second one was already in the inbox, so the count stays at 2 and no
    // other tab's inbox had to be re-read.
    expect(updateInboxCount).toHaveBeenLastCalledWith('politiek', 2);
    expect(paApi.fetchInbox).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Wis ✕' }));
    await user.click(screen.getByRole('button', { name: /Inbox\s*2/ }));
    expect(screen.getByText('Nieuw inboxsignaal')).toBeInTheDocument();
    expect(screen.getByText('Al in inbox')).toBeInTheDocument();
  });

  it('names a raw hit by its source key when that source has no label', async () => {
    paApi.fetchFeed.mockResolvedValue({
      items: [hit({ id: 'm1', title: 'Nieuwsbericht', type: null, source: 'media' as never })],
      total: 1,
    });
    const user = userEvent.setup();
    const { container } = render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await settle();

    await user.type(screen.getByRole('textbox'), 'energie{Enter}');
    await screen.findByText('Nieuwsbericht');

    expect(container.querySelector('.pac-signal-raw .pac-signal-src')).toHaveTextContent(/^media$/);
  });
});

describe('Monitoring curation-pipeline explainer', () => {
  it('opens from the ? button and links to the Beheer page when navigation is available', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <Monitoring activeTab="politiek" onOpenDossier={vi.fn()} onNavigate={onNavigate} />
    );
    await screen.findByRole('button', { name: /Gecureerd/ });
    const toggle = container.querySelector('.pac-pipe-toggle') as HTMLElement;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('▸');

    await user.click(screen.getByRole('button', { name: 'Hoe werkt de curatiepijplijn?' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('▾');

    await user.click(screen.getByRole('button', { name: /Bekijk als pagina in Beheer/ }));
    expect(onNavigate).toHaveBeenCalledWith('beheer', 'curatie-spec');
  });

  it('omits the Beheer link when there is no navigation handler', async () => {
    const user = userEvent.setup();
    const { container } = render(<Monitoring activeTab="politiek" onOpenDossier={vi.fn()} />);
    await screen.findByRole('button', { name: /Gecureerd/ });

    await user.click(container.querySelector('.pac-pipe-toggle') as HTMLElement);

    expect(container.querySelector('.pac-pipe-body')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Bekijk als pagina in Beheer/ })).toBeNull();
  });
});
