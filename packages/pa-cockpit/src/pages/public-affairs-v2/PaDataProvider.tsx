import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  confirmSignal as apiConfirmSignal,
  dismissSignal as apiDismissSignal,
  linkSignalDossier as apiLinkSignalDossier,
  watchDossier as apiWatchDossier,
  unwatchDossier as apiUnwatchDossier,
  toggleSearchNotify as apiToggleSearchNotify,
  fetchAgenda,
  fetchDossiers,
  fetchInbox,
  fetchInboxCounts,
  fetchSignals,
  fetchNotifications,
  ackNotifications,
  type PaNotification,
} from '../../services/pa.api';
import type { Dossier, PlenaryItem, Signal } from '@ronl/shared';

type Status = 'loading' | 'ok' | 'error';

export interface Resource<T> {
  data: T;
  status: Status;
  refetch: () => void;
}

// Tabs that carry an inbox badge (agenda uses a separate agendaCount badge).
const INBOX_TABS = ['politiek', 'europa', 'regionaal', 'media'] as const;

/** Startup count retries — linear backoff, so a slow-starting backend still fills the badges. */
const MAX_COUNT_RETRIES = 4;
const COUNT_RETRY_BASE_MS = 2000;

interface NotificationsState {
  items: PaNotification[];
  unseenCount: number;
}

interface PaDataContextValue {
  signals: Resource<Signal[]>;
  inbox: Resource<Signal[]>;
  dossiers: Resource<Dossier[]>;
  agenda: Resource<PlenaryItem[]>;
  notifications: Resource<NotificationsState>;
  /** Per-tab inbox counts — always accurate; updated by Monitoring on each load. */
  inboxCounts: Record<string, number>;
  updateInboxCount: (tab: string, count: number) => void;
  refreshInboxCounts: () => Promise<void>;
  confirmSignal: (
    id: string,
    patch?: { duiding?: string; impact?: Signal['impact']; impactLabel?: string; rel?: number }
  ) => Promise<Signal>;
  /** Links a watchlist signal to a dossier — can newly match a dossier watch. */
  dismissSignal: (id: string) => Promise<Signal>;
  linkSignalDossier: (id: string, dossierId: string) => Promise<Signal>;
  /** "Watch this dossier" bell — creates/re-enables a personal dossier watch. */
  watchDossier: (dossierId: string) => Promise<void>;
  unwatchDossier: (dossierId: string) => Promise<void>;
  /** Toggle notify on a saved search — drives the WatchBell in ZoekcriteriaSection. */
  toggleSearchNotify: (id: string, notify: boolean) => Promise<void>;
  /** Marks watched-signal notifications seen — omitted ids acks every unseen item. */
  ackNotifications: (ids?: string[]) => Promise<void>;
}

const PaDataContext = createContext<PaDataContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function usePaData(): PaDataContextValue {
  const ctx = useContext(PaDataContext);
  if (!ctx) throw new Error('usePaData must be used inside PaDataProvider');
  return ctx;
}

function useResource<T>(fetcher: () => Promise<T>, initial: T): Resource<T> {
  const [data, setData] = useState<T>(initial);
  const [status, setStatus] = useState<Status>('loading');
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(() => {
    setStatus('loading');
    fetcherRef
      .current()
      .then((d) => {
        setData(d);
        setStatus('ok');
      })
      .catch(() => {
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, status, refetch };
}

export function PaDataProvider({ children }: { children: React.ReactNode }) {
  const signalsResource = useResource<Signal[]>(fetchSignals, []);
  const inboxResource = useResource<Signal[]>(() => fetchInbox().then((r) => r.data), []);
  const dossiersResource = useResource<Dossier[]>(fetchDossiers, []);
  const agendaResource = useResource<PlenaryItem[]>(fetchAgenda, []);
  const notificationsResource = useResource<NotificationsState>(() => fetchNotifications(true), {
    items: [],
    unseenCount: 0,
  });

  const [inboxCounts, setInboxCounts] = useState<Record<string, number>>({});

  const updateInboxCount = useCallback((tab: string, count: number) => {
    setInboxCounts((prev) => ({ ...prev, [tab]: count }));
  }, []);

  const applyCounts = useCallback((counts: Record<string, number>) => {
    // Zeroed base first: a tab whose inbox has emptied is absent from the
    // response, so merging onto the previous state would keep a stale count.
    const base = Object.fromEntries(INBOX_TABS.map((t) => [t, 0]));
    setInboxCounts({ ...base, ...counts });
  }, []);

  /**
   * Re-read every badge in one request.
   *
   * Needed because the counts are a snapshot: seeding them once at mount left
   * every badge frozen at its startup value, so a curation run that arrived
   * afterwards stayed invisible until the user opened each source in turn — at
   * which point that one badge jumped and the others stayed stale. Anything that
   * can change the inbox calls this.
   *
   * Failure keeps the previous numbers rather than zeroing them: a transient
   * error is not evidence that a source emptied.
   */
  const refreshInboxCounts = useCallback(async () => {
    try {
      applyCounts(await fetchInboxCounts());
    } catch {
      /* keep the badges we have */
    }
  }, [applyCounts]);

  // Seed per-tab counts at startup so badges are populated before Monitoring is
  // visited. One counts request rather than four capped inbox fetches.
  //
  // Retried on failure: the cockpit can mount while the backend is still starting
  // (or down), and a badge left at its 0 fallback reads as "this source has no
  // signals" rather than "not loaded yet" — indistinguishable to the user, and it
  // stays wrong until they happen to open that tab.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    const load = () => {
      void fetchInboxCounts()
        .then((counts) => {
          if (cancelled) return;
          applyCounts(counts);
        })
        .catch(() => {
          if (cancelled || attempt >= MAX_COUNT_RETRIES) return;
          attempt += 1;
          setTimeout(load, attempt * COUNT_RETRY_BASE_MS);
        });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [applyCounts]);

  const confirmSignal = useCallback(
    async (
      id: string,
      patch?: { duiding?: string; impact?: Signal['impact']; impactLabel?: string; rel?: number }
    ): Promise<Signal> => {
      const result = await apiConfirmSignal(id, patch);
      signalsResource.refetch();
      inboxResource.refetch();
      // Backend recomputes notifications synchronously on confirm (see pa.routes.ts
      // POST /signals/:id/confirm) — refetch so a newly-matching watch shows up in
      // Meldingen immediately, no page reload needed.
      notificationsResource.refetch();
      return result;
    },
    // refetch is stable (created with useCallback(fn, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signalsResource.refetch, inboxResource.refetch, notificationsResource.refetch]
  );

  const dismissSignal = useCallback(
    async (id: string): Promise<Signal> => {
      const result = await apiDismissSignal(id);
      inboxResource.refetch();
      // A dismissal can retire a watch's only unseen match, so the bell has to
      // be re-read for the same reason a confirm does it.
      notificationsResource.refetch();
      return result;
    },
    // refetch is stable (created with useCallback(fn, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inboxResource.refetch, notificationsResource.refetch]
  );

  const linkSignalDossier = useCallback(
    async (id: string, dossierId: string): Promise<Signal> => {
      const result = await apiLinkSignalDossier(id, dossierId);
      signalsResource.refetch();
      // Backend recomputes notifications synchronously on link too (see pa.routes.ts
      // PATCH /signals/:id) — a dossier-only watch couldn't match while the signal
      // had no dossier_id yet.
      notificationsResource.refetch();
      return result;
    },
    // refetch is stable (created with useCallback(fn, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signalsResource.refetch, notificationsResource.refetch]
  );

  const watchDossier = useCallback(
    async (dossierId: string): Promise<void> => {
      await apiWatchDossier(dossierId);
      // Backend recomputes notifications synchronously on watch-toggle (see
      // pa-dossiers.routes.ts POST /dossiers/:id/watch) — refetch so an
      // already-confirmed backlog for this dossier shows up in Meldingen
      // immediately, not on the next unrelated confirm/link/page reload.
      notificationsResource.refetch();
    },
    // refetch is stable (created with useCallback(fn, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notificationsResource.refetch]
  );

  const unwatchDossier = useCallback(
    async (dossierId: string): Promise<void> => {
      await apiUnwatchDossier(dossierId);
      notificationsResource.refetch();
    },
    // refetch is stable (created with useCallback(fn, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notificationsResource.refetch]
  );

  const toggleSearchNotify = useCallback(
    async (id: string, notify: boolean): Promise<void> => {
      await apiToggleSearchNotify(id, notify);
      // Backend recomputes notifications synchronously when notify flips to
      // true (see pa.routes.ts PATCH /searches/:id) — refetch so an
      // already-confirmed backlog for this watch shows up immediately.
      notificationsResource.refetch();
    },
    // refetch is stable (created with useCallback(fn, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notificationsResource.refetch]
  );

  const ackNotificationsAndRefetch = useCallback(
    async (ids?: string[]) => {
      await ackNotifications(ids);
      notificationsResource.refetch();
    },
    // refetch is stable (created with useCallback(fn, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notificationsResource.refetch]
  );

  return (
    <PaDataContext.Provider
      value={{
        signals: signalsResource,
        inbox: inboxResource,
        dossiers: dossiersResource,
        agenda: agendaResource,
        notifications: notificationsResource,
        inboxCounts,
        refreshInboxCounts,
        updateInboxCount,
        confirmSignal,
        dismissSignal,
        linkSignalDossier,
        watchDossier,
        unwatchDossier,
        toggleSearchNotify,
        ackNotifications: ackNotificationsAndRefetch,
      }}
    >
      {children}
    </PaDataContext.Provider>
  );
}
