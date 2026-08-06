// packages/public-site/src/pages/Regelcatalogus.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';
import { sectionForType, sectionLabel, sectionSub } from '../lib/sections';
import { getRegelcatalogus, type RegelcatalogusData, type CatalogService } from '../lib/api';
import { slugify, hrefFor } from '../lib/slug';
import Crumbs from '../components/Crumbs';
import Tabs from '../components/Tabs';

type Tab = 'organisaties' | 'diensten' | 'regels' | 'begrippen';

export default function Regelcatalogus({ t, lang }: { t: Translations; lang: Lang }) {
  const section = sectionForType('regel');
  const [data, setData] = useState<RegelcatalogusData | null>(null);
  const [tab, setTab] = useState<Tab>('organisaties');

  useEffect(() => {
    getRegelcatalogus().then(setData);
  }, []);

  if (!data) {
    return (
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">{lang === 'nl' ? 'Laden…' : 'Loading…'}</div>
      </main>
    );
  }

  const servicesWithRules = data.services.filter((s) =>
    data.rules.some((r) => r.serviceTitle === s.title)
  );

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
        <Tabs
          tabs={[
            { id: 'organisaties', label: t.tabOrg, count: data.organizations.length },
            { id: 'diensten', label: t.tabDienst, count: data.services.length },
            { id: 'regels', label: t.tabRegel, count: data.rules.length },
            { id: 'begrippen', label: t.tabBegrip, count: data.concepts.length },
          ]}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
        />
        {tab === 'organisaties' && <OrganisatiesTab organizations={data.organizations} />}
        {tab === 'diensten' && <DienstenTab services={data.services} />}
        {tab === 'regels' && (
          <RegelsTab t={t} lang={lang} services={servicesWithRules} rules={data.rules} />
        )}
        {tab === 'begrippen' && <BegrippenTab t={t} lang={lang} concepts={data.concepts} />}
      </div>
    </main>
  );
}

function OrganisatiesTab({
  organizations,
}: {
  organizations: RegelcatalogusData['organizations'];
}) {
  return (
    <div className="pub-orgcards">
      {organizations.map((o) => (
        <div key={o.uri} className="pub-orgcard">
          <h3>{o.name}</h3>
          {o.homepage && (
            <a
              href={o.homepage}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, wordBreak: 'break-all' }}
            >
              {o.homepage}
            </a>
          )}
          <div className="pub-chips">
            {o.services.map((s) => (
              <span key={s.uri} className="pub-chip">
                {s.title}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DienstenTab({ services }: { services: CatalogService[] }) {
  return (
    <div>
      {services.map((s) => (
        <article key={s.uri} className="pub-hit">
          <h3>
            <Link to={hrefFor({ type: 'regel', slug: slugify(s.title) })}>{s.title}</Link>
          </h3>
          <p>{s.description}</p>
        </article>
      ))}
    </div>
  );
}

function RegelsTab({
  t,
  lang,
  services,
  rules,
}: {
  t: Translations;
  lang: Lang;
  services: CatalogService[];
  rules: RegelcatalogusData['rules'];
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(services[0]?.uri ?? null);
  const needle = q.trim().toLowerCase();

  return (
    <div>
      <div className="pub-filterbar">
        <div className="pub-field">
          <label htmlFor="pub-rule-q">{t.filterRule}</label>
          <input
            id="pub-rule-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.filterRule}
          />
        </div>
      </div>
      {services.map((service) => {
        const serviceRules = rules.filter((r) => r.serviceTitle === service.title);
        const visible = needle
          ? serviceRules.filter((r) => r.ruleTitle.toLowerCase().includes(needle))
          : serviceRules;
        if (needle && visible.length === 0) return null;
        const isOpen = needle ? true : open === service.uri;
        return (
          <details
            key={service.uri}
            className="pub-acc"
            open={isOpen}
            onToggle={(e) => {
              if (!needle) setOpen(e.currentTarget.open ? service.uri : null);
            }}
          >
            <summary>
              <b>{service.title}</b>
              <span className="pub-tc">
                {visible.length} / {serviceRules.length}
              </span>
            </summary>
            <div className="pub-acc-in">
              <table className="pub-kv">
                <thead>
                  <tr>
                    <th>{t.tabRegel}</th>
                    <th style={{ width: '9rem' }}>{t.validFrom}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={i}>
                      <th style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14 }}>
                        {r.ruleTitle}
                      </th>
                      <td>{r.validFrom ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ marginTop: 12 }}>
                <Link to={hrefFor({ type: 'regel', slug: slugify(service.title) })}>
                  {lang === 'nl' ? 'Naar de dienst' : 'Go to the service'} →
                </Link>
              </p>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function BegrippenTab({
  t,
  lang,
  concepts,
}: {
  t: Translations;
  lang: Lang;
  concepts: RegelcatalogusData['concepts'];
}) {
  const services = useMemo(() => [...new Set(concepts.map((c) => c.serviceTitle))], [concepts]);
  const [service, setService] = useState('');
  const [q, setQ] = useState('');
  const rows = concepts.filter(
    (c) =>
      (!service || c.serviceTitle === service) &&
      (!q.trim() || c.prefLabel.toLowerCase().includes(q.trim().toLowerCase()))
  );

  return (
    <div>
      <div className="pub-filterbar">
        <div className="pub-field">
          <label htmlFor="pub-bg-q">{t.filterConcept}</label>
          <input
            id="pub-bg-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.filterConcept}
          />
        </div>
        <div className="pub-field">
          <label htmlFor="pub-bg-d">{t.filterDienst}</label>
          <select id="pub-bg-d" value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">{t.allDiensten}</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginBottom: 10 }} aria-live="polite">
        {rows.length}{' '}
        {lang === 'nl' ? `van ${concepts.length} begrippen` : `of ${concepts.length} concepts`} ·{' '}
        {lang === 'nl'
          ? 'de volledige thesaurus staat in het '
          : 'the full thesaurus lives in the '}
        <Link to="/woordenboek">{lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary'}</Link>
      </p>
      <table className="pub-kv">
        <thead>
          <tr>
            <th>{t.concept}</th>
            <th>{t.dienst}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i}>
              <th style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14.5 }}>
                <a
                  href={`https://skosmos.open-regels.nl/ronl/${lang}/search?clang=${lang}&q=${encodeURIComponent(c.prefLabel)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.prefLabel}
                </a>
              </th>
              <td style={{ fontFamily: 'var(--pub-font)', fontSize: 13.5 }}>{c.serviceTitle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
