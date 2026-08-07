// packages/public-site/src/components/Footer.tsx
import { Link } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';
import { PUB_SECTIONS, WOORDENBOEK_PATH, sectionLabel } from '../lib/sections';

export default function Footer({ t, lang }: { t: Translations; lang: Lang }) {
  // The site's own origin (per environment — ACC shows the ACC URL, not prod) and
  // the current release, both shown at the foot. Fallback keeps it robust if
  // VITE_SITE_URL is ever unset in a build.
  const siteUrl = import.meta.env.VITE_SITE_URL || 'https://publiek.open-regels.nl';
  const siteHost = siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return (
    <footer className="pub-footer">
      <div className="pub-wrap">
        <div className="pub-footer-cols">
          <div>
            <h2>{t.footerAbout}</h2>
            <p style={{ color: 'var(--ro-ink-2)', maxWidth: '40ch' }}>{t.footerNote}</p>
          </div>
          <div>
            <h2>{t.footerBrowse}</h2>
            <ul>
              {PUB_SECTIONS.map((s) => (
                <li key={s.id}>
                  <Link to={s.path}>{sectionLabel(s, lang)}</Link>
                </li>
              ))}
              <li>
                <Link to={WOORDENBOEK_PATH}>
                  {lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary'}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>{t.footerLegal}</h2>
            <ul>
              <li>
                <Link to="/toegankelijkheid">{t.footerLinks[0][0]}</Link>
              </li>
              <li>
                <Link to="/open-data">{t.footerLinks[1][0]}</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="pub-footer-bottom">
          <span>Open Regels Nederland · Provincie Flevoland</span>
          <span style={{ fontFamily: 'var(--pub-mono)', fontSize: 12.5 }}>
            <a href={siteUrl}>{siteHost}</a>
            {' · '}
            <span>v{__APP_VERSION__}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
