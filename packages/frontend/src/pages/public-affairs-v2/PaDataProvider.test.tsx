// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { PaDataProvider, usePaData } from './PaDataProvider';

const mocks = vi.hoisted(() => ({
  confirmSignal: vi.fn(),
  linkSignalDossier: vi.fn(),
  dismissSignal: vi.fn(),
  watchDossier: vi.fn(),
  unwatchDossier: vi.fn(),
  toggleSearchNotify: vi.fn(),
  fetchAgenda: vi.fn(),
  fetchDossiers: vi.fn(),
  fetchInbox: vi.fn(),
  fetchInboxCounts: vi.fn(),
  fetchSignals: vi.fn(),
  fetchNotifications: vi.fn(),
  ackNotifications: vi.fn(),
}));

vi.mock('../../services/pa.api', () => mocks);

function wrapper({ children }: { children: ReactNode }) {
  return <PaDataProvider>{children}</PaDataProvider>;
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.fetchSignals.mockResolvedValue([]);
  mocks.fetchInbox.mockResolvedValue({ data: [], meta: { total: 0, cap: 100, capped: false } });
  mocks.fetchInboxCounts.mockResolvedValue({});
  mocks.fetchDossiers.mockResolvedValue([]);
  mocks.fetchAgenda.mockResolvedValue([]);
  mocks.fetchNotifications.mockResolvedValue({ items: [], unseenCount: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePaData', () => {
  it('throws when used outside a PaDataProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePaData())).toThrow(
      'usePaData must be used inside PaDataProvider'
    );
  });
});

describe('resource loading', () => {
  it('starts loading and resolves signals to the fetched data', async () => {
    mocks.fetchSignals.mockResolvedValue([{ id: 's1' }]);

    const { result } = renderHook(() => usePaData(), { wrapper });

    expect(result.current.signals.status).toBe('loading');
    await waitFor(() => expect(result.current.signals.status).toBe('ok'));
    expect(result.current.signals.data).toEqual([{ id: 's1' }]);
  });

  it("unwraps fetchInbox's {data, meta} envelope down to just the data array", async () => {
    mocks.fetchInbox.mockResolvedValue({
      data: [{ id: 'in1' }],
      meta: { total: 1, cap: 100, capped: false },
    });

    const { result } = renderHook(() => usePaData(), { wrapper });

    await waitFor(() => expect(result.current.inbox.status).toBe('ok'));
    expect(result.current.inbox.data).toEqual([{ id: 'in1' }]);
  });

  it('sets a resource to error status when its fetcher rejects', async () => {
    mocks.fetchDossiers.mockRejectedValue(new Error('backend down'));

    const { result } = renderHook(() => usePaData(), { wrapper });

    await waitFor(() => expect(result.current.dossiers.status).toBe('error'));
    expect(result.current.dossiers.data).toEqual([]);
  });

  it('refetch re-invokes the fetcher and cycles status back through loading', async () => {
    const { result } = renderHook(() => usePaData(), { wrapper });
    await waitFor(() => expect(result.current.signals.status).toBe('ok'));

    const callsBefore = mocks.fetchSignals.mock.calls.length;
    mocks.fetchSignals.mockResolvedValue([{ id: 's2' }]);

    act(() => {
      result.current.signals.refetch();
    });

    await waitFor(() => expect(result.current.signals.data).toEqual([{ id: 's2' }]));
    expect(mocks.fetchSignals.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe('inboxCounts seeding', () => {
  it('populates every inbox badge from a single counts request on mount', async () => {
    mocks.fetchInboxCounts.mockResolvedValue({
      politiek: 165,
      europa: 44,
      regionaal: 62,
      media: 484,
    });

    const { result } = renderHook(() => usePaData(), { wrapper });

    await waitFor(() =>
      expect(result.current.inboxCounts).toEqual({
        politiek: 165,
        europa: 44,
        regionaal: 62,
        media: 484,
      })
    );
    // One request, not one per tab — four capped result sets used to be pulled
    // just to read four numbers off their meta.
    expect(mocks.fetchInboxCounts).toHaveBeenCalledTimes(1);
  });

  it('refreshInboxCounts re-reads every badge, not just the open one', async () => {
    // A curation run that lands after mount used to stay invisible: the badges
    // were a startup snapshot, so only the source you opened caught up.
    mocks.fetchInboxCounts
      .mockResolvedValueOnce({ politiek: 3, europa: 4, regionaal: 0, media: 0 })
      .mockResolvedValue({ politiek: 20, europa: 4, regionaal: 6, media: 0 });

    const { result } = renderHook(() => usePaData(), { wrapper });
    await waitFor(() => expect(result.current.inboxCounts.politiek).toBe(3));

    await act(async () => {
      await result.current.refreshInboxCounts();
    });

    expect(result.current.inboxCounts).toEqual({
      politiek: 20,
      europa: 4,
      regionaal: 6,
      media: 0,
    });
  });

  it('refreshInboxCounts keeps the previous badges when the request fails', async () => {
    // A transient error is not evidence that every source emptied.
    mocks.fetchInboxCounts
      .mockResolvedValueOnce({ politiek: 9, europa: 1, regionaal: 0, media: 0 })
      .mockRejectedValue(new Error('backend blipped'));

    const { result } = renderHook(() => usePaData(), { wrapper });
    await waitFor(() => expect(result.current.inboxCounts.politiek).toBe(9));

    await act(async () => {
      await result.current.refreshInboxCounts();
    });

    expect(result.current.inboxCounts.politiek).toBe(9);
  });

  it('reports a tab that is absent from the response as zero', async () => {
    // A tab whose inbox has emptied is omitted by the endpoint; merging onto the
    // previous state would leave its old count standing.
    mocks.fetchInboxCounts.mockResolvedValue({ politiek: 7 });

    const { result } = renderHook(() => usePaData(), { wrapper });

    await waitFor(() =>
      expect(result.current.inboxCounts).toEqual({
        politiek: 7,
        europa: 0,
        regionaal: 0,
        media: 0,
      })
    );
  });

  it('retries when the counts request fails, so a slow backend still fills the badges', async () => {
    vi.useFakeTimers();
    try {
      mocks.fetchInboxCounts
        .mockRejectedValueOnce(new Error('backend still starting'))
        .mockResolvedValue({ politiek: 5, europa: 1, regionaal: 0, media: 0 });

      const { result } = renderHook(() => usePaData(), { wrapper });

      // The first attempt rejects; without a retry the badges would sit at their
      // 0 fallback until the user happened to open each tab.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(mocks.fetchInboxCounts).toHaveBeenCalledTimes(2);
      expect(result.current.inboxCounts.politiek).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('updateInboxCount sets a single tab count directly', async () => {
    const { result } = renderHook(() => usePaData(), { wrapper });
    await waitFor(() => expect(result.current.signals.status).toBe('ok'));

    act(() => {
      result.current.updateInboxCount('politiek', 7);
    });

    expect(result.current.inboxCounts.politiek).toBe(7);
  });
});

describe('write actions refetch dependent resources', () => {
  it('confirmSignal calls the API then refetches signals, inbox, and notifications', async () => {
    mocks.confirmSignal.mockResolvedValue({ id: 'sig-1', status: 'confirmed' });

    const { result } = renderHook(() => usePaData(), { wrapper });
    await waitFor(() => expect(result.current.signals.status).toBe('ok'));

    const signalsCallsBefore = mocks.fetchSignals.mock.calls.length;
    const inboxCallsBefore = mocks.fetchInbox.mock.calls.length;
    const notificationsCallsBefore = mocks.fetchNotifications.mock.calls.length;

    await act(async () => {
      await result.current.confirmSignal('sig-1');
    });

    expect(mocks.confirmSignal).toHaveBeenCalledWith('sig-1', undefined);
    expect(mocks.fetchSignals.mock.calls.length).toBeGreaterThan(signalsCallsBefore);
    expect(mocks.fetchInbox.mock.calls.length).toBeGreaterThan(inboxCallsBefore);
    expect(mocks.fetchNotifications.mock.calls.length).toBeGreaterThan(notificationsCallsBefore);
  });

  it('watchDossier calls the API then only refetches notifications', async () => {
    mocks.watchDossier.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePaData(), { wrapper });
    await waitFor(() => expect(result.current.signals.status).toBe('ok'));

    const signalsCallsBefore = mocks.fetchSignals.mock.calls.length;
    const notificationsCallsBefore = mocks.fetchNotifications.mock.calls.length;

    await act(async () => {
      await result.current.watchDossier('dossier-1');
    });

    expect(mocks.watchDossier).toHaveBeenCalledWith('dossier-1');
    expect(mocks.fetchNotifications.mock.calls.length).toBeGreaterThan(notificationsCallsBefore);
    expect(mocks.fetchSignals.mock.calls.length).toBe(signalsCallsBefore);
  });

  it('ackNotifications (exposed as the wrapped ackNotificationsAndRefetch) acks then refetches notifications', async () => {
    mocks.ackNotifications.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePaData(), { wrapper });
    await waitFor(() => expect(result.current.signals.status).toBe('ok'));

    const notificationsCallsBefore = mocks.fetchNotifications.mock.calls.length;

    await act(async () => {
      await result.current.ackNotifications(['n1']);
    });

    expect(mocks.ackNotifications).toHaveBeenCalledWith(['n1']);
    expect(mocks.fetchNotifications.mock.calls.length).toBeGreaterThan(notificationsCallsBefore);
  });
});

describe('mutations refetch what the backend recomputes', () => {
  /** Every wrapper below exists to re-read notifications, which the backend
   *  recomputes synchronously on these actions — otherwise a matching watch
   *  only surfaces on the next unrelated action or a page reload. */
  async function ready() {
    mocks.fetchNotifications.mockResolvedValue({ items: [], unseenCount: 0 });
    const { result } = renderHook(() => usePaData(), { wrapper });
    await waitFor(() => expect(mocks.fetchNotifications).toHaveBeenCalled());
    mocks.fetchNotifications.mockClear();
    return result;
  }

  it('watchDossier calls through and refetches notifications', async () => {
    const result = await ready();
    mocks.watchDossier.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.watchDossier('stikstof');
    });

    expect(mocks.watchDossier).toHaveBeenCalledWith('stikstof');
    await waitFor(() => expect(mocks.fetchNotifications).toHaveBeenCalled());
  });

  it('unwatchDossier calls through and refetches notifications', async () => {
    const result = await ready();
    mocks.unwatchDossier.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.unwatchDossier('stikstof');
    });

    expect(mocks.unwatchDossier).toHaveBeenCalledWith('stikstof');
    await waitFor(() => expect(mocks.fetchNotifications).toHaveBeenCalled());
  });

  it('toggleSearchNotify calls through and refetches notifications', async () => {
    const result = await ready();
    mocks.toggleSearchNotify.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.toggleSearchNotify('srch-1', true);
    });

    expect(mocks.toggleSearchNotify).toHaveBeenCalledWith('srch-1', true);
    await waitFor(() => expect(mocks.fetchNotifications).toHaveBeenCalled());
  });

  it('ackNotifications calls through and refetches', async () => {
    const result = await ready();
    mocks.ackNotifications.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.ackNotifications(['ntf-1']);
    });

    expect(mocks.ackNotifications).toHaveBeenCalledWith(['ntf-1']);
    await waitFor(() => expect(mocks.fetchNotifications).toHaveBeenCalled());
  });

  it('linkSignalDossier returns the updated signal and refetches', async () => {
    const result = await ready();
    mocks.linkSignalDossier.mockResolvedValue({ id: 'sig-1', dossierId: 'stikstof' });

    let updated: unknown;
    await act(async () => {
      updated = await result.current.linkSignalDossier('sig-1', 'stikstof');
    });

    expect(updated).toMatchObject({ dossierId: 'stikstof' });
    await waitFor(() => expect(mocks.fetchNotifications).toHaveBeenCalled());
  });

  it('dismissSignal refetches the inbox and the bell', async () => {
    // A dismissal can retire a watch's only unseen match.
    const result = await ready();
    mocks.dismissSignal.mockResolvedValue({ id: 'sig-1', status: 'dismissed' });
    mocks.fetchInbox.mockClear();

    await act(async () => {
      await result.current.dismissSignal('sig-1');
    });

    expect(mocks.dismissSignal).toHaveBeenCalledWith('sig-1');
    await waitFor(() => expect(mocks.fetchInbox).toHaveBeenCalled());
    await waitFor(() => expect(mocks.fetchNotifications).toHaveBeenCalled());
  });
});
