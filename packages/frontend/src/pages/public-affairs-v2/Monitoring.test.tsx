// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Monitoring from './Monitoring';
import type { Dossier, FeedItem, Signal } from '@ronl/shared';

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
  paTabBronnen: vi.fn(() => ['Tweede Kamer']),
  signalTag: vi.fn(() => 'nl'),
  signalTagLabel: vi.fn(() => 'Politiek NL'),
  BRON_LABEL: { tk: 'Tweede Kamer', ob: 'Officiële Bekendmakingen', eu: 'Europees Parlement' },
}));
vi.mock('../../services/pa.api', () => paApi);

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

function defaultPaData(overrides: Record<string, unknown> = {}) {
  return {
    dossiers: { data: [] as Dossier[], status: 'ok', refetch: vi.fn() },
    confirmSignal: vi.fn(),
    linkSignalDossier: vi.fn(),
    updateInboxCount: vi.fn(),
    dismissSignal: vi.fn().mockResolvedValue(undefined),
    refreshInboxCounts: vi.fn().mockResolvedValue(undefined),
    signals: { data: [] as Signal[], status: 'ok', refetch: vi.fn() },
    ...overrides,
  };
}

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
