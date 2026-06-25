import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  confirmSignal as apiConfirmSignal,
  fetchAgenda,
  fetchDossiers,
  fetchInbox,
  fetchSignals,
} from '../../services/pa.api';
import type { Dossier, PlenaryItem, Signal } from '@ronl/shared';

type Status = 'loading' | 'ok' | 'error';

export interface Resource<T> {
  data: T;
  status: Status;
  refetch: () => void;
}

interface PaDataContextValue {
  signals: Resource<Signal[]>;
  inbox: Resource<Signal[]>;
  dossiers: Resource<Dossier[]>;
  agenda: Resource<PlenaryItem[]>;
  confirmSignal: (
    id: string,
    patch?: { duiding?: string; impact?: Signal['impact']; impactLabel?: string; rel?: number }
  ) => Promise<Signal>;
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
  const inboxResource = useResource<Signal[]>(fetchInbox, []);
  const dossiersResource = useResource<Dossier[]>(fetchDossiers, []);
  const agendaResource = useResource<PlenaryItem[]>(fetchAgenda, []);

  const confirmSignal = useCallback(
    async (
      id: string,
      patch?: { duiding?: string; impact?: Signal['impact']; impactLabel?: string; rel?: number }
    ): Promise<Signal> => {
      const result = await apiConfirmSignal(id, patch);
      signalsResource.refetch();
      inboxResource.refetch();
      return result;
    },
    // refetch is stable (created with useCallback(fn, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signalsResource.refetch, inboxResource.refetch]
  );

  return (
    <PaDataContext.Provider
      value={{
        signals: signalsResource,
        inbox: inboxResource,
        dossiers: dossiersResource,
        agenda: agendaResource,
        confirmSignal,
      }}
    >
      {children}
    </PaDataContext.Provider>
  );
}
