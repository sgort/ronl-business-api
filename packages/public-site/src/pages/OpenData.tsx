// packages/public-site/src/pages/OpenData.tsx
import type { Lang } from '../i18n';
import Crumbs from '../components/Crumbs';

const ENDPOINTS: [string, string][] = [
  ['/v1/public/zoeken?q=', 'Federated search across all five sources'],
  ['/v1/public/berichten', 'Announcements — Provincie Flevoland'],
  ['/v1/public/nieuws', 'National news — Rijksoverheid'],
  ['/v1/public/producten-diensten', 'Products & services — Samenwerkende Catalogi (UPL)'],
  ['/v1/public/regelcatalogus', 'Rule catalogue — RONL knowledge graph'],
  ['/v1/public/processen', 'Process library — Camunda deployment index'],
];

export default function OpenData({ lang }: { lang: Lang }) {
  const nl = lang === 'nl';
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap pub-detail-body">
        <Crumbs
          lang={lang}
          trail={[
            { label: nl ? 'Home' : 'Home', to: '/' },
            { label: nl ? 'Open data' : 'Open data' },
          ]}
        />
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>
          {nl ? 'Open data & API' : 'Open data & API'}
        </h1>
        <p className="pub-lede-2">
          {nl
            ? 'Elk item op deze site is ook machineleesbaar op te vragen via een open, anonieme API. Geen sleutel, geen account.'
            : 'Every item on this site is also machine-readable through an open, anonymous API. No key, no account.'}
        </p>
        <h2>{nl ? 'Endpoints' : 'Endpoints'}</h2>
        <table className="pub-kv">
          <thead>
            <tr>
              <th>{nl ? 'Pad' : 'Path'}</th>
              <th>{nl ? 'Omschrijving' : 'Description'}</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map(([path, desc]) => (
              <tr key={path}>
                <th style={{ fontWeight: 400, fontFamily: 'var(--pub-mono)', fontSize: 13 }}>
                  GET {path}
                </th>
                <td style={{ fontFamily: 'var(--pub-font)', fontSize: 13.5 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>{nl ? 'Voorwaarden' : 'Terms'}</h2>
        <p>
          {nl
            ? 'Alle data is publieke overheidsinformatie: vrij te hergebruiken, zonder auteursrechtelijke beperking.'
            : 'All data is public government information: free to reuse, without copyright restriction.'}
        </p>
      </div>
    </main>
  );
}
