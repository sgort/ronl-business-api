/* Flevoland stap 2 — Caseworker prototype (source).
   Compiled to ../fl-app.js (plain React.createElement) so the pages need no
   Babel at runtime. Edit this file, then recompile:
     npx babel --presets @babel/preset-react src/fl-app.jsx -o fl-app.js
   State can be set from the URL hash, for screenshots and the overview board:
     #list, #selected, #errors, #empty, #loading, #error, #process, #palette, #dock, #beheer
*/
const { useState, useEffect, useRef, useMemo } = React;

/* ── Icons (decorative, aria-hidden) ─────────────────────────────── */
const I = {
  search: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.75"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>,
  book: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3h4a1.5 1.5 0 011.5 1.5V13a1.5 1.5 0 00-1.5-1.5h-4zM13.5 3h-4A1.5 1.5 0 008 4.5V13a1.5 1.5 0 011.5-1.5h4z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
  refresh: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 11-1.6-3.7M13 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  spark: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z" fill="currentColor"/></svg>,
  close: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/></svg>,
  alert: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{flexShrink:0, marginTop:3}}><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 4.5v4.2" stroke="#fff" strokeWidth="1.75" strokeLinecap="round"/><circle cx="8" cy="11.2" r="1" fill="#fff"/></svg>,
  check: <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  flow: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2" width="5" height="4" fill="none" stroke="currentColor" strokeWidth="1.5"/><rect x="9.5" y="10" width="5" height="4" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M4 6v3.5a2 2 0 002 2h3.5" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>,
};

/* ── Data ─────────────────────────────────────────────────────────── */
const USER = { sub: 'emp-005', name: 'test-caseworker-flevoland', initials: 'TC', loa: 'hoog' };

const TASKS = [
  { id: '44fdecea-80f9-11f1-a231-4af008e25a97', name: 'Fase 6: aanvrager informeren over het besluit (Awb 3:6)', process: 'AwbShellProcess', created: '16-07-2026 11:32', due: '10-09-2026', assignee: 'emp-005', phase: 6, dossier: 'AWB-2026-164544', product: 'Kapvergunning' },
  { id: '5b21c4f0-80f9-11f1-a231-4af008e25b12', name: 'Beoordelen: besluit kapvergunning', process: 'TreeFellingPermitSubProcess', created: '16-07-2026 10:12', due: '02-09-2026', assignee: null, phase: 4, dossier: 'AWB-2026-164544', product: 'Kapvergunning' },
  { id: '7c93a1d8-80f9-11f1-a231-4af008e25c44', name: 'Fase 6: aanvrager informeren over het besluit (Awb 3:6)', process: 'AwbShellProcess', created: '15-07-2026 16:48', due: '12-07-2026', overdue: true, assignee: null, phase: 6, dossier: 'AWB-2026-164203', product: 'Kapvergunning' },
  { id: '9e02f7b6-80f9-11f1-a231-4af008e25d77', name: 'Hoogte subsidie thuisbatterij vaststellen', process: 'ThuisbatterijSubsidieAanvraagProcess', created: '15-07-2026 09:22', due: '20-08-2026', assignee: 'emp-011', phase: 4, dossier: 'TBS-2026-00817', product: 'Subsidie thuisbatterij' },
  { id: 'a1c7e310-80f9-11f1-a231-4af008e25e01', name: 'Volledigheid aanvraag controleren', process: 'ThuisbatterijSubsidieAanvraagProcess', created: '14-07-2026 15:05', due: '21-07-2026', assignee: 'emp-005', phase: 2, dossier: 'TBS-2026-00809', product: 'Subsidie thuisbatterij' },
  { id: 'b3d2f981-80f9-11f1-a231-4af008e25f33', name: 'Zienswijze verwerken (Awb 4:8)', process: 'AwbShellProcess', created: '14-07-2026 08:47', due: '28-07-2026', assignee: null, phase: 3, dossier: 'AWB-2026-163977', product: 'Ontheffing' },
  { id: 'c88a0b12-80f9-11f1-a231-4af008e26a12', name: 'RIP fase 1: projectopdracht vastleggen', process: 'RipFase1Process', created: '12-07-2026 13:30', due: '15-08-2026', assignee: null, phase: 1, dossier: 'RIP-2026-0031', product: 'Infraproject N23' },
];

const VARS = [
  ['Dossierreferentie', 'AWB-2026-164544', 'code'],
  ['Product', 'Kapvergunning (TreeFellingPermit)'],
  ['Ontvangstdatum', '16-07-2026 09:29'],
  ['Awb-termijn', '56 dagen, uiterlijk 10-09-2026'],
  ['Wettelijke grondslag', 'Awb 4:13 lid 1'],
  ['Stamdiameter', '30 cm'],
  ['Beschermd gebied', 'Nee'],
  ['Besluit', 'Vergunning verleend'],
  ['Volledigheid', '{"isComplete":true,"awbArticle":"Awb 4:5"}', 'code'],
  ['Authenticatie', 'DigiD'],
];

const STEPS = [
  { name: 'Aanvraag ontvangen', meta: '16-07-2026 09:29', type: 'START', s: 'done' },
  { name: 'Volledigheid gecontroleerd', meta: '16-07-2026 09:29 · automatisch', type: 'SCRIPT', s: 'done' },
  { name: 'Besluit kapvergunning (DMN)', meta: '16-07-2026 09:30 · regelset Kapvergunning 2026', type: 'BESLISSING', s: 'done' },
  { name: 'Beoordelen: besluit kapvergunning', meta: '16-07-2026 11:20 · A. de Vries', type: 'GEBRUIKERSTAAK', s: 'done' },
  { name: 'Aanvrager informeren over het besluit', meta: 'Loopt nog · geclaimd door jou', type: 'GEBRUIKERSTAAK', s: 'running' },
  { name: 'Dossier archiveren', meta: 'Volgt na verzending', type: 'SCRIPT', s: 'next' },
];

const PHASES = ['Ontvangst', 'Volledigheid', 'Zienswijze', 'Beoordeling', 'Besluit', 'Bekendmaking'];

const LANES = [
  { id: 'aanvrager', name: 'Aanvrager', sub: 'Inwoner via MijnOmgeving' },
  { id: 'behandelaar', name: 'Behandelaar', sub: 'Team Vergunningen', mine: true },
  { id: 'jurist', name: 'Jurist', sub: 'Team Juridische zaken' },
  { id: 'systeem', name: 'Systeem', sub: 'Operaton + regels' },
];
/* nodes: [lane, phaseIndex, label, kind, state] */
const NODES = [
  ['aanvrager', 0, 'Aanvraag indienen', 'Start', 'done'],
  ['systeem', 1, 'Volledigheid controleren', 'Script', 'done', 'auto'],
  ['aanvrager', 2, 'Zienswijze indienen', 'Taak', 'done'],
  ['systeem', 3, 'Besluit kapvergunning', 'DMN', 'done', 'auto'],
  ['behandelaar', 3, 'Beoordelen: besluit kapvergunning', 'Taak', 'done'],
  ['jurist', 4, 'Juridische toets', 'Taak', 'done'],
  ['behandelaar', 5, 'Aanvrager informeren over het besluit', 'Taak', 'current'],
  ['aanvrager', 5, 'Besluit ontvangen', 'Einde', 'todo'],
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
];

const MODES = [
  { id: 'werk', label: 'Werk', groups: [
    { items: [{ id: 'taken', label: 'Taken', count: 'tasks' }, { id: 'proces-starten', label: 'Proces starten' }] },
    { label: 'Snel filter', items: [{ id: 'f-overdue', label: 'Te laat', overdue: true, n: 1 }, { id: 'f-mine', label: 'Mijn claim', n: 2 }, { id: 'f-today', label: 'Vandaag', n: 0 }, { id: 'f-week', label: 'Deze week', n: 3 }] },
    { label: 'DVTP', items: [{ id: 'dvtp-start', label: 'DVTP starten' }, { id: 'dvtp-taken', label: 'DVTP taken' }] },
  ]},
  { id: 'zoeken', label: 'Zoeken', groups: [
    { items: [{ id: 'berichten', label: 'Berichten', n: 3, loud: true }, { id: 'nieuws', label: 'Nieuws' }, { id: 'producten', label: 'Producten & Diensten' }, { id: 'regelcatalogus', label: 'Regelcatalogus' }, { id: 'procesbibliotheek', label: 'Procesbibliotheek' }, { id: 'woordenboek', label: 'Gegevenswoordenboek' }] },
  ]},
  { id: 'simulatie', label: 'Simulatie', groups: [{ items: [{ id: 'regelsimulatie', label: 'Regelsimulatie' }] }] },
  { id: 'beheer', label: 'Beheer', groups: [
    { label: 'Account', items: [{ id: 'profiel', label: 'Profiel' }, { id: 'rollen', label: 'Rollen & rechten' }] },
    { label: 'Projecten', items: [{ id: 'rip1', label: 'RIP fase 1 starten' }, { id: 'archief', label: 'Archief' }] },
    { label: 'Hulpmiddelen', items: [{ id: 'gereedschap', label: 'Gereedschap' }, { id: 'audit', label: 'Audit log' }] },
  ]},
];

const FILTERS = [
  { id: 'all', label: 'Alle taken', m: () => true },
  { id: 'mine', label: 'Mijn claim', m: t => t.assignee === USER.sub },
  { id: 'open', label: 'Openstaand', m: t => !t.assignee },
  { id: 'overdue', label: 'Te laat', m: t => t.overdue, overdue: true },
  { id: 'week', label: 'Deze week', m: t => ['5b21c4f0-80f9-11f1-a231-4af008e25b12','a1c7e310-80f9-11f1-a231-4af008e25e01','b3d2f981-80f9-11f1-a231-4af008e25f33'].includes(t.id) },
];

/* Named views for links and screenshots: #selected (default), #list, #errors, #empty,
   #loading, #error, #process, #palette, #dock, #beheer. Plain names, because
   claude.ai passes only a plain #name to a hosted page. */
const VIEWS = {
  selected: {}, list: { state: 'list' }, errors: { state: 'errors' }, empty: { state: 'empty' },
  loading: { state: 'loading' }, error: { state: 'error' }, process: { overlay: 'process' },
  palette: { state: 'list', overlay: 'palette' }, dock: { overlay: 'dock' }, beheer: { mode: 'beheer' },
};
function readHash() {
  const v = VIEWS[location.hash.slice(1)] || {};
  return { state: v.state || 'selected', overlay: v.overlay || '', mode: v.mode || 'werk' };
}

/* ── Top bar, tabs, rail ─────────────────────────────────────────── */
function TopBar({ onSearch }) {
  return (
    <header className="v2-topbar flevoland-inverse">
      <a className="v2-logo" href="#list" aria-label="ronl. Caseworker, naar Taken">
        <span className="v2-logo-mark">ronl<em>.</em></span>
        <span className="v2-logo-sub">Caseworker</span>
      </a>
      <button type="button" className="v2-search" onClick={onSearch} aria-keyshortcuts="Control+K Meta+K">
        {I.search}
        <span>Spring naar een sectie of taak…</span>
        <kbd aria-hidden="true">⌘K</kbd>
      </button>
      <div className="v2-user">
        <span className="v2-loa" title="Betrouwbaarheidsniveau inlog">LOA {USER.loa}</span>
        <span className="v2-username">{USER.name}</span>
        <button type="button" className="v2-avatar" aria-label="Account van test-caseworker-flevoland">{USER.initials}</button>
        <button type="button" className="v2-icon-btn" aria-label="Wat is er nieuw">{I.book}</button>
      </div>
    </header>
  );
}

function Tabs({ mode, setMode, count }) {
  return (
    <nav className="v2-tabs flevoland-inverse" aria-label="Werkmodus">
      {MODES.map(m => (
        <button key={m.id} type="button" className={'v2-tab' + (m.id === mode ? ' active' : '')} aria-current={m.id === mode ? 'page' : undefined} onClick={() => setMode(m.id)}>
          {m.label}
          {m.id === 'werk' && count > 0 && <span className="v2-count" aria-label={`${count} taken`}>{count}</span>}
        </button>
      ))}
      <span className="v2-tabs-spacer" />
      <span className="v2-tenant-label">Provincie Flevoland</span>
    </nav>
  );
}

function Rail({ mode, section, setSection, count }) {
  const m = MODES.find(x => x.id === mode);
  return (
    <aside className="v2-rail" aria-label="Secties">
      <div className="v2-rail-card">{m.label}</div>
      {m.groups.map((g, i) => (
        <div key={i} className="v2-rail-group">
          {g.label && <div className="v2-rail-group-label" id={`rg-${mode}-${i}`}>{g.label}</div>}
          <ul className="v2-rail-list" aria-labelledby={g.label ? `rg-${mode}-${i}` : undefined}>
            {g.items.map(it => {
              const n = count === 0 && mode === 'werk' ? null : it.count === 'tasks' ? count : it.n;
              const active = section === it.id;
              return (
                <li key={it.id}>
                  <button type="button" className={['v2-rail-item', active && 'active', it.overdue && 'overdue'].filter(Boolean).join(' ')} aria-current={active ? 'page' : undefined} onClick={() => setSection(it.id)}>
                    <span>{it.label}</span>
                    {n != null && (it.loud || it.count ? <span className="v2-count">{n}</span> : <span className="v2-count v2-count--quiet">{n}</span>)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </aside>
  );
}

/* ── Process: compact stepper, steps, overlay ────────────────────── */
function Stepper({ current, full }) {
  return (
    <ol className={'v2-stepper' + (full ? ' v2-stepper--full' : '')} aria-label="Awb-fasen">
      {PHASES.map((p, i) => {
        const n = i + 1, s = n < current ? 'done' : n === current ? 'current' : 'todo';
        return (
          <li key={p} className={s} aria-current={s === 'current' ? 'step' : undefined}>
            <span className="v2-step-num">{s === 'done' ? I.check : n}</span>
            <span className="v2-step-label">{p}<span className="sr-only">{s === 'done' ? ' (afgerond)' : s === 'current' ? ' (huidige fase)' : ''}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

function Where({ task, onOpen }) {
  return (
    <section className="v2-where" aria-labelledby="where-h">
      <div className="v2-where-head">
        <h2 id="where-h" className="v2-label">Waar staat deze zaak</h2>
        <button type="button" className="v2-link" onClick={onOpen}>Bekijk het hele proces</button>
      </div>
      <Stepper current={task.phase} />
      <p className="v2-where-cap">Fase {task.phase} van 6: <b>{PHASES[task.phase - 1]}</b>. Jij bent aan zet; daarna volgt archivering.</p>
    </section>
  );
}

function Steps() {
  return (
    <ol className="v2-steps">
      {STEPS.map((s, i) => (
        <li key={i} className={'v2-step ' + s.s}>
          <span className="v2-step-dot" aria-hidden="true" />
          <span>
            <span className="v2-step-name">{s.name}</span><br />
            <span className="v2-step-meta">{s.meta}</span>
          </span>
          <span className="v2-step-type">{s.type}</span>
        </li>
      ))}
    </ol>
  );
}

function ProcessOverlay({ task, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); const k = e => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  const laneIdx = id => LANES.findIndex(l => l.id === id);
  // geometry for arrows (rem-free: px at 16px root)
  const LAB = 152, COL = 184, PH = 36, LH = 104;
  const pt = n => ({ x: LAB + n[1] * COL + COL / 2, y: PH + laneIdx(n[0]) * LH + LH / 2 });
  return (
    <div className="v2-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="v2-dialog" role="dialog" aria-modal="true" aria-labelledby="ov-h">
        <div className="v2-dialog-head">
          <div>
            <p className="v2-eyebrow">{task.process} · {task.dossier}</p>
            <h2 id="ov-h">Procesweergave: {task.product}</h2>
          </div>
          <button ref={ref} type="button" className="v2-btn v2-btn--secondary v2-btn--compact" onClick={onClose}>Sluiten <kbd aria-hidden="true">Esc</kbd></button>
        </div>
        <div className="v2-dialog-body">
          <Stepper current={task.phase} full />
          <div className="v2-legend" aria-label="Legenda">
            <span><i className="done" />Afgerond</span>
            <span><i className="current" />Nu aan de beurt</span>
            <span><i className="todo" />Nog te doen</span>
            <span><i className="auto" />Automatisch</span>
            <span><i className="mine" />Jouw rol</span>
          </div>
          <div className="v2-swim" role="group" aria-label="Swimlane: wie doet wat per fase">
            <div className="v2-swim-grid">
              <svg className="v2-swim-arrows" width={LAB + 6 * COL} height={PH + LANES.length * LH} aria-hidden="true">
                <defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L8 4L0 8z" fill="#757575" /></marker></defs>
                {EDGES.map(([a, b], i) => {
                  const A = pt(NODES[a]), B = pt(NODES[b]);
                  const x1 = A.x + COL / 2 - 12, x2 = B.x - COL / 2 + 12;
                  const mx = (x1 + x2) / 2;
                  const d = A.y === B.y ? `M${x1} ${A.y}H${x2}` : x2 > x1 ? `M${x1} ${A.y}H${mx}V${B.y}H${x2}` : `M${A.x} ${A.y + (B.y > A.y ? 28 : -28)}V${B.y + (B.y > A.y ? -28 : 28)}`;
                  return <path key={i} d={d} markerEnd="url(#ah)" />;
                })}
              </svg>
              <div className="v2-swim-corner" />
              {PHASES.map((p, i) => <div key={p} className={'v2-swim-phase' + (i + 1 === task.phase ? ' current' : '')}>{i + 1}. {p}</div>)}
              {LANES.map(l => (
                <React.Fragment key={l.id}>
                  <div className={'v2-swim-lane' + (l.mine ? ' mine' : '')}>
                    <span>{l.name}</span>
                    <small>{l.sub}</small>
                    {l.mine && <span className="v2-badge v2-badge--you" style={{alignSelf:'flex-start'}}>Jij</span>}
                  </div>
                  {PHASES.map((p, pi) => {
                    const n = NODES.find(x => x[0] === l.id && x[1] === pi);
                    return (
                      <div key={pi} className={'v2-swim-cell' + (l.mine ? ' mine' : '')}>
                        {n && (
                          <button type="button" className={['v2-swim-node', n[4], n[5]].filter(Boolean).join(' ')} aria-label={`${n[2]}, ${n[3]}, ${n[4] === 'done' ? 'afgerond' : n[4] === 'current' ? 'nu aan de beurt' : 'nog te doen'}`}>
                            <span className="nlabel">{n[2]}</span>
                            <span className="kind">{n[3]}</span>
                            {n[4] === 'current' && <span className="now v2-badge v2-badge--you">Nu</span>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Task form ───────────────────────────────────────────────────── */
function TaskForm({ showErrors, onSubmit }) {
  return (
    <form className="v2-form" noValidate onSubmit={e => { e.preventDefault(); onSubmit(); }} aria-labelledby="form-h">
      <h2 id="form-h">Taakformulier: besluit verzenden</h2>
      <p className="v2-hint">Velden met een * zijn verplicht. Na Voltooien gaat de zaak naar archivering.</p>
      {showErrors && (
        <div className="v2-error-summary" role="alert" aria-labelledby="es-h" tabIndex={-1}>
          <h3 id="es-h">Controleer 2 velden</h3>
          <ul>
            <li><a href="#f-kanaal">Kies hoe het besluit wordt verzonden</a></li>
            <li><a href="#f-datum">Vul een verzenddatum in, niet in de toekomst</a></li>
          </ul>
        </div>
      )}
      <div className="v2-field">
        <label htmlFor="f-besluit">Besluit</label>
        <input id="f-besluit" className="v2-input" readOnly value="Vergunning verleend" />
        <span className="v2-hint">Volgt uit de beoordeling in fase 4. Wijzigen kan alleen via een nieuwe beoordeling.</span>
      </div>
      <fieldset className={'v2-choices' + (showErrors ? ' is-invalid' : '')} aria-describedby={showErrors ? 'e-kanaal' : undefined}>
        <legend>Verzendkanaal *</legend>
        {showErrors && <span id="e-kanaal" className="v2-error">{I.alert}Kies hoe het besluit wordt verzonden.</span>}
        <div className="v2-choices--row">
          <label className="v2-choice"><input id="f-kanaal" type="radio" name="kanaal" /> Berichtenbox MijnOverheid</label>
          <label className="v2-choice"><input type="radio" name="kanaal" /> Per post</label>
          <label className="v2-choice"><input type="radio" name="kanaal" /> Beide</label>
        </div>
      </fieldset>
      <div className="v2-field">
        <label htmlFor="f-datum">Verzenddatum *</label>
        {showErrors && <span id="e-datum" className="v2-error">{I.alert}Vul een verzenddatum in, niet in de toekomst.</span>}
        <input id="f-datum" className="v2-input" style={{maxWidth:'12rem'}} placeholder="dd-mm-jjjj" inputMode="numeric" aria-invalid={showErrors || undefined} aria-describedby={showErrors ? 'e-datum' : 'h-datum'} />
        {!showErrors && <span id="h-datum" className="v2-hint">Bijvoorbeeld 16-11-2026.</span>}
      </div>
      <div className="v2-field">
        <label htmlFor="f-toel">Toelichting voor de aanvrager</label>
        <textarea id="f-toel" className="v2-textarea" defaultValue="Uw aanvraag voor een kapvergunning is verleend. Er hoeft geen vervangende boom te worden geplant." />
        <span className="v2-hint">Komt letterlijk in de brief. Maximaal 600 tekens.</span>
      </div>
      <div className="v2-field">
        <label className="v2-choice" style={{fontWeight:400}}><input type="checkbox" defaultChecked /> Kopie naar het zaakdossier</label>
      </div>
      <div className="v2-actions">
        <button type="submit" className="v2-btn">Voltooien</button>
        <button type="button" className="v2-btn v2-btn--secondary">Opslaan als concept</button>
        <span className="spacer" />
        <button type="button" className="v2-btn v2-btn--ghost">Taak teruggeven</button>
      </div>
    </form>
  );
}

/* ── Taken inbox ─────────────────────────────────────────────────── */
function Taken({ state, setState, onOpenProcess }) {
  const [filter, setFilter] = useState('all');
  const [selId, setSelId] = useState(['list', 'empty', 'loading', 'error'].includes(state) ? null : TASKS[0].id);
  const [errors, setErrors] = useState(state === 'errors');
  useEffect(() => { setSelId(['list', 'empty', 'loading', 'error'].includes(state) ? null : TASKS[0].id); setErrors(state === 'errors'); }, [state]);
  // Scroll only the detail pane (scrollIntoView would also scroll a parent page when embedded).
  useEffect(() => { if (errors) { const el = document.querySelector('.v2-error-summary'), pane = document.querySelector('.v2-taken-detail'); if (el && pane) { pane.scrollTop = el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 24; el.focus({ preventScroll: true }); } } }, [errors]);

  const empty = state === 'empty', loading = state === 'loading', failed = state === 'error';
  const def = FILTERS.find(f => f.id === filter);
  const tasks = empty || failed || loading ? [] : TASKS.filter(def.m);
  const sel = tasks.find(t => t.id === selId) || null;
  const counts = Object.fromEntries(FILTERS.map(f => [f.id, empty ? 0 : TASKS.filter(f.m).length]));

  return (
    <div className="v2-taken">
      <nav className="v2-taken-filters" aria-label="Taakfilters">
        <div className="v2-label" id="flt-h">Filters</div>
        <ul aria-labelledby="flt-h">
          {FILTERS.map(f => (
            <li key={f.id}>
              <button type="button" className={['v2-taken-filter', filter === f.id && 'active', f.overdue && counts[f.id] && 'overdue'].filter(Boolean).join(' ')} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                <span>{f.label}</span><span className="v2-count v2-count--quiet">{loading || failed ? '–' : counts[f.id]}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="v2-btn v2-btn--ghost v2-btn--compact v2-taken-refresh" onClick={() => setState('loading')}>{I.refresh} Vernieuwen</button>
      </nav>

      <section className="v2-taken-list" aria-labelledby="list-h">
        <header>
          <div className="v2-taken-list-title">
            <h2 id="list-h">{def.label}</h2>
            <span className="v2-taken-list-meta" aria-live="polite">{loading ? 'Laden…' : failed ? 'Niet geladen' : `${tasks.length} ${tasks.length === 1 ? 'taak' : 'taken'}`}</span>
          </div>
          <div className="v2-toolbar">
            <label htmlFor="q" className="sr-only">Filter taken op naam of dossier</label>
            <input id="q" className="v2-input v2-input--compact" placeholder="Zoek in taken" />
            <label htmlFor="sort" className="sr-only">Sorteren</label>
            <select id="sort" className="v2-select v2-input--compact" style={{width:'auto'}} defaultValue="due">
              <option value="due">Termijn</option><option value="created">Aangemaakt</option>
            </select>
          </div>
        </header>
        {loading ? (
          <div role="status" aria-busy="true" aria-label="Taken worden geladen">
            {[0, 1, 2, 3, 4].map(i => <div key={i} className="v2-skel-item"><span className="v2-skel" style={{width: `${80 - i * 7}%`}} /><span className="v2-skel" style={{width: '45%', height: '0.5rem'}} /></div>)}
          </div>
        ) : failed ? (
          <div className="v2-state">
            <div className="v2-msg v2-msg--error" role="alert">{I.alert}<span><b>Taken konden niet worden geladen.</b> De procesengine reageert niet (time-out na 10 s). Je werk is niet verloren.</span></div>
            <button type="button" className="v2-btn v2-btn--secondary v2-btn--compact" onClick={() => setState('list')}>{I.refresh} Opnieuw proberen</button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="v2-state">
            <h3>Geen open taken</h3>
            <p>Er staan geen taken voor je klaar in Provincie Flevoland. Nieuwe taken verschijnen hier vanzelf; je krijgt een melding onder Berichten.</p>
            <button type="button" className="v2-btn v2-btn--secondary v2-btn--compact">Proces starten</button>
          </div>
        ) : (
          <ul>
            {tasks.map(t => (
              <li key={t.id}>
                <button type="button" className={'v2-taken-item' + (sel && sel.id === t.id ? ' active' : '')} aria-current={sel && sel.id === t.id ? 'true' : undefined} onClick={() => { setSelId(t.id); setErrors(false); }}>
                  <span className="v2-taken-item-row">
                    <span className="v2-taken-item-name">{t.name}</span>
                    {t.overdue ? <span className="v2-badge v2-badge--overdue">Te laat</span>
                      : t.assignee === USER.sub ? <span className="v2-badge v2-badge--claimed">Mijn claim</span>
                      : t.assignee ? <span className="v2-badge v2-badge--neutral">Geclaimd</span>
                      : <span className="v2-badge v2-badge--open">Open</span>}
                  </span>
                  <span className="v2-taken-item-meta">
                    <span>{t.dossier}</span><span className="sep" aria-hidden="true" />
                    <span title={PHASES[t.phase - 1]}>Fase {t.phase}</span><span className="sep" aria-hidden="true" />
                    <span className={t.overdue ? 'overdue' : undefined}><span className="sr-only">Termijn </span>{t.due}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="v2-taken-detail" aria-label="Taakdetails">
        {!sel ? (
          <div className="v2-state v2-state--center" style={{height:'100%', justifyContent:'center'}}>
            <h2>{empty || failed || loading ? 'Geen taak gekozen' : 'Kies een taak'}</h2>
            <p>{empty || failed || loading ? 'Zodra er een taak is, zie je hier de gegevens, de processtappen en het formulier.' : 'Kies links een taak om de gegevens, de processtappen en het formulier te zien.'}</p>
          </div>
        ) : (
          <article>
            <div className="v2-taken-detail-head">
              <div>
                <p className="v2-eyebrow">{sel.process}</p>
                <h1>{sel.name}</h1>
              </div>
              <button type="button" className="v2-btn v2-btn--secondary v2-btn--compact" onClick={onOpenProcess}>{I.flow} Procesweergave</button>
            </div>
            <Where task={sel} onOpen={onOpenProcess} />
            <dl className="v2-taken-meta">
              <div><dt>Dossier</dt><dd>{sel.dossier}</dd></div>
              <div><dt>Aangemaakt</dt><dd>{sel.created}</dd></div>
              <div><dt>Termijn</dt><dd>{sel.due}</dd></div>
              <div><dt>Status</dt><dd>{sel.assignee === USER.sub ? 'Geclaimd door jou' : sel.assignee ? 'Geclaimd' : 'Open'}</dd></div>
              <div><dt>Taak-ID</dt><dd><code title={sel.id}>{sel.id.slice(0, 8)}…</code></dd></div>
            </dl>

            {sel.assignee === USER.sub ? <TaskForm showErrors={errors} onSubmit={() => setErrors(true)} /> : (
              <div className="v2-msg v2-msg--info" style={{marginBottom:'var(--sp-lg)'}}>
                <span>{sel.assignee ? 'Deze taak is geclaimd door een collega. Je kunt meekijken; het formulier is voor de behandelaar.' : 'Deze taak is nog niet geclaimd. Claim de taak om het formulier te openen.'}</span>
              </div>
            )}
            {!sel.assignee && <button type="button" className="v2-btn">Taak claimen</button>}

            <section className="v2-section" aria-labelledby="vars-h">
              <div className="v2-section-head"><h2 id="vars-h">Procesgegevens</h2><button type="button" className="v2-btn v2-btn--ghost v2-btn--compact">Toon alle 25</button></div>
              <table className="v2-table">
                <tbody>{VARS.map(([k, v, c]) => <tr key={k}><th scope="row">{k}</th><td>{c ? <code>{v}</code> : v}</td></tr>)}</tbody>
              </table>
            </section>
            <section className="v2-section" aria-labelledby="steps-h">
              <div className="v2-section-head"><h2 id="steps-h">Processtappen</h2></div>
              <Steps />
            </section>
          </article>
        )}
      </section>
    </div>
  );
}

function Placeholder({ mode, section }) {
  const m = MODES.find(x => x.id === mode);
  const it = m.groups.flatMap(g => g.items).find(i => i.id === section) || m.groups[0].items[0];
  return (
    <div style={{padding:'var(--sp-lg) var(--sp-xl)'}}>
      <p className="v2-eyebrow" style={{fontFamily:'var(--sans)'}}>{m.label} · {it.label}</p>
      <h1 style={{fontSize:'var(--fs-xl)', marginBottom:'var(--sp-sm)'}}>{it.label}</h1>
      <div className="v2-msg v2-msg--info" style={{maxWidth:'40rem'}}><span>Deze sectie krijgt in de volgende ronde een eigen ontwerp in dezelfde stijl. Zie het componentenblad voor de bouwstenen.</span></div>
    </div>
  );
}

/* ── Palette and dock ────────────────────────────────────────────── */
function Palette({ onClose, onGo }) {
  const [q, setQ] = useState('ta');
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out = [];
    MODES.forEach(m => {
      const items = m.groups.flatMap(g => g.items.map(i => ({ ...i, mode: m.id, path: m.label + (g.label ? ' › ' + g.label : '') })))
        .filter(i => !ql || i.label.toLowerCase().includes(ql));
      if (items.length) out.push({ label: m.label, items });
    });
    const tasks = TASKS.filter(t => ql && (t.name.toLowerCase().includes(ql) || t.dossier.toLowerCase().includes(ql))).slice(0, 3)
      .map(t => ({ id: t.id, label: t.name, mode: 'werk', path: t.dossier, task: true }));
    if (tasks.length) out.push({ label: 'Taken', items: tasks });
    return out;
  }, [q]);
  const flat = groups.flatMap(g => g.items);
  const hl = (s) => { const ql = q.trim(); if (!ql) return s; const i = s.toLowerCase().indexOf(ql.toLowerCase()); if (i < 0) return s; return <>{s.slice(0, i)}<mark>{s.slice(i, i + ql.length)}</mark>{s.slice(i + ql.length)}</>; };
  let idx = -1;
  return (
    <div className="v2-pal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="v2-pal" role="dialog" aria-modal="true" aria-label="Snel navigeren"
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, flat.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && flat[hi]) { onGo(flat[hi]); }
        }}>
        <div className="v2-pal-input">
          {I.search}
          <input ref={ref} value={q} onChange={e => { setQ(e.target.value); setHi(0); }} role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={flat[hi] ? 'pal-' + flat[hi].id : undefined} aria-label="Zoek een sectie of taak" placeholder="Zoek een sectie of taak" />
        </div>
        <ul className="v2-pal-list" id="pal-list" role="listbox" aria-label="Resultaten">
          {flat.length === 0 && <li className="v2-state" role="presentation"><p>Niets gevonden voor “{q}”. Probeer een dossiernummer of een sectienaam.</p></li>}
          {groups.map(g => (
            <li key={g.label} role="presentation">
              <div className="v2-pal-group v2-label" aria-hidden="true">{g.label}</div>
              <ul role="presentation" style={{listStyle:'none', margin:0, padding:0}}>
                {g.items.map(it => { idx++; const me = idx; return (
                  <li key={it.id} role="presentation">
                    <div id={'pal-' + it.id} role="option" aria-selected={me === hi} className={'v2-pal-item' + (me === hi ? ' active' : '')} onMouseEnter={() => setHi(me)} onClick={() => onGo(it)}>
                      <span>{hl(it.label)}</span><span className="path">{it.path}</span>
                    </div>
                  </li>
                ); })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="v2-pal-hint" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> kiezen</span><span><kbd>↵</kbd> openen</span><span><kbd>Esc</kbd> sluiten</span>
        </div>
      </div>
    </div>
  );
}

function Dock({ onClose }) {
  const [src, setSrc] = useState({ 'Procesengine': true, 'Kennisgraaf': true, 'Wetgeving (CPRMV)': true, 'Procesbibliotheek': false });
  return (
    <aside className="v2-dock" aria-labelledby="dock-h">
      <div className="v2-dock-head">
        <h2 id="dock-h">Assistent</h2>
        <button type="button" className="v2-btn v2-btn--ghost v2-btn--compact v2-btn--icon" aria-label="Assistent sluiten" onClick={onClose}>{I.close}</button>
      </div>
      <div className="v2-dock-id">
        <div className="v2-dock-id-row">
          <span className="v2-dock-av" aria-hidden="true">AI</span>
          <div style={{flex:1, minWidth:0}}>
            <div className="v2-dock-id-name">AI-assistent</div>
            <div className="v2-dock-id-sub">Antwoorden komen uit de bronnen hieronder. Controleer altijd de grondslag.</div>
          </div>
          <button type="button" className="v2-btn v2-btn--ghost v2-btn--compact">Wissen</button>
        </div>
        <label htmlFor="model" className="sr-only">Taalmodel</label>
        <select id="model" className="v2-select v2-input--compact"><option>Claude Sonnet</option><option>Claude Haiku</option></select>
      </div>
      <div className="v2-dock-msgs" aria-live="polite">
        <div className="v2-msg-user">Wat zijn de regels van de subsidie thuisbatterij?</div>
        <div className="v2-msg-ai">
          <p>Dit zijn de regels voor de <b>subsidie thuisbatterij Flevoland</b>, uitgevoerd door Provincie Flevoland.</p>
          <h3>Regel 1: recht op subsidie</h3>
          <p className="meta">Geldig vanaf 1 januari 2026 · betrouwbaarheid hoog</p>
          <p>Er is recht op subsidie als aan alle voorwaarden is voldaan:</p>
          <ul>
            <li>de aanvrager is niet failliet;</li>
            <li>de woning ligt in Flevoland;</li>
            <li>de aanvrager is eigenaar, of huurder met toestemming van de eigenaar.</li>
          </ul>
          <h3>Regel 2: hoogte</h3>
          <p>25% van de subsidiabele kosten, minimaal € 750 en maximaal € 1.250. Grondslag: <a href="#dock">Nadere regels Subsidie Thuisbatterij, artikel 5</a>.</p>
          <table className="v2-table"><thead><tr><th>Budget 2026</th><th>Plafond</th></tr></thead><tbody><tr><td>Eigenaren</td><td>€ 437.500</td></tr><tr><td>Huurders</td><td>€ 437.500</td></tr></tbody></table>
        </div>
      </div>
      <div className="v2-dock-chips" role="group" aria-label="Bronnen">
        {Object.keys(src).map(k => (
          <button key={k} type="button" className="v2-chip" aria-pressed={src[k]} onClick={() => setSrc(s => ({ ...s, [k]: !s[k] }))}>{src[k] && I.check}{k}</button>
        ))}
      </div>
      <form className="v2-dock-input" onSubmit={e => e.preventDefault()}>
        <label htmlFor="ask" className="sr-only">Vraag aan de assistent</label>
        <input id="ask" className="v2-input" placeholder="Stel een vraag" />
        <button type="submit" className="v2-btn">Stuur</button>
      </form>
    </aside>
  );
}

/* ── App ─────────────────────────────────────────────────────────── */
function App() {
  const init = readHash();
  const [state, setState] = useState(init.state);
  const [mode, setMode] = useState(init.mode);
  const [section, setSection] = useState(init.mode === 'werk' ? 'taken' : MODES.find(m => m.id === init.mode).groups[0].items[0].id);
  const [overlay, setOverlay] = useState(init.overlay);
  useEffect(() => {
    const h = () => { const r = readHash(); setState(r.state); setOverlay(r.overlay); setMode(r.mode); setSection(r.mode === 'werk' ? 'taken' : MODES.find(m => m.id === r.mode).groups[0].items[0].id); };
    const k = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOverlay(o => o === 'palette' ? '' : 'palette'); } };
    addEventListener('hashchange', h); addEventListener('keydown', k);
    return () => { removeEventListener('hashchange', h); removeEventListener('keydown', k); };
  }, []);
  // Loading started from Vernieuwen resolves after 1.6 s; #loading from the URL stays put (screenshots).
  const auto = useRef(false);
  const refresh = s => { auto.current = s === 'loading'; setState(s); };
  useEffect(() => { if (state === 'loading' && auto.current) { const t = setTimeout(() => setState('list'), 1600); return () => clearTimeout(t); } }, [state]);
  const switchMode = m => { setMode(m); setSection(m === 'werk' ? 'taken' : MODES.find(x => x.id === m).groups[0].items[0].id); };
  const taken = mode === 'werk' && section === 'taken';
  const count = state === 'empty' ? 0 : TASKS.length;
  return (
    <div className="cwd-v2 fl2">
      <a className="sr-only sr-only-focusable" href="#main">Naar de inhoud</a>
      <TopBar onSearch={() => setOverlay('palette')} />
      <Tabs mode={mode} setMode={switchMode} count={count} />
      <div className="v2-body">
        <Rail mode={mode} section={section} setSection={setSection} count={count} />
        <main className="v2-main" id="main" tabIndex={-1}>
          {taken ? <Taken state={state} setState={refresh} onOpenProcess={() => setOverlay('process')} /> : <Placeholder mode={mode} section={section} />}
        </main>
        {overlay === 'dock' && <Dock onClose={() => setOverlay('')} />}
      </div>
      {overlay !== 'dock' && <button type="button" className="v2-btn v2-btn--accent v2-dock-toggle" onClick={() => setOverlay('dock')}>{I.spark} Vraag de assistent</button>}
      {overlay === 'palette' && <Palette onClose={() => setOverlay('')} onGo={it => { setOverlay(''); switchMode(it.mode); if (!it.task) setSection(it.id); }} />}
      {overlay === 'process' && <ProcessOverlay task={TASKS[0]} onClose={() => setOverlay('')} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
