import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface ResultsQuery {
  q: string;
  soort: string[];
  bron: string[];
  doelgroep: string[];
  sort: 'rel' | 'date' | 'az';
}

function csv(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

/**
 * Reads/writes the Results page's filter state as URL search params, so a
 * filtered result set is always a shareable, bookmarkable link — never only
 * component state.
 */
export function useQueryState(): [ResultsQuery, (next: Partial<ResultsQuery>) => void] {
  const [params, setParams] = useSearchParams();

  const query = useMemo<ResultsQuery>(
    () => ({
      q: params.get('q') ?? '',
      soort: csv(params.get('soort')),
      bron: csv(params.get('bron')),
      doelgroep: csv(params.get('doelgroep')),
      sort: (params.get('sort') as ResultsQuery['sort']) ?? 'rel',
    }),
    [params]
  );

  const setQuery = useCallback(
    (next: Partial<ResultsQuery>) => {
      const merged: ResultsQuery = { ...query, ...next };
      const nextParams = new URLSearchParams();
      if (merged.q) nextParams.set('q', merged.q);
      if (merged.soort.length) nextParams.set('soort', merged.soort.join(','));
      if (merged.bron.length) nextParams.set('bron', merged.bron.join(','));
      if (merged.doelgroep.length) nextParams.set('doelgroep', merged.doelgroep.join(','));
      if (merged.sort !== 'rel') nextParams.set('sort', merged.sort);
      setParams(nextParams, { replace: true });
    },
    [query, setParams]
  );

  return [query, setQuery];
}
