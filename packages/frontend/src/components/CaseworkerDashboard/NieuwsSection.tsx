import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { NieuwsItem } from '../../services/api';
import { formatDate } from '../../utils/formatDate';

export default function NieuwsSection() {
  const [items, setItems] = useState<NieuwsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi.portal.nieuws(10);
      if (res.success && res.data) setItems(res.data.items);
      else setError('Nieuws kon niet worden geladen.');
    } catch {
      setError('Nieuws kon niet worden geladen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl space-y-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-full mb-1" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
        {error}
        <button onClick={load} className="ml-3 underline">
          Opnieuw proberen
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-2xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        Geen nieuwsberichten beschikbaar.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-3">
      {items.map((item) => (
        <article key={item.id} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-gray-900 text-sm hover:underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  {item.title}
                </a>
              ) : (
                <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
              )}
              <p className="text-gray-500 text-sm mt-1 leading-relaxed line-clamp-2">
                {item.summary}
              </p>
            </div>
            {item.category && (
              <span className="flex-shrink-0 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {item.category}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
            <span>{item.source.name}</span>
            {item.publishedAt && (
              <>
                <span>·</span>
                <span>{formatDate(item.publishedAt)}</span>
              </>
            )}
            {item.url && (
              <>
                <span>·</span>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Lees meer →
                </a>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
