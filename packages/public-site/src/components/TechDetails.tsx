// packages/public-site/src/components/TechDetails.tsx
import type { Translations } from '../i18n';

/** A downloadable source file for this item — today only the DMN a rule
 * catalogue service is implemented by, served straight from LDE. */
export interface TechDownload {
  title: string;
  xmlUrl: string;
}

export default function TechDetails({
  t,
  rows,
  downloads,
}: {
  t: Translations;
  rows: [string, string][];
  downloads?: TechDownload[];
}) {
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
            {downloads && downloads.length > 0 && (
              <tr>
                <th>{t.techDmnDownload}</th>
                <td>
                  {downloads.map((d) => (
                    <a
                      key={d.xmlUrl}
                      className="pub-tech-dl"
                      href={d.xmlUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ↓ {d.title}
                    </a>
                  ))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
