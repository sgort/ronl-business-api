// packages/public-site/src/pages/Detail.tsx
import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';
import { sectionForType, sectionLabel, type PubType } from '../lib/sections';
import {
  getBerichtBySlug,
  getNieuwsBySlug,
  getProductBySlug,
  getRegelBySlug,
  getProcesByKey,
} from '../lib/api';
import TypeTag from '../components/TypeTag';
import Crumbs from '../components/Crumbs';
import Callout from '../components/Callout';
import TechDetails from '../components/TechDetails';

interface DetailItem {
  title: string;
  summary: string;
  org: string;
  date: string | null;
  external: string | null;
  facts: [string, string][];
  tech: [string, string][];
  rules?: { naam: string; geldig: string | null }[];
  ruleCount?: number;
  begrippen?: string[];
  forms?: { id: string; name: string }[];
  documents?: { id: string; name: string }[];
  subprocesses?: { id: string; name: string; bpmnProcessId: string; status: string }[];
  apiPath: string;
}

async function loadDetail(type: PubType, slug: string): Promise<DetailItem | null> {
  if (type === 'bericht') {
    const b = await getBerichtBySlug(slug);
    if (!b) return null;
    return {
      title: b.subject,
      summary: b.preview,
      org: b.sender.name,
      date: b.publishedAt,
      external: 'flevoland.nl',
      facts: [['Afzender', b.sender.name]],
      tech: [
        ['bericht.id', b.id],
        ['api', `/v1/public/berichten/${slug}`],
      ],
      apiPath: `/v1/public/berichten/${slug}`,
    };
  }
  if (type === 'proces') {
    const p = await getProcesByKey(slug);
    if (!p) return null;
    return {
      title: p.naam,
      summary: p.beschrijving ?? '',
      org: 'Provincie Flevoland',
      date: p.gepubliceerd,
      external: null,
      facts: [
        ['Proceskey', p.key],
        ['Gepubliceerd', p.gepubliceerd],
        ['Status', p.status],
      ],
      tech: [
        ['process.key', p.key],
        ['engine', 'Camunda 7 / BPMN 2.0'],
        ['api', `/v1/public/processen/${p.key}`],
      ],
      forms: p.forms,
      documents: p.documents,
      subprocesses: p.subprocesses,
      apiPath: `/v1/public/processen/${p.key}`,
    };
  }
  const fetcher =
    type === 'nieuws' ? getNieuwsBySlug : type === 'product' ? getProductBySlug : getRegelBySlug;
  const item = await fetcher(slug);
  if (!item) return null;
  return {
    title: item.title,
    summary: item.summary,
    org: item.org,
    date: item.date,
    external: item.external,
    facts: item.facts,
    tech: item.tech,
    rules: item.rules,
    ruleCount: item.ruleCount,
    begrippen: item.begrippen,
    apiPath: item.tech.find(([k]) => k === 'api')?.[1] ?? '',
  };
}

export default function Detail({ t, lang, type }: { t: Translations; lang: Lang; type: PubType }) {
  const { slug = '' } = useParams();
  const [item, setItem] = useState<DetailItem | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setItem(undefined);
    loadDetail(type, slug).then((d) => {
      if (!cancelled) setItem(d);
    });
    return () => {
      cancelled = true;
    };
  }, [type, slug]);

  const section = sectionForType(type);

  if (item === undefined) {
    return (
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">{lang === 'nl' ? 'Laden…' : 'Loading…'}</div>
      </main>
    );
  }
  if (item === null) {
    return (
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">
          <h1 className="pub-section-h">
            {lang === 'nl' ? 'Item niet gevonden' : 'Item not found'}
          </h1>
        </div>
      </main>
    );
  }

  const crumbLabel = item.title.length > 46 ? `${item.title.slice(0, 46)}…` : item.title;

  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <Crumbs
          lang={lang}
          trail={[
            { label: t.navHome, to: '/' },
            { label: sectionLabel(section, lang), to: section.path },
            { label: crumbLabel },
          ]}
        />
        <div className="pub-detail">
          <div className="pub-detail-body">
            <div className="pub-meta" style={{ marginBottom: 12 }}>
              <TypeTag type={type} lang={lang} />
              <span>{item.org}</span>
              {item.date && (
                <>
                  <span className="pub-sep">·</span>
                  <span>{item.date}</span>
                </>
              )}
            </div>
            <h1>{item.title}</h1>
            <p className="pub-standfirst">{item.summary}</p>

            {type === 'product' && (
              <>
                <h2>{lang === 'nl' ? 'Wat u moet weten' : 'What you need to know'}</h2>
                <ul>
                  <li>
                    {lang === 'nl'
                      ? 'Deze activiteit valt onder de Omgevingswet en wordt beoordeeld door Provincie Flevoland.'
                      : 'This activity falls under the Environment Act and is assessed by the Province of Flevoland.'}
                  </li>
                  <li>
                    {lang === 'nl'
                      ? 'U dient uw aanvraag of melding in via het Omgevingsloket.'
                      : 'You submit your application or notification through the Omgevingsloket.'}
                  </li>
                  <li>
                    {lang === 'nl'
                      ? 'De beslistermijn volgt uit de Algemene wet bestuursrecht (Awb 4:13).'
                      : 'The decision period follows from the General Administrative Law Act (Awb 4:13).'}
                  </li>
                </ul>
              </>
            )}

            {type === 'regel' && (item.ruleCount ?? 0) > 0 && (
              <>
                <h2>
                  {t.rulesIn} ({item.ruleCount})
                </h2>
                {item.rules && item.rules.length > 0 ? (
                  <table className="pub-kv">
                    <thead>
                      <tr>
                        <th>{t.tabRegel}</th>
                        <th style={{ width: '9rem' }}>{t.validFrom}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.rules.map((r, i) => (
                        <tr key={i}>
                          <th
                            style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14 }}
                          >
                            {r.naam}
                          </th>
                          <td>{r.geldig ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>
                    {lang === 'nl'
                      ? `Deze dienst bevat ${item.ruleCount} gepubliceerde regels.`
                      : `This service holds ${item.ruleCount} published rules.`}
                  </p>
                )}
                {item.begrippen && item.begrippen.length > 0 && (
                  <>
                    <h2>
                      {t.conceptsIn} ({item.begrippen.length})
                    </h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                      {item.begrippen.map((b, i) => (
                        <a
                          key={i}
                          className="pub-chip"
                          href={`https://skosmos.open-regels.nl/ronl/${lang}/search?q=${encodeURIComponent(b)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {b}
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {type === 'proces' && (
              <>
                <h2>{lang === 'nl' ? 'Onderdelen van dit proces' : 'Parts of this process'}</h2>
                <ul>
                  <li>
                    {(item.forms ?? []).length} {lang === 'nl' ? 'formulieren' : 'forms'}
                  </li>
                  <li>
                    {(item.documents ?? []).length}{' '}
                    {lang === 'nl' ? 'documentsjablonen' : 'document templates'}
                  </li>
                  <li>
                    {(item.subprocesses ?? []).length}{' '}
                    {lang === 'nl' ? 'subprocessen' : 'subprocesses'}
                  </li>
                </ul>
              </>
            )}

            {(type === 'bericht' || type === 'nieuws') && item.external && (
              <p>
                <a href={`https://${item.external}`} target="_blank" rel="noreferrer">
                  {t.readMore} ({item.external}) →
                </a>
              </p>
            )}

            <Callout title={t.api}>
              <p>{t.apiBody}</p>
              <p
                style={{
                  fontFamily: 'var(--pub-mono)',
                  fontSize: 13,
                  marginTop: 8,
                  wordBreak: 'break-all',
                }}
              >
                GET {item.apiPath}
              </p>
            </Callout>

            {item.tech.length > 0 && <TechDetails t={t} rows={item.tech} />}
          </div>
          <aside className="pub-aside" aria-label={t.aside}>
            <h2>{t.aside}</h2>
            <dl>
              <dt>{t.publisher}</dt>
              <dd>{item.org}</dd>
              {item.date && (
                <>
                  <dt>{t.updated}</dt>
                  <dd>{item.date}</dd>
                </>
              )}
              {item.facts
                .filter(([, v]) => v !== item.org)
                .map(([k, v], i) => (
                  <Fragment key={i}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </Fragment>
                ))}
              <dt>{t.identifier}</dt>
              <dd className="mono">{slug}</dd>
            </dl>
            {item.external && (
              <p style={{ marginTop: 16 }}>
                <a href={`https://${item.external}`} target="_blank" rel="noreferrer">
                  {item.external} →
                </a>
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
