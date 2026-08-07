// packages/public-site/src/pages/SectionIndex.tsx
import { useEffect, useMemo, useState } from 'react';
import type { Translations, Lang } from '../i18n';
import { sectionForType, sectionLabel, sectionSub, type PubType } from '../lib/sections';
import { getBerichten, getNieuws, getProducten, getProcessen, type PublicHit } from '../lib/api';
import { mapToHits } from '../lib/sectionHits';
import { readPrerenderedData } from '../lib/prerenderedData';
import SearchForm from '../components/SearchForm';
import Hit from '../components/Hit';
import Crumbs from '../components/Crumbs';

async function loadItems(type: PubType): Promise<PublicHit[]> {
  switch (type) {
    case 'bericht':
      return mapToHits('bericht', (await getBerichten(200)).items);
    case 'nieuws':
      return mapToHits('nieuws', (await getNieuws(200)).items);
    case 'product':
      return mapToHits('product', (await getProducten(200)).items);
    case 'proces':
      return mapToHits('proces', await getProcessen());
    case 'regel':
      return []; // Regelcatalogus (Task 15) owns this type
  }
}

export default function SectionIndex({
  t,
  lang,
  type,
}: {
  t: Translations;
  lang: Lang;
  type: PubType;
}) {
  const section = sectionForType(type);
  // Seed from the data the prerender embedded for this section's route so the
  // first client render already shows the list — no "Laden…" placeholder that
  // then grows and shifts the footer (the section-page CLS). Cold loads (no
  // blob) still fetch.
  const [all, setAll] = useState<PublicHit[]>(
    () => readPrerenderedData<PublicHit[]>(section.path) ?? []
  );
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState<boolean>(
    () => readPrerenderedData<PublicHit[]>(section.path) == null
  );

  useEffect(() => {
    const seed = readPrerenderedData<PublicHit[]>(sectionForType(type).path);
    if (seed) {
      setAll(seed);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadItems(type).then((items) => {
      if (!cancelled) {
        setAll(items);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) || item.summary.toLowerCase().includes(needle)
    );
  }, [all, q]);

  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <Crumbs
          lang={lang}
          trail={[{ label: t.navHome, to: '/' }, { label: sectionLabel(section, lang) }]}
        />
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>
          {sectionLabel(section, lang)}
        </h1>
        <p className="pub-lede-2">{sectionSub(section, lang)}</p>
        <div style={{ maxWidth: '34rem', marginBottom: 20 }}>
          <SearchForm t={t} value={q} onSubmit={setQ} id={`pub-q-${section.id}`} />
        </div>
        <p
          aria-live="polite"
          style={{
            fontSize: 14,
            color: 'var(--ro-ink-2)',
            borderBottom: '1px solid var(--ro-rule-2)',
            paddingBottom: 10,
          }}
        >
          {loading ? (lang === 'nl' ? 'Laden…' : 'Loading…') : `${filtered.length} items`}
        </p>
        {!loading && filtered.map((item) => <Hit key={item.id} item={item} q={q} lang={lang} />)}
      </div>
    </main>
  );
}
