import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { AuditLogRecord } from '../../services/api';
import type { KeycloakUser } from '@ronl/shared';

const RESULT_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failure: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
};

interface Props {
  activeTab: 'audit-overzicht' | 'audit-details';
  user: KeycloakUser | null;
}

export default function AuditSection({ activeTab, user }: Props) {
  const isAdmin = user?.roles?.includes('admin') ?? false;

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = async (nextOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi.admin.auditLogs(50, nextOffset);
      if (res.success && res.data) {
        setLogs((prev) => (nextOffset === 0 ? res.data!.items : [...prev, ...res.data!.items]));
        setOffset(nextOffset);
        setTotal(res.data.pagination.total);
        setHasMore(res.data.pagination.hasMore);
      } else {
        setError('Auditlog kon niet worden geladen.');
      }
    } catch {
      setError('Auditlog kon niet worden geladen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-lg">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-3xl mb-4 text-gray-300">🔒</p>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Toegang beperkt</h2>
          <p className="text-gray-400 text-sm">Alleen beheerders kunnen het auditlog inzien.</p>
        </div>
      </div>
    );
  }

  const shell = (children: React.ReactNode) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{total} records in totaal</p>
        <button
          onClick={() => load(0)}
          className="text-xs underline"
          style={{ color: 'var(--color-primary)' }}
        >
          Vernieuwen
        </button>
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
          <button onClick={() => load(0)} className="ml-3 underline">
            Opnieuw proberen
          </button>
        </div>
      )}
      {loading && logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm animate-pulse">
          Auditlog laden…
        </div>
      ) : (
        <>
          {children}
          {hasMore && (
            <button
              onClick={() => load(offset + 50)}
              disabled={loading}
              className="w-full py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {loading ? 'Laden…' : 'Meer laden'}
            </button>
          )}
        </>
      )}
    </div>
  );

  if (activeTab === 'audit-overzicht') {
    return shell(
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-medium">Tijdstip</th>
              <th className="text-left px-4 py-3 font-medium">Tenant</th>
              <th className="text-left px-4 py-3 font-medium">Gebruiker</th>
              <th className="text-left px-4 py-3 font-medium">Actie</th>
              <th className="text-left px-4 py-3 font-medium">Resultaat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap font-mono text-xs">
                  {new Date(row.timestamp).toLocaleString('nl-NL')}
                </td>
                <td className="px-4 py-2.5 text-gray-700">{row.tenant_id}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                  {row.user_id.slice(0, 8)}…
                </td>
                <td className="px-4 py-2.5 text-gray-800 font-mono text-xs max-w-xs truncate">
                  {row.action}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_STYLES[row.result] ?? ''}`}
                  >
                    {row.result}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return shell(
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400 uppercase tracking-wider">
            <th className="text-left px-4 py-3 font-medium">Actie</th>
            <th className="text-left px-4 py-3 font-medium">Resultaat</th>
            <th className="text-left px-4 py-3 font-medium">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {logs.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50 transition-colors align-top">
              <td className="px-4 py-2.5 font-mono text-xs text-gray-800 max-w-xs whitespace-normal break-all">
                {row.action}
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${RESULT_STYLES[row.result] ?? ''}`}
                >
                  {row.result}
                </span>
              </td>
              <td className="px-4 py-2.5">
                {row.details ? (
                  <dl className="space-y-0.5">
                    {Object.entries(row.details).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <dt className="text-gray-400 flex-shrink-0">{k}</dt>
                        <dd className="text-gray-700 font-mono break-all">
                          {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
