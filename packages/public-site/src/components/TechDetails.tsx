// packages/public-site/src/components/TechDetails.tsx
import type { Translations } from '../i18n';

export default function TechDetails({ t, rows }: { t: Translations; rows: [string, string][] }) {
  return (
    <details className="pub-tech">
      <summary>{t.tech}</summary>
      <div className="pub-tech-in">
        <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginBottom: 12 }}>{t.techLede}</p>
        <table className="pub-kv">
          <tbody>
            {rows.map(([k, v], i) => (
              <tr key={i}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
