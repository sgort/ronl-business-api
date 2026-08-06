// packages/public-site/src/pages/Home.tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';
import { PUB_SECTIONS, sectionLabel, sectionSub, type PubType } from '../lib/sections';
import { getBerichten, getNieuws, getProducten, getRegelcatalogus, getProcessen } from '../lib/api';
import SearchForm from '../components/SearchForm';
import TypeTag from '../components/TypeTag';

export default function Home({ t, lang }: { t: Translations; lang: Lang }) {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Partial<Record<PubType, number>>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      getBerichten(1),
      getNieuws(1),
      getProducten(1),
      getRegelcatalogus(),
      getProcessen(),
    ]).then(([b, n, p, r, proc]) => {
      if (cancelled) return;
      setCounts({
        bericht: b.status === 'fulfilled' ? b.value.total : 0,
        nieuws: n.status === 'fulfilled' ? n.value.total : 0,
        product: p.status === 'fulfilled' ? p.value.total : 0,
        regel: r.status === 'fulfilled' ? r.value.services.length : 0,
        proces: proc.status === 'fulfilled' ? proc.value.length : 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSearch(q: string) {
    navigate(q ? `/zoeken?q=${encodeURIComponent(q)}` : '/zoeken');
  }

  return (
    <>
      <div
        style={{
          background: 'var(--ro-bg)',
          borderBottom: '1px solid var(--ro-rule-2)',
          padding: '26px 0',
        }}
      >
        <div
          className="pub-wrap"
          style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 22rem', minWidth: 0 }}>
            <SearchForm t={t} value="" onSubmit={handleSearch} id="pub-q-bar" />
          </div>
          <p style={{ fontSize: 14, color: 'var(--ro-ink-2)', flex: '0 1 20rem' }}>
            {lang === 'nl'
              ? 'Doorzoekt alle vijf bronnen tegelijk — berichten, nieuws, producten, regels en processen.'
              : 'Searches all five sources at once — announcements, news, products, rules and processes.'}
          </p>
        </div>
      </div>
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">
          <h1 className="pub-section-h" style={{ fontSize: 30 }}>
            {t.heroTitle}
          </h1>
          <p className="pub-lede-2" style={{ fontSize: 17 }}>
            {t.heroLede}
          </p>
          <div className="pub-cards" style={{ marginTop: 8 }}>
            {PUB_SECTIONS.map((s) => (
              <Link key={s.id} to={s.path} className="pub-card" style={{ minHeight: 168 }}>
                <span style={{ alignSelf: 'flex-start' }}>
                  <TypeTag type={s.type} lang={lang} />
                </span>
                <h3 style={{ fontSize: 20, marginTop: 4 }}>{sectionLabel(s, lang)}</h3>
                <p>{sectionSub(s, lang)}</p>
                <span className="pub-count">
                  {counts[s.type] ?? '…'} {lang === 'nl' ? 'items' : 'items'} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
