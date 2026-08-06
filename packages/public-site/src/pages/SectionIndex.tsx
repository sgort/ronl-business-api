// packages/public-site/src/pages/SectionIndex.tsx
import { useEffect, useMemo, useState } from 'react';
import type { Translations, Lang } from '../i18n';
import { sectionForType, sectionLabel, sectionSub, type PubType } from '../lib/sections';
import { getBerichten, getNieuws, getProducten, getProcessen, type PublicHit } from '../lib/api';
import SearchForm from '../components/SearchForm';
import Hit from '../components/Hit';
import Crumbs from '../components/Crumbs';

async function loadItems(type: PubType): Promise<PublicHit[]> {
  switch (type) {
    case 'bericht': {
      const { items } = await getBerichten(200);
      return items.map((b) => ({
        id: b.id,
        slug: b.id,
        type: 'bericht' as const,
        title: b.subject,
        summary: b.preview,
        org: b.sender.name,
        date: b.publishedAt,
        audience: [],
        external: null,
        facts: [],
        tech: [],
      }));
    }
    case 'nieuws': {
      const { items } = await getNieuws(200);
      return items.map((n) => ({
        id: n.id,
        slug: n.id,
        type: 'nieuws' as const,
        title: n.title,
        summary: n.summary,
        org: n.source.name,
        date: n.publishedAt,
        audience: [],
        external: null,
        facts: [],
        tech: [],
      }));
    }
    case 'product': {
      const { items } = await getProducten(200);
      return items.map((p) => ({
        id: p.id,
        slug: p.id,
        type: 'product' as const,
        title: p.title,
        summary: p.description,
        org: 'Provincie Flevoland',
        date: p.modified,
        audience: p.audience,
        external: null,
        facts: [],
        tech: [],
      }));
    }
    case 'proces': {
      const items = await getProcessen();
      return items.map((p) => ({
        id: p.key,
        slug: p.key,
        type: 'proces' as const,
        title: p.naam,
        summary: p.beschrijving ?? '',
        org: 'Provincie Flevoland',
        date: p.gepubliceerd,
        audience: [],
        external: null,
        facts: [],
        tech: [],
      }));
    }
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
  const [all, setAll] = useState<PublicHit[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
