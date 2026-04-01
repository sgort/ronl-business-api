import { useEffect, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL as string;

// ── Field extraction config ───────────────────────────────────────────────────
// Each entry defines a labelled field to show in the expanded card.
// `sectionHeading` is matched case-insensitively against the markdown `## N. Heading` lines.
// The text between that heading and the next `---` separator is extracted and trimmed.

interface WorkItemField {
  label: string;
  sectionHeading: string; // substring to match in the ## heading line
}

const WORK_ITEM_FIELDS: WorkItemField[] = [
  { label: 'Indiener', sectionHeading: 'Submitter' },
  { label: 'Beschrijving', sectionHeading: 'Description' },
  { label: 'Gewenst resultaat', sectionHeading: 'Desired Outcome' },
];

function extractSection(body: string, heading: string): string {
  // Match a ## heading line containing the search string (case-insensitive)
  const headingPattern = new RegExp(
    `##[^\\n]*${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n`,
    'i'
  );
  const match = headingPattern.exec(body);
  if (!match) return '';

  const start = match.index + match[0].length;
  // Content ends at the next `---` separator or next `## ` heading
  const rest = body.slice(start);
  const endMatch = /\n---|\n## /.exec(rest);
  const content = endMatch ? rest.slice(0, endMatch.index) : rest;
  return content.trim();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UseCase {
  iid: number;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  web_url: string;
  labels: string[];
  assignees: string[];
  description: string;
}

interface Props {
  state: 'opened' | 'closed';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IouZakenSection({ state }: Props) {
  const [items, setItems] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE_URL}/public/use-cases?state=${state}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setItems(data.data ?? []);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const sectionTitle = state === 'opened' ? 'Actieve zaken' : 'Archief';
  const emptyMessage =
    state === 'opened'
      ? "Er zijn momenteel geen openstaande gebruiksscenario's."
      : "Er zijn geen gesloten gebruiksscenario's.";

  if (loading) {
    return (
      <div className="max-w-2xl space-y-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
        Kon de gegevens niet ophalen: {error}
        <button onClick={load} className="ml-3 underline">
          Opnieuw proberen
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">{sectionTitle}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
          <button
            onClick={load}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ↺ Vernieuwen
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-3 text-gray-300">📋</p>
          <p className="text-sm text-gray-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isExpanded = expandedId === item.iid;
            return (
              <div
                key={item.iid}
                className="bg-white rounded-lg shadow-sm border-2 overflow-hidden transition-colors"
                style={
                  isExpanded
                    ? { borderColor: 'var(--color-primary, #0046ad)' }
                    : { borderColor: 'transparent' }
                }
              >
                {/* ── Header row ── */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.iid)}
                  className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">
                      #{item.iid} {item.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {item.labels.map((label) => (
                        <span
                          key={label}
                          className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100"
                        >
                          {label}
                        </span>
                      ))}
                      <span className="text-xs text-gray-400">
                        {new Date(item.created_at).toLocaleDateString('nl-NL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                      {item.assignees.length > 0 && (
                        <span className="text-xs text-gray-400">→ {item.assignees.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.state === 'opened'
                          ? 'bg-green-50 text-green-700 border border-green-100'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}
                    >
                      {item.state === 'opened' ? 'Open' : 'Gesloten'}
                    </span>
                    <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* ── Expanded detail ── */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-white space-y-4">
                    {WORK_ITEM_FIELDS.map((field) => {
                      const content = extractSection(item.description, field.sectionHeading);
                      if (!content) return null;
                      return (
                        <div key={field.label}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            {field.label}
                          </p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {content}
                          </p>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t border-gray-100">
                      <a
                        href={item.web_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:underline"
                        style={{ color: 'var(--color-primary, #0046ad)' }}
                      >
                        Bekijk werkitem #{item.iid} →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
