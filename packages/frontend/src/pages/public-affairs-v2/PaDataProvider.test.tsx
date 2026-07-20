// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { PaDataProvider, usePaData } from './PaDataProvider';

const mocks = vi.hoisted(() => ({
  confirmSignal: vi.fn(),
  linkSignalDossier: vi.fn(),
  watchDossier: vi.fn(),
  unwatchDossier: vi.fn(),
  toggleSearchNotify: vi.fn(),
  fetchAgenda: vi.fn(),
  fetchDossiers: vi.fn(),
  fetchInbox: vi.fn(),
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
  it('fetches per-tab inbox counts for every inbox tab on mount', async () => {
    mocks.fetchInbox.mockResolvedValue({ data: [], meta: { total: 3, cap: 100, capped: false } });

    const { result } = renderHook(() => usePaData(), { wrapper });

    await waitFor(() =>
      expect(result.current.inboxCounts).toEqual({
        politiek: 3,
        europa: 3,
        regionaal: 3,
        media: 3,
      })
    );
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
