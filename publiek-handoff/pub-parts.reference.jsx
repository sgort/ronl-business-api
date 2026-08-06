/* Public search site — chrome and shared parts. */

function PubSkip({ t }) { return <a className="pub-skip" href="#pub-main">{t.skip}</a>; }

function PubTopbar({ t, lang, setLang, go }) {
  return (
    <div className="pub-topbar">
      <div className="pub-wrap">
        <a className="pub-wordmark" href="#" onClick={e => { e.preventDefault(); go({ view: 'home' }); }}>
          <span className="pub-mark" aria-hidden="true"></span>
          <span><b>{t.org}</b><span>{t.orgSub}</span></span>
        </a>
        <div className="pub-topbar-right">
          <div className="pub-lang" role="group" aria-label="Taal / Language">
            <button type="button" aria-pressed={lang === 'nl'} onClick={() => setLang('nl')} lang="nl">NL</button>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en">EN</button>
          </div>
          <a className="pub-login" href="#" onClick={e => e.preventDefault()}>{t.login} →</a>
        </div>
      </div>
    </div>
  );
}

function PubNav({ t, lang, view, sectionId, go }) {
  return (
    <nav className="pub-nav" aria-label={lang === 'nl' ? 'Hoofdnavigatie' : 'Main navigation'}>
      <div className="pub-wrap">
        <ul>
          <li><button type="button" aria-current={view === 'home' ? 'page' : undefined} onClick={() => go({ view: 'home' })}>{t.navHome}</button></li>
          {PUB_SECTIONS.map(s => (
            <li key={s.id}><button type="button" aria-current={view === 'section' && sectionId === s.id ? 'page' : undefined} onClick={() => go({ view: 'section', sectionId: s.id })}>{s[lang]}</button></li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function PubSearchForm({ t, value, onChange, onSubmit, id = 'pub-q', big, a11y }) {
  const [v, setV] = React.useState(value || '');
  React.useEffect(() => setV(value || ''), [value]);
  return (
    <form className="pub-searchform" role="search" onSubmit={e => { e.preventDefault(); onSubmit(v); }}>
      <label htmlFor={id} className="pub-sr" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{t.searchLabel}</label>
      <input id={id} type="search" value={v} placeholder={t.placeholder} autoComplete="off"
        onChange={e => { setV(e.target.value); onChange && onChange(e.target.value); }} />
      <button type="submit">
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="2.2" /><path d="M13.5 13.5 18 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        {t.search}
      </button>
    </form>
  );
}

function PubTypeTag({ type, lang }) {
  return <span className={'pub-type t-' + type}>{PUB_TYPE_LABEL[type][lang]}</span>;
}

function pubHighlight(text, q) {
  if (!text) return null;
  const terms = q.trim().split(/\s+/).filter(w => w.length > 2);
  if (!terms.length) return text;
  const re = new RegExp('(' + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  return text.split(re).map((chunk, i) => re.test(chunk) && i % 2 === 1 ? <mark key={i}>{chunk}</mark> : <React.Fragment key={i}>{chunk}</React.Fragment>);
}

function PubHit({ item, q, lang, go }) {
  return (
    <article className="pub-hit">
      <div className="pub-meta"><PubTypeTag type={item.type} lang={lang} /><span>{item.org}</span>{item.date && <><span className="pub-sep">·</span><span>{item.date}</span></>}</div>
      <h3><button type="button" onClick={() => go({ view: 'detail', itemId: item.id })}>{pubHighlight(item.title, q)}</button></h3>
      <p>{pubHighlight((item.summary || '').slice(0, 210), q)}{(item.summary || '').length > 210 ? '…' : ''}</p>
    </article>
  );
}

function PubFacet({ legend, options, selected, onToggle }) {
  return (
    <fieldset className="pub-facet" style={{ border: 0, margin: 0, padding: '12px 0' }}>
      <legend>{legend}</legend>
      {options.map(([val, count, label]) => (
        <label key={val}>
          <input type="checkbox" checked={selected.includes(val)} onChange={() => onToggle(val)} />
          <span>{label || val}</span><span className="pub-fc">{count}</span>
        </label>
      ))}
    </fieldset>
  );
}

function PubFooter({ t, lang, go }) {
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
            <ul>{PUB_SECTIONS.map(s => <li key={s.id}><a href="#" onClick={e => { e.preventDefault(); go({ view: 'section', sectionId: s.id }); }}>{s[lang]}</a></li>)}</ul>
          </div>
          <div>
            <h2>{t.footerLegal}</h2>
            <ul>{t.footerLinks.map((l, i) => <li key={i}><a href="#" onClick={e => e.preventDefault()}>{l[0]}</a></li>)}</ul>
          </div>
        </div>
        <div className="pub-footer-bottom">
          <span>Open Regels Nederland · Provincie Flevoland</span>
          <span style={{ fontFamily: 'var(--pub-mono)', fontSize: 12.5 }}>publiek.open-regels.nl</span>
        </div>
      </div>
    </footer>
  );
}

function PubA11yLegend({ t }) {
  return (
    <div className="pub-a11y-legend">
      <b>{t.a11yLegend}</b>
      <p style={{ marginTop: 6 }}>{t.a11yBody}</p>
    </div>
  );
}

Object.assign(window, { PubSkip, PubTopbar, PubNav, PubSearchForm, PubTypeTag, PubHit, PubFacet, PubFooter, PubA11yLegend, pubHighlight });
