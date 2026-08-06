// packages/public-site/src/pages/Results.tsx
import { useEffect, useState } from 'react';
import type { Translations, Lang } from '../i18n';
import { PUB_TYPE_LABEL, type PubType } from '../lib/sections';
import { searchPublic, type SearchResponse } from '../lib/api';
import { useQueryState, type ResultsQuery } from '../lib/useQueryState';
import SearchForm from '../components/SearchForm';
import Facet, { type FacetOption } from '../components/Facet';
import Hit from '../components/Hit';
import Crumbs from '../components/Crumbs';

function labelledOptions(
  pairs: [string, number][],
  labelFor?: (v: string) => string
): FacetOption[] {
  return pairs.map(([value, count]) => ({ value, count, label: labelFor?.(value) }));
}

export default function Results({ t, lang }: { t: Translations; lang: Lang }) {
  const [query, setQuery] = useQueryState();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const facetKey = `${query.q}|${query.soort.join(',')}|${query.bron.join(',')}|${query.doelgroep.join(',')}|${query.sort}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchPublic(query)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(lang === 'nl' ? 'Zoeken is mislukt.' : 'Search failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetKey]);

  function toggle(key: 'soort' | 'bron' | 'doelgroep', value: string) {
    const current = query[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setQuery({ [key]: next } as Partial<ResultsQuery>);
  }

  const activeCount = query.soort.length + query.bron.length + query.doelgroep.length;

  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <Crumbs lang={lang} trail={[{ label: t.navHome, to: '/' }, { label: t.results }]} />
        <div style={{ maxWidth: '44rem', marginBottom: 26 }}>
          <SearchForm t={t} value={query.q} onSubmit={(q) => setQuery({ q })} id="pub-q-results" />
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="pub-results">
          <div className="pub-facets" role="region" aria-label={t.filters}>
            <h2>{t.filters}</h2>
            <Facet
              legend={t.type}
              options={labelledOptions(
                data?.facets.soort ?? [],
                (v) => PUB_TYPE_LABEL[v as PubType]?.[lang] ?? v
              )}
              selected={query.soort}
              onToggle={(v) => toggle('soort', v)}
            />
            <Facet
              legend={t.source}
              options={labelledOptions(data?.facets.bron ?? [])}
              selected={query.bron}
              onToggle={(v) => toggle('bron', v)}
            />
            <Facet
              legend={t.audience}
              options={labelledOptions(data?.facets.doelgroep ?? [])}
              selected={query.doelgroep}
              onToggle={(v) => toggle('doelgroep', v)}
            />
            {activeCount > 0 && (
              <button
                type="button"
                className="pub-clear"
                onClick={() => setQuery({ soort: [], bron: [], doelgroep: [] })}
              >
                {t.clear} ({activeCount})
              </button>
            )}
          </div>
          <div>
            <div className="pub-resulthead">
              <div>
                <h1 style={{ fontSize: 24 }}>{query.q ? `“${query.q}”` : t.results}</h1>
                <p aria-live="polite" style={{ marginTop: 4 }}>
                  {loading
                    ? lang === 'nl'
                      ? 'Zoeken…'
                      : 'Searching…'
                    : `${data?.total ?? 0} ${query.q ? `${t.resultsFor} “${query.q}”` : t.allResults}`}
                </p>
              </div>
              <div className="pub-sort">
                <label htmlFor="pub-sort">{t.sort}</label>
                <select
                  id="pub-sort"
                  value={query.sort}
                  onChange={(e) => setQuery({ sort: e.target.value as ResultsQuery['sort'] })}
                >
                  <option value="rel">{t.sortRel}</option>
                  <option value="date">{t.sortDate}</option>
                  <option value="az">{t.sortAz}</option>
                </select>
              </div>
            </div>
            {!loading && data && data.items.length === 0 ? (
              <div className="pub-empty">
                <h3>{t.noResults}</h3>
                <p style={{ color: 'var(--ro-ink-2)' }}>{t.noResultsBody}</p>
              </div>
            ) : (
              (data?.items ?? []).map((item) => (
                <Hit key={item.id} item={item} q={query.q} lang={lang} />
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
