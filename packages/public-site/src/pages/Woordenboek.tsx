// packages/public-site/src/pages/Woordenboek.tsx
import type { Translations, Lang } from '../i18n';
import Crumbs from '../components/Crumbs';

const SKOSMOS_BASE = 'https://skosmos.open-regels.nl/ronl';

export default function Woordenboek({ t, lang }: { t: Translations; lang: Lang }) {
  const label = lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary';
  const sub =
    lang === 'nl'
      ? 'De volledige RONL-thesaurus (Skosmos): alle begrippen, hun definities en onderlinge relaties.'
      : 'The full RONL thesaurus (Skosmos): every concept, its definition and its relations.';
  const src = `${SKOSMOS_BASE}/${lang}/`;

  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <Crumbs lang={lang} trail={[{ label: t.navHome, to: '/' }, { label }]} />
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>
          {label}
        </h1>
        <p className="pub-lede-2">{sub}</p>
        <div className="pub-embed-bar">
          <span>
            {lang === 'nl' ? 'Bron' : 'Source'}:{' '}
            <a href={`${SKOSMOS_BASE}/`} target="_blank" rel="noreferrer">
              Skosmos
            </a>{' '}
            · RONL Concepts
          </span>
          <a href={src} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>
            {t.embedOpen} ↗
          </a>
        </div>
        <div className="pub-embed">
          <iframe src={src} title={`${label} — Skosmos (RONL Concepts)`} loading="lazy" />
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginTop: 10, maxWidth: '70ch' }}>
          {t.embedNote}
        </p>
      </div>
    </main>
  );
}
