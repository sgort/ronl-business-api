/* Public search site — pages. */

/* ── Home, variant A: search-first (dropped, kept for reference) ──────────── */
function PubHomeSearchFirst({ t, lang, index, go, a11y }) {
  const counts = React.useMemo(() => {
    const m = {}; index.forEach(i => m[i.type] = (m[i.type] || 0) + 1); return m;
  }, [index]);
  return (
    <React.Fragment>
      <div className="pub-hero">
        <div className="pub-wrap">
          <h1>{t.heroTitle}</h1>
          <p className="pub-lede">{t.heroLede}</p>
          <div className={a11y ? 'pub-a11y-note' : ''} data-a11y="label + 3:1 randcontrast" style={{ maxWidth: '44rem' }}>
            <PubSearchForm t={t} value="" onSubmit={q => go({ view: 'results', q })} id="pub-q-hero" />
          </div>
          <p className="pub-hero-sug">
            <span>{t.heroSug}</span>
            {PUB_SUGGESTIONS.map(s => <a key={s} href="#" onClick={e => { e.preventDefault(); go({ view: 'results', q: s }); }}>{s}</a>)}
          </p>
          <div className="pub-hero-stats">
            {t.stats.map(([n, l], i) => <div key={i}><b>{n}</b><span>{l}</span></div>)}
          </div>
        </div>
      </div>
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">
          {a11y && <PubA11yLegend t={t} />}
          <h2 className="pub-section-h">{lang === 'nl' ? 'Of blader per onderdeel' : 'Or browse per section'}</h2>
          <p className="pub-lede-2">{lang === 'nl' ? 'Zes bronnen, één index. Alles wat hier staat is openbaar en vrij te hergebruiken.' : 'Six sources, one index. Everything here is public and free to reuse.'}</p>
          <div className="pub-cards">
            {PUB_SECTIONS.map(s => (
              <button key={s.id} type="button" className="pub-card" onClick={() => go({ view: 'section', sectionId: s.id })}>
                <h3>{s[lang]}</h3>
                <p>{s[lang + 'Sub']}</p>
                <span className="pub-count">{counts[s.type] || 0} {lang === 'nl' ? 'items' : 'items'}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </React.Fragment>
  );
}

/* ── Home, variant B: six entry points — CHOSEN ───────────────────────────── */
function PubHomeCards({ t, lang, index, go, a11y }) {
  const counts = React.useMemo(() => { const m = {}; index.forEach(i => m[i.type] = (m[i.type] || 0) + 1); return m; }, [index]);
  return (
    <React.Fragment>
      <div style={{ background: 'var(--ro-bg)', borderBottom: '1px solid var(--ro-rule-2)', padding: '26px 0' }}>
        <div className="pub-wrap" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 22rem', minWidth: 0 }}>
            <PubSearchForm t={t} value="" onSubmit={q => go({ view: 'results', q })} id="pub-q-bar" />
          </div>
          <p style={{ fontSize: 14, color: 'var(--ro-ink-2)', flex: '0 1 20rem' }}>
            {lang === 'nl' ? 'Doorzoekt alle zes bronnen tegelijk — berichten, producten, regels, processen en begrippen.' : 'Searches all six sources at once — announcements, products, rules, processes and concepts.'}
          </p>
        </div>
      </div>
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">
          {a11y && <PubA11yLegend t={t} />}
          <h1 className="pub-section-h" style={{ fontSize: 30 }}>{t.heroTitle}</h1>
          <p className="pub-lede-2" style={{ fontSize: 17 }}>{t.heroLede}</p>
          <div className="pub-cards" style={{ marginTop: 8 }}>
            {PUB_SECTIONS.map(s => (
              <button key={s.id} type="button" className="pub-card" onClick={() => go({ view: 'section', sectionId: s.id })} style={{ minHeight: 168 }}>
                <span style={{ alignSelf: 'flex-start' }}><PubTypeTag type={s.type} lang={lang} /></span>
                <h3 style={{ fontSize: 20, marginTop: 4 }}>{s[lang]}</h3>
                <p>{s[lang + 'Sub']}</p>
                <span className="pub-count">{counts[s.type] || 0} items →</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </React.Fragment>
  );
}

/* ── Home, variant C: news-first (dropped, kept for reference) ────────────── */
function PubHomeFeed({ t, lang, index, go, a11y }) {
  const feed = index.filter(i => i.type === 'bericht' || i.type === 'nieuws').slice(0, 8);
  const rest = PUB_SECTIONS.filter(s => !['berichten', 'nieuws'].includes(s.id));
  return (
    <React.Fragment>
      <div style={{ background: 'var(--ro-blue)', padding: '30px 0' }}>
        <div className="pub-wrap"><PubSearchForm t={t} value="" onSubmit={q => go({ view: 'results', q })} id="pub-q-feed" /></div>
      </div>
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">
          {a11y && <PubA11yLegend t={t} />}
          <div className="pub-results">
            <div style={{ order: 2 }}>
              <div className="pub-facets">
                <h2>{lang === 'nl' ? 'Kennisbank' : 'Knowledge base'}</h2>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {rest.map(s => (
                    <li key={s.id}>
                      <a href="#" onClick={e => { e.preventDefault(); go({ view: 'section', sectionId: s.id }); }} style={{ fontWeight: 700 }}>{s[lang]}</a>
                      <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginTop: 2 }}>{s[lang + 'Sub']}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div style={{ order: 1 }}>
              <h1 className="pub-section-h">{lang === 'nl' ? 'Actueel' : 'Latest'}</h1>
              <p className="pub-lede-2">{lang === 'nl' ? 'Berichten van Provincie Flevoland en landelijk nieuws, in één stroom.' : 'Announcements from Flevoland and national news, in one stream.'}</p>
              <div className="pub-feed">
                {feed.map(item => (
                  <article key={item.id}>
                    <div className="pub-meta"><PubTypeTag type={item.type} lang={lang} /><span>{item.org}</span><span className="pub-sep">·</span><span>{item.date}</span></div>
                    <h3 style={{ marginTop: 7 }}><a href="#" onClick={e => { e.preventDefault(); go({ view: 'detail', itemId: item.id }); }}>{item.title}</a></h3>
                    <p>{item.summary}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </React.Fragment>
  );
}

/* ── Search results (federated) ───────────────────────────────────────────── */
function PubResults({ t, lang, index, q, go, a11y }) {
  const [filters, setFilters] = React.useState({ types: [], orgs: [], audience: [], sort: 'rel' });
  React.useEffect(() => setFilters(f => ({ ...f, types: [], orgs: [], audience: [] })), [q]);
  const base = React.useMemo(() => pubSearch(index, q, { sort: filters.sort }), [index, q, filters.sort]);
  const hits = React.useMemo(() => pubSearch(index, q, filters), [index, q, filters]);
  const toggle = (key, val) => setFilters(f => ({ ...f, [key]: f[key].includes(val) ? f[key].filter(x => x !== val) : [...f[key], val] }));
  const typeOpts = PUB_TYPES.map(ty => [ty, base.filter(i => i.type === ty).length, PUB_TYPE_LABEL[ty][lang]]).filter(o => o[1]);
  const orgOpts = pubFacetCounts(base, 'org', i => i.org).slice(0, 6);
  const audOpts = pubFacetCounts(base, 'audience', i => i.audience).slice(0, 5);
  const active = filters.types.length + filters.orgs.length + filters.audience.length;
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        {a11y && <PubA11yLegend t={t} />}
        <nav className="pub-crumbs" aria-label="kruimelpad">
          <a href="#" onClick={e => { e.preventDefault(); go({ view: 'home' }); }}>{t.navHome}</a><span aria-hidden="true">›</span><span>{t.results}</span>
        </nav>
        <div style={{ maxWidth: '44rem', marginBottom: 26 }}>
          <PubSearchForm t={t} value={q} onSubmit={nq => go({ view: 'results', q: nq })} id="pub-q-results" />
        </div>
        <div className="pub-results">
          <div className="pub-facets" role="region" aria-label={t.filters}>
            <h2>{t.filters}</h2>
            <PubFacet legend={t.type} options={typeOpts} selected={filters.types} onToggle={v => toggle('types', v)} />
            <PubFacet legend={t.source} options={orgOpts} selected={filters.orgs} onToggle={v => toggle('orgs', v)} />
            <PubFacet legend={t.audience} options={audOpts} selected={filters.audience} onToggle={v => toggle('audience', v)} />
            {active > 0 && <button type="button" className="pub-clear" onClick={() => setFilters(f => ({ ...f, types: [], orgs: [], audience: [] }))}>{t.clear} ({active})</button>}
          </div>
          <div>
            <div className="pub-resulthead">
              <div>
                <h1 style={{ fontSize: 24 }}>{q ? `“${q}”` : t.results}</h1>
                <p aria-live="polite" style={{ marginTop: 4 }}>{hits.length} {q ? t.resultsFor + ' ' + `“${q}”` : t.allResults}</p>
              </div>
              <div className="pub-sort">
                <label htmlFor="pub-sort">{t.sort}</label>
                <select id="pub-sort" value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value }))}>
                  <option value="rel">{t.sortRel}</option><option value="date">{t.sortDate}</option><option value="az">{t.sortAz}</option>
                </select>
              </div>
            </div>
            {hits.length === 0
              ? <div className="pub-empty"><h3>{t.noResults}</h3><p style={{ color: 'var(--ro-ink-2)' }}>{t.noResultsBody}</p></div>
              : hits.slice(0, 25).map(item => <PubHit key={item.id} item={item} q={q} lang={lang} go={go} />)}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ── Rule catalogue: same four tabs as the caseworker ─────────────────────── */
function PubRegelcatalogus({ t, lang, index, go, a11y }) {
  const cat = window.MOCK_CATALOGUS || {};
  const s = PUB_SECTIONS.find(x => x.id === 'regels');
  const [tab, setTab] = React.useState('diensten');
  const diensten = React.useMemo(() => index.filter(i => i.type === 'regel'), [index]);
  const totalRegels = diensten.reduce((n, d) => n + (d.rules || []).length, 0);
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        {a11y && <PubA11yLegend t={t} />}
        <nav className="pub-crumbs" aria-label="kruimelpad">
          <a href="#" onClick={e => { e.preventDefault(); go({ view: 'home' }); }}>{t.navHome}</a><span aria-hidden="true">›</span><span>{s[lang]}</span>
        </nav>
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>{s[lang]}</h1>
        <p className="pub-lede-2">{s[lang + 'Sub']}</p>
        <div className="pub-tabs" role="tablist">
          {[['organisaties', t.tabOrg, (cat.organisaties || []).length], ['diensten', t.tabDienst, diensten.length], ['regels', t.tabRegel, totalRegels], ['begrippen', t.tabBegrip, cat.begrippenTotal || 0]].map(([id, label, n]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}<span className="pub-tc">{n}</span></button>
          ))}
        </div>
        {tab === 'organisaties' && (
          <div className="pub-orgcards">
            {(cat.organisaties || []).map(o => (
              <div key={o.id} className="pub-orgcard">
                <h3>{o.naam}</h3>
                <a href={'https://' + o.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: 'break-all' }}>{o.url}</a>
                <div className="pub-chips">{o.diensten.map((d, i) => <span key={i} className="pub-chip">{d}</span>)}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'diensten' && diensten.map(d => <PubHit key={d.id} item={d} q="" lang={lang} go={go} />)}
        {tab === 'regels' && <PubRegelsTab t={t} lang={lang} diensten={diensten} go={go} />}
        {tab === 'begrippen' && <PubBegrippenTab t={t} lang={lang} cat={cat} />}
      </div>
    </main>
  );
}

function PubRegelsTab({ t, lang, diensten, go }) {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(diensten[0] ? diensten[0].id : null);
  const needle = q.trim().toLowerCase();
  return (
    <div>
      <div className="pub-filterbar">
        <div className="pub-field">
          <label htmlFor="pub-rule-q">{t.filterRule}</label>
          <input id="pub-rule-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.filterRule} />
        </div>
      </div>
      {diensten.filter(d => (d.rules || []).length > 0).map(d => {
        const rules = (d.rules || []).filter(r => !needle || r.naam.toLowerCase().includes(needle));
        if (needle && !rules.length) return null;
        const isOpen = needle ? true : open === d.id;
        return (
          <details key={d.id} className="pub-acc" open={isOpen} onToggle={e => { if (!needle) setOpen(e.target.open ? d.id : null); }}>
            <summary><b>{d.title}</b><span className="pub-tc">{rules.length} / {d.ruleCount}</span></summary>
            <div className="pub-acc-in">
              <table className="pub-kv">
                <thead><tr><th>{t.tabRegel}</th><th style={{ width: '9rem' }}>{t.validFrom}</th></tr></thead>
                <tbody>{rules.map((r, i) => (
                  <tr key={i}><th style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14 }}>{r.naam}</th><td>{r.geldig}</td></tr>
                ))}</tbody>
              </table>
              <p style={{ marginTop: 12 }}><a href="#" onClick={e => { e.preventDefault(); go({ view: 'detail', itemId: d.id }); }}>{lang === 'nl' ? 'Naar de dienst' : 'Go to the service'} →</a></p>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function PubBegrippenTab({ t, lang, cat }) {
  const all = cat.begrippen || [];
  const diensten = [...new Set(all.map(b => b.dienst))];
  const [dienst, setDienst] = React.useState('');
  const [q, setQ] = React.useState('');
  const rows = all.filter(b => (!dienst || b.dienst === dienst) && (!q.trim() || b.label.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div>
      <div className="pub-filterbar">
        <div className="pub-field">
          <label htmlFor="pub-bg-q">{t.filterConcept}</label>
          <input id="pub-bg-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.filterConcept} />
        </div>
        <div className="pub-field">
          <label htmlFor="pub-bg-d">{t.filterDienst}</label>
          <select id="pub-bg-d" value={dienst} onChange={e => setDienst(e.target.value)}>
            <option value="">{t.allDiensten}</option>
            {diensten.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginBottom: 10 }} aria-live="polite">
        {rows.length} {lang === 'nl' ? `van ${cat.begrippenTotal} begrippen` : `of ${cat.begrippenTotal} concepts`} · {lang === 'nl' ? 'de volledige thesaurus staat in het ' : 'the full thesaurus lives in the '}
        <a href="https://skosmos.open-regels.nl/ronl/" target="_blank" rel="noreferrer">Gegevenswoordenboek</a>
      </p>
      <table className="pub-kv">
        <thead><tr><th>{t.concept}</th><th>{t.dienst}</th></tr></thead>
        <tbody>{rows.map((b, i) => (
          <tr key={i}>
            <th style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14.5 }}>
              <a href={'https://skosmos.open-regels.nl/ronl/' + (lang === 'nl' ? 'nl' : 'en') + '/search?clang=' + lang + '&q=' + encodeURIComponent(b.label)} target="_blank" rel="noreferrer">{b.label}</a>
            </th>
            <td style={{ fontFamily: 'var(--pub-font)', fontSize: 13.5 }}>{b.dienst}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ── Data dictionary: Skosmos embedded ────────────────────────────────────── */
function PubWoordenboek({ t, lang, go, a11y }) {
  const s = PUB_SECTIONS.find(x => x.id === 'woordenboek');
  const src = s.iframe + (lang === 'nl' ? 'nl/' : 'en/');
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        {a11y && <PubA11yLegend t={t} />}
        <nav className="pub-crumbs" aria-label="kruimelpad">
          <a href="#" onClick={e => { e.preventDefault(); go({ view: 'home' }); }}>{t.navHome}</a><span aria-hidden="true">›</span><span>{s[lang]}</span>
        </nav>
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>{s[lang]}</h1>
        <p className="pub-lede-2">{s[lang + 'Sub']}</p>
        <div className="pub-embed-bar">
          <span>{lang === 'nl' ? 'Bron' : 'Source'}: <a href="https://skosmos.open-regels.nl/ronl/" target="_blank" rel="noreferrer">Skosmos</a> · RONL Concepts</span>
          <a href={src} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>{t.embedOpen} ↗</a>
        </div>
        <div className="pub-embed">
          <iframe src={src} title={s[lang] + ' — Skosmos (RONL Concepts)'} loading="lazy"></iframe>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginTop: 10, maxWidth: '70ch' }}>{t.embedNote}</p>
      </div>
    </main>
  );
}

/* ── Section index ────────────────────────────────────────────────────────── */
function PubSection(props) {
  const { sectionId } = props;
  if (sectionId === 'regels') return <PubRegelcatalogus {...props} />;
  if (sectionId === 'woordenboek') return <PubWoordenboek {...props} />;
  return <PubSectionList {...props} />;
}

function PubSectionList({ t, lang, index, sectionId, go, a11y }) {
  const s = PUB_SECTIONS.find(x => x.id === sectionId) || PUB_SECTIONS[0];
  const [q, setQ] = React.useState('');
  const items = React.useMemo(() => pubSearch(index.filter(i => i.type === s.type), q, { sort: 'rel' }), [index, s.type, q]);
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        {a11y && <PubA11yLegend t={t} />}
        <nav className="pub-crumbs" aria-label="kruimelpad">
          <a href="#" onClick={e => { e.preventDefault(); go({ view: 'home' }); }}>{t.navHome}</a><span aria-hidden="true">›</span><span>{s[lang]}</span>
        </nav>
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>{s[lang]}</h1>
        <p className="pub-lede-2">{s[lang + 'Sub']}</p>
        <div style={{ maxWidth: '34rem', marginBottom: 20 }}>
          <PubSearchForm t={t} value={q} onSubmit={setQ} id={'pub-q-' + s.id} />
        </div>
        <p style={{ fontSize: 14, color: 'var(--ro-ink-2)', borderBottom: '1px solid var(--ro-rule-2)', paddingBottom: 10 }} aria-live="polite">{items.length} {lang === 'nl' ? 'items' : 'items'}</p>
        {items.map(item => <PubHit key={item.id} item={item} q={q} lang={lang} go={go} />)}
      </div>
    </main>
  );
}

/* ── Detail page ──────────────────────────────────────────────────────────── */
function PubDetail({ t, lang, index, itemId, go, a11y }) {
  const item = index.find(i => i.id === itemId);
  if (!item) return <main id="pub-main" className="pub-main"><div className="pub-wrap"><p>Niet gevonden.</p></div></main>;
  const sec = PUB_SECTIONS.find(x => x.type === item.type);
  const s = sec && sec.detailSection ? PUB_SECTIONS.find(x => x.id === sec.detailSection) : sec;
  const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        {a11y && <PubA11yLegend t={t} />}
        <nav className="pub-crumbs" aria-label="kruimelpad">
          <a href="#" onClick={e => { e.preventDefault(); go({ view: 'home' }); }}>{t.navHome}</a><span aria-hidden="true">›</span>
          <a href="#" onClick={e => { e.preventDefault(); go({ view: 'section', sectionId: s.id }); }}>{s[lang]}</a><span aria-hidden="true">›</span>
          <span>{item.title.length > 46 ? item.title.slice(0, 46) + '…' : item.title}</span>
        </nav>
        <div className="pub-detail">
          <div className="pub-detail-body">
            <div className="pub-meta" style={{ marginBottom: 12 }}>
              <PubTypeTag type={item.type} lang={lang} /><span>{item.org}</span>{item.date && <><span className="pub-sep">·</span><span>{item.date}</span></>}
            </div>
            <h1>{item.title}</h1>
            <p className="pub-standfirst">{item.summary}</p>

            {item.type === 'product' && (
              <React.Fragment>
                <h2>{lang === 'nl' ? 'Wat u moet weten' : 'What you need to know'}</h2>
                <ul>
                  <li>{lang === 'nl' ? 'Deze activiteit valt onder de Omgevingswet en wordt beoordeeld door Provincie Flevoland.' : 'This activity falls under the Environment Act and is assessed by the Province of Flevoland.'}</li>
                  <li>{lang === 'nl' ? 'U dient uw aanvraag of melding in via het Omgevingsloket.' : 'You submit your application or notification through the Omgevingsloket.'}</li>
                  <li>{lang === 'nl' ? 'De beslistermijn volgt uit de Algemene wet bestuursrecht (Awb 4:13).' : 'The decision period follows from the General Administrative Law Act (Awb 4:13).'}</li>
                </ul>
              </React.Fragment>
            )}
            {item.type === 'regel' && item.ruleCount > 0 && (
              <React.Fragment>
                <h2>{t.rulesIn} ({item.ruleCount})</h2>
                {item.rules && item.rules.length > 0 ? (
                  <table className="pub-kv">
                    <thead><tr><th>{t.tabRegel}</th><th style={{ width: '9rem' }}>{t.validFrom}</th></tr></thead>
                    <tbody>{item.rules.map((r, i) => <tr key={i}><th style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14 }}>{r.naam}</th><td>{r.geldig}</td></tr>)}</tbody>
                  </table>
                ) : <p>{lang === 'nl' ? `Deze dienst bevat ${item.ruleCount} gepubliceerde regels.` : `This service holds ${item.ruleCount} published rules.`}</p>}
                {item.begrippen && item.begrippen.length > 0 && (
                  <React.Fragment>
                    <h2>{t.conceptsIn} ({item.begrippen.length})</h2>
                    <p>{lang === 'nl' ? 'Deze begrippen zijn de invoer- en uitvoerwaarden van de regels hierboven. Elk begrip is gedefinieerd in de RONL-thesaurus.' : 'These concepts are the inputs and outputs of the rules above. Each is defined in the RONL thesaurus.'}</p>
                    <div className="pub-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                      {item.begrippen.map((b, i) => (
                        <a key={i} className="pub-chip" href={'https://skosmos.open-regels.nl/ronl/' + (lang === 'nl' ? 'nl' : 'en') + '/search?q=' + encodeURIComponent(b)} target="_blank" rel="noreferrer">{b}</a>
                      ))}
                    </div>
                  </React.Fragment>
                )}
              </React.Fragment>
            )}
            {item.type === 'proces' && (
              <React.Fragment>
                <h2>{lang === 'nl' ? 'Onderdelen van dit proces' : 'Parts of this process'}</h2>
                <ul>
                  <li>{(item.forms || []).length} {lang === 'nl' ? 'formulieren' : 'forms'}</li>
                  <li>{(item.documents || []).length} {lang === 'nl' ? 'documentsjablonen' : 'document templates'}</li>
                  <li>{(item.subprocesses || []).length} {lang === 'nl' ? 'subprocessen' : 'subprocesses'}</li>
                </ul>
              </React.Fragment>
            )}
            {item.type === 'begrip' && (
              <React.Fragment>
                <h2>{lang === 'nl' ? 'Waar dit begrip gebruikt wordt' : 'Where this concept is used'}</h2>
                <p>{item.dienst}</p>
              </React.Fragment>
            )}
            {(item.type === 'bericht' || item.type === 'nieuws') && (
              <p><a href="#" onClick={e => e.preventDefault()}>{t.readMore} ({item.external}) →</a></p>
            )}

            <div className="pub-callout">
              <b>{t.api}</b>
              <p>{t.apiBody}</p>
              <p style={{ fontFamily: 'var(--pub-mono)', fontSize: 13, marginTop: 8, wordBreak: 'break-all' }}>GET /v1/public/{s.id}/{slug}</p>
            </div>

            {item.tech && (
              <details className="pub-tech">
                <summary>{t.tech}</summary>
                <div className="pub-tech-in">
                  <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginBottom: 12 }}>{t.techLede}</p>
                  <table className="pub-kv"><tbody>{item.tech.map(([k, v], i) => <tr key={i}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
                </div>
              </details>
            )}
          </div>
          <aside className="pub-aside" aria-label={t.aside}>
            <h2>{t.aside}</h2>
            <dl>
              <dt>{t.publisher}</dt><dd>{item.org}</dd>
              {item.date && <React.Fragment><dt>{t.updated}</dt><dd>{item.date}</dd></React.Fragment>}
              {(item.facts || []).filter(([k, v]) => v !== item.org).map(([k, v], i) => <React.Fragment key={i}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
              <dt>{t.identifier}</dt><dd className="mono">{item.id}</dd>
            </dl>
            {item.external && <p style={{ marginTop: 16 }}><a href="#" onClick={e => e.preventDefault()}>{item.external} →</a></p>}
          </aside>
        </div>
      </div>
    </main>
  );
}

Object.assign(window, { PubHomeSearchFirst, PubHomeCards, PubHomeFeed, PubResults, PubSection, PubSectionList, PubRegelcatalogus, PubRegelsTab, PubBegrippenTab, PubWoordenboek, PubDetail });
