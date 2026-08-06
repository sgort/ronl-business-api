// packages/public-site/src/pages/Regelcatalogus.tsx
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CatalogOrganization } from '../lib/api';
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
  // Lifted out of RegelsTab: that component unmounts whenever `tab` switches
  // away from 'regels' (it's only rendered via `tab === 'regels' && <RegelsTab .../>`),
  // which would otherwise reset which service accordion is open every time the
  // user navigates to another tab and back.
  const [openService, setOpenService] = useState<string | null>(null);
  // Same reasoning as `openService` above: BegrippenTab unmounts on tab
  // switch, so its dienst-filter selection has to live up here to survive
  // navigating away and back.
  const [begrippenService, setBegrippenService] = useState('');

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
          <RegelsTab
            t={t}
            lang={lang}
            services={servicesWithRules}
            rules={data.rules}
            open={openService}
            onOpenChange={setOpenService}
          />
        )}
        {tab === 'begrippen' && (
          <BegrippenTab
            t={t}
            lang={lang}
            concepts={data.concepts}
            service={begrippenService}
            onServiceChange={setBegrippenService}
          />
        )}
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
        <OrgCard key={o.uri} org={o} />
      ))}
    </div>
  );
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function OrgCard({ org }: { org: CatalogOrganization }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="pub-orgcard">
      <div className="pub-orgcard-head">
        <div className="pub-org-logo">
          {org.logo && !imgError ? (
            <img src={org.logo} alt={org.name} onError={() => setImgError(true)} />
          ) : (
            <span>{initialsFor(org.name)}</span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <h3>{org.name}</h3>
          {org.homepage && (
            <a
              href={org.homepage}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, wordBreak: 'break-all' }}
            >
              {org.homepage}
            </a>
          )}
        </div>
      </div>
      <div className="pub-chips">
        {org.services.map((s) => (
          <span key={s.uri} className="pub-chip">
            {s.title}
          </span>
        ))}
      </div>
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
  open,
  onOpenChange,
}: {
  t: Translations;
  lang: Lang;
  services: CatalogService[];
  rules: RegelcatalogusData['rules'];
  /** Which service's accordion is open, or null if none — owned by the
   * parent so it survives this component unmounting on tab switches. */
  open: string | null;
  onOpenChange: (uri: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const needle = q.trim().toLowerCase();

  function toggleRule(key: string) {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
          <details key={service.uri} className="pub-acc" open={isOpen}>
            {/*
              This accordion is exclusive (opening one closes the rest), so it's
              fully React-controlled via `open`/`onClick` rather than the native
              onToggle event: letting the browser drive open state natively and
              only reading it back via onToggle causes a real bug here — closing
              the previously-open <details> via the `open` prop update itself
              re-fires a toggle event (Chrome fires `toggle` on programmatic
              open-attribute changes too), which overwrites the just-set state
              back to "nothing open" before the newly-clicked one visibly opens.
              preventDefault() stops the native toggle so React's state is the
              single source of truth and there's no such feedback loop.
            */}
            <summary
              onClick={(e) => {
                e.preventDefault();
                if (!needle) onOpenChange(open === service.uri ? null : service.uri);
              }}
            >
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
                  {visible.map((r, i) => {
                    const key = `${service.uri}-${i}`;
                    const isExpanded = expandedRules.has(key);
                    return (
                      <Fragment key={key}>
                        <tr>
                          <th
                            style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14 }}
                          >
                            {r.description ? (
                              <button
                                type="button"
                                className="pub-rule-toggle"
                                aria-expanded={isExpanded}
                                onClick={() => toggleRule(key)}
                              >
                                <span className="pub-rule-caret" aria-hidden="true">
                                  {isExpanded ? '▾' : '▸'}
                                </span>
                                {r.ruleTitle}
                              </button>
                            ) : (
                              r.ruleTitle
                            )}
                          </th>
                          <td>
                            {r.validFrom ?? '—'}
                            {r.confidence && (
                              <span className="pub-chip" style={{ marginLeft: 8 }}>
                                {r.confidence}
                              </span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && r.description && (
                          <tr>
                            <td colSpan={2} style={{ padding: '0 0 12px' }}>
                              <pre className="pub-rule-desc">{r.description}</pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
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
  service,
  onServiceChange,
}: {
  t: Translations;
  lang: Lang;
  concepts: RegelcatalogusData['concepts'];
  /** Selected dienst filter, or '' for "all" — owned by the parent so it
   * survives this component unmounting on tab switches. */
  service: string;
  onServiceChange: (service: string) => void;
}) {
  const services = useMemo(() => [...new Set(concepts.map((c) => c.serviceTitle))], [concepts]);
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
          <select id="pub-bg-d" value={service} onChange={(e) => onServiceChange(e.target.value)}>
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
