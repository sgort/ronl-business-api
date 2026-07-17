import { EXCLUDED_VARS, humanizeKey } from './processSteps';

interface Props {
  variables: Record<string, unknown> | null;
  loading?: boolean;
}

export default function ProcessVarsSection({ variables, loading }: Props) {
  if (loading) return <p className="v2-taken-state">Laden…</p>;
  if (!variables || Object.keys(variables).length === 0)
    return <p className="v2-taken-state">Geen procesgegevens.</p>;
  return (
    <dl className="v2-taken-vars">
      {Object.entries(variables)
        .filter(([k]) => !EXCLUDED_VARS.includes(k))
        .map(([k, v]) => (
          <div key={k}>
            <dt title={k}>{humanizeKey(k)}</dt>
            <dd>
              {v === null || v === undefined
                ? '—'
                : typeof v === 'object'
                  ? JSON.stringify(v)
                  : String(v)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
