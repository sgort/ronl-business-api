import { useCallback, useState } from 'react';
import { businessApi } from '../services/api';

export interface ProfielData {
  data: Record<string, unknown> | null | undefined;
  loading: boolean;
  error: string | null;
  load: (employeeId: string) => Promise<void>;
}

export function useProfielData(_employeeId: string | undefined): ProfielData {
  const [data, setData] = useState<Record<string, unknown> | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi.hr.profile(id);
      if (res.success) setData(res.data ?? null);
      else setData(null);
    } catch {
      setError('Onboardingprofiel kon niet worden geladen.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, load };
}
