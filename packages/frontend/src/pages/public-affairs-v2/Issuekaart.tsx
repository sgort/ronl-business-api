/**
 * Issuekaart — Scherm 2, the per-dossier work surface.
 *
 * Sub-tabs: Issuekaart (overzicht) · Narratief (4) · Actie & co-creatie (5)
 * · OverlegBox (sketch) · Tijdlijn (lobby-canon). Internal sub-tab state
 * resets when the dossier changes.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  getTemplates,
  kompasTotal,
  kompasMax,
  kompasBand,
  KOMPAS_CRITERIA,
  type Dossier,
} from './pa.data';
import Kompas, { Trend, type KompasViz } from './Kompas';
import {
  fetchSignals,
  fetchInbox,
  fetchSearches,
  confirmSignal,
  signalTag,
  signalTagLabel,
  type SavedSearch,
} from '../../services/pa.api';
import type { Signal } from '@ronl/shared';

const ISSUE_SUBTABS = [
  { id: 'overzicht', label: 'Issuekaart' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'narratief', label: 'Narratief' },
  { id: 'actie', label: 'Actie & co-creatie' },
  { id: 'overleg', label: 'OverlegBox' },
  { id: 'tijdlijn', label: 'Tijdlijn' },
] as const;

type SubTab = (typeof ISSUE_SUBTABS)[number]['id'];

interface Props {
  dossier: Dossier;
  kompasViz?: KompasViz;
}

export default function Issuekaart({ dossier, kompasViz = 'radar' }: Props) {
  const [sub, setSub] = useState<SubTab>('overzicht');
  useEffect(() => {
    setSub('overzicht');
  }, [dossier.id]);
  const d = dossier;

  return (
    <div>
      <div className="pac-crumb">Dossiers · {d.naam}</div>
      <div className="pac-page-head" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="pac-page-title">{d.naam}</h1>
          <p className="pac-page-sub">{d.onderwerp}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span className="pac-total">
            Kompas <b>{kompasTotal(d.kompas)}</b>/{kompasMax()}
          </span>
          <span className={`pac-kompas-band tone-${kompasBand(kompasTotal(d.kompas)).key}`}>
            {kompasBand(kompasTotal(d.kompas)).kort}
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--pac-ink-3)',
              fontFamily: 'var(--pac-mono)',
            }}
          >
            momentum <Trend dir={d.momentum} /> · {d.status}
          </span>
        </div>
      </div>

      <div className="pac-subtabs">
        {ISSUE_SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pac-subtab ${sub === t.id ? 'active' : ''}`}
            onClick={() => setSub(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'overzicht' && <IssueOverzicht d={d} kompasViz={kompasViz} />}
      {sub === 'monitoring' && <DossierMonitoring d={d} />}
      {sub === 'narratief' && <Narratief d={d} />}
      {sub === 'actie' && <ActieCocreatie d={d} />}
      {sub === 'overleg' && <OverlegBox d={d} />}
      {sub === 'tijdlijn' && <Tijdlijn d={d} />}
    </div>
  );
}

function IssueOverzicht({ d, kompasViz }: { d: Dossier; kompasViz: KompasViz }) {
  const acties = [
    { name: 'Analyseer', desc: 'Kompas-scores en signalen verdiepen' },
    { name: 'Maak', desc: 'Lobbyfiche, notitie of praatpunten' },
    { name: 'Plan', desc: 'Gesprek, werkbezoek of event inplannen' },
    { name: 'Transcribeer', desc: 'Gespreksverslag naar OverlegBox' },
  ];
  return (
    <div>
      <div className="pac-context">
        <div className="pac-context-q">Waar gaat het over?</div>
        <div className="pac-context-body">{d.waarover}</div>
        <div className="pac-context-q">Waarom nu?</div>
        <div className="pac-context-body">{d.waaromNu}</div>
      </div>

      <div className="pac-actions-bar" style={{ marginTop: 16 }}>
        {acties.map((a) => (
          <button key={a.name} type="button" className="pac-action">
            <span className="pac-action-name">{a.name}</span>
            <span className="pac-action-desc">{a.desc}</span>
          </button>
        ))}
      </div>

      <section className="pac-section">
        <div className="pac-section-head">
          <h2 className="pac-section-title">
            Flevolands Kompas <span className="pac-q">— hoe belangrijk is dit voor Flevoland?</span>
          </h2>
          <span className="pac-total">{KOMPAS_CRITERIA.length} criteria · score 0–2</span>
        </div>
        <Kompas kompas={d.kompas} viz={kompasViz} />
      </section>

      <section className="pac-section">
        <div className="pac-section-head">
          <h2 className="pac-section-title">
            PA 2.0-plan <span className="pac-q">— wat is ons plan en ritme?</span>
          </h2>
        </div>
        <div className="pac-plan-goal">{d.doel}</div>
        <div className="pac-ritme">
          {(
            [
              ['Lobby', d.ritme.lobby],
              ['Communicatie', d.ritme.communicatie],
              ['Events', d.ritme.events],
            ] as const
          ).map(([title, items]) => (
            <div className="pac-ritme-col" key={title}>
              <h4>{title}</h4>
              <ul>
                {items.length ? (
                  items.map((it, i) => (
                    <li key={i}>
                      <span>
                        {it.t}
                        <span className="when">{it.when}</span>
                      </span>
                    </li>
                  ))
                ) : (
                  <li style={{ color: 'var(--pac-ink-3)' }}>
                    <span>Geen geplande acties</span>
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="pac-section">
        <div className="pac-section-head">
          <h2 className="pac-section-title">
            Stakeholders <span className="pac-q">— wie wanneer spreken?</span>
          </h2>
        </div>
        <div className="pac-stake">
          <div className="pac-stake-row head">
            <span>Actor</span>
            <span>Prioriteit</span>
            <span>Laatste contact</span>
            <span>Sentiment</span>
          </div>
          {d.stakeholders.map((s, i) => (
            <div className="pac-stake-row" key={i}>
              <span>
                <span className="pac-stake-name">{s.naam}</span>
                <span className="pac-stake-rol">{s.rol}</span>
              </span>
              <span>
                <span className={`pac-prio ${s.prio}`}>
                  {s.prio === 'nu'
                    ? 'Nu spreken'
                    : s.prio === 'kort'
                      ? 'Korte termijn'
                      : 'Warm houden'}
                </span>
              </span>
              <span
                style={{ fontFamily: 'var(--pac-mono)', fontSize: 12, color: 'var(--pac-ink-3)' }}
              >
                {s.laatste} geleden
              </span>
              <span className="pac-senti">
                <span className={`pac-senti-dot ${s.senti}`} />
                {s.senti === 'pos' ? 'Positief' : s.senti === 'neg' ? 'Kritisch' : 'Neutraal'}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Narratief({ d }: { d: Dossier }) {
  const hasFrames = d.narratief.frames.length > 0 || d.narratief.tegenframes.length > 0;
  return (
    <div>
      <p className="pac-page-sub" style={{ marginTop: 0, marginBottom: 22 }}>
        Grip op frames en tegenframes — één consistent Flevolands verhaal als toetssteen.
      </p>
      <div className="pac-onsverhaal">
        <div className="lbl">Ons verhaal — één lijn</div>
        <p>{d.narratief.onsVerhaal}</p>
      </div>
      {hasFrames ? (
        <div className="pac-frames">
          <div className="pac-frame-col">
            <h4>Dominante frames in het debat</h4>
            {d.narratief.frames.map((f, i) => (
              <div className="pac-frame" key={i}>
                <div className="pac-frame-text">{f.text}</div>
                <div className="pac-frame-meta">{f.meta}</div>
              </div>
            ))}
          </div>
          <div className="pac-frame-col">
            <h4>Onze tegenframes</h4>
            {d.narratief.tegenframes.map((f, i) => (
              <div className="pac-frame tegen" key={i}>
                <div className="pac-frame-text">{f.text}</div>
                <div className="pac-frame-meta">{f.meta}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="pac-page-sub">
          Voor dit sluimerende dossier is nog geen actieve framing-analyse opgesteld.
        </p>
      )}
    </div>
  );
}

function ActieCocreatie({ d }: { d: Dossier }) {
  return (
    <div>
      <p className="pac-page-sub" style={{ marginTop: 0, marginBottom: 22 }}>
        Direct van signaal naar product. Formats zijn sjablonen — de invulling blijft mensenwerk.
      </p>
      <section>
        <div className="pac-section-head">
          <h2 className="pac-section-title">
            Maak <span className="pac-q">— een product starten</span>
          </h2>
        </div>
        <div className="pac-templates">
          {getTemplates().map((t, i) => (
            <button key={i} type="button" className="pac-tmpl">
              <span className="pac-tmpl-name">{t.name}</span>
              <span className="pac-tmpl-desc">{t.desc}</span>
              <span className="pac-tmpl-foot">{t.foot}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="pac-section">
        <div className="pac-section-head">
          <h2 className="pac-section-title">
            Plan <span className="pac-q">— gekoppeld aan stakeholderprioritering</span>
          </h2>
        </div>
        <div className="pac-cards">
          {d.stakeholders
            .filter((s) => s.prio !== 'warm')
            .map((s, i) => (
              <div key={i} className="pac-issue" style={{ cursor: 'default' }}>
                <span
                  className="pac-issue-rank"
                  style={{ fontSize: 14, color: 'var(--pac-ink-3)' }}
                >
                  {i + 1}
                </span>
                <span className="pac-issue-body">
                  <span className="pac-issue-title" style={{ fontSize: 14 }}>
                    {s.naam}
                  </span>
                  <span className="pac-issue-meta">
                    <span>{s.rol}</span>
                  </span>
                </span>
                <span className="pac-interv-actions">
                  <button type="button" className="pac-btn pac-btn-sm pac-btn-ghost">
                    Plan gesprek
                  </button>
                </span>
              </div>
            ))}
        </div>
      </section>
      <section className="pac-section">
        <div className="pac-section-head">
          <h2 className="pac-section-title">Samenwerken</h2>
        </div>
        <div className="pac-actions-bar">
          <button type="button" className="pac-action">
            <span className="pac-action-name">Tag kernteam</span>
            <span className="pac-action-desc">Collega's koppelen aan dit dossier</span>
          </button>
          <button type="button" className="pac-action">
            <span className="pac-action-name">Open OverlegBox</span>
            <span className="pac-action-desc">Discussie en gespreksverslagen</span>
          </button>
          <button type="button" className="pac-action">
            <span className="pac-action-name">Samen schrijven</span>
            <span className="pac-action-desc">Gedeeld document starten</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function OverlegBox({ d }: { d: Dossier }) {
  const [msgs, setMsgs] = useState(d.overleg);
  const [input, setInput] = useState('');
  useEffect(() => {
    setMsgs(d.overleg);
  }, [d.id, d.overleg]);

  const send = () => {
    if (!input.trim()) return;
    setMsgs((m) => [...m, { name: 'Sanne Bakker', init: 'SB', time: 'nu', text: input.trim() }]);
    setInput('');
  };

  return (
    <div>
      <p className="pac-overleg-intro">
        Gedeelde ruimte gekoppeld aan dit dossier waar het kernteam meekijkt. De conversatie wordt
        gelogd; afgeronde resultaten worden weggeschreven naar SharePoint en gemetadateerd voor de
        Archiefwet.
      </p>
      {msgs.length ? (
        <div className="pac-overleg">
          {msgs.map((m, i) => (
            <div className="pac-msg" key={i}>
              <div className="pac-msg-av">{m.init}</div>
              <div className="pac-msg-bubble">
                <div className="pac-msg-head">
                  <span className="pac-msg-name">{m.name}</span>
                  <span className="pac-msg-time">{m.time}</span>
                </div>
                <div
                  className="pac-msg-text"
                  dangerouslySetInnerHTML={{
                    __html: m.text.replace(/(@\w+)/g, '<span class="tag">$1</span>'),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="pac-page-sub">Nog geen overleg vastgelegd voor dit dossier.</p>
      )}
      <div className="pac-overleg-compose">
        <input
          value={input}
          placeholder="Schrijf een bericht… (@naam om te taggen)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
        />
        <button type="button" className="pac-btn" onClick={send}>
          Plaats
        </button>
      </div>
      <div className="pac-archief-note">
        ⛁ Conversatie wordt gelogd · resultaten → SharePoint + Archiefwet-metadata
      </div>
    </div>
  );
}

function DossierMonitoring({ d }: { d: Dossier }) {
  const [gecureerd, setGecureerd] = useState<Signal[]>([]);
  const [inbox, setInbox] = useState<Signal[]>([]);
  const [savedSearch, setSavedSearch] = useState<SavedSearch | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [sigs, inb, searches] = await Promise.all([
      fetchSignals({ dossierId: d.id }),
      fetchInbox({ dossierId: d.id }),
      fetchSearches(),
    ]);
    setGecureerd(sigs);
    setInbox(inb);
    setSavedSearch(searches.find((s) => s.dossierId === d.id) ?? null);
  }, [d.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleInbox = inbox.filter((s) => !confirmedIds.has(s.id) && !dismissedIds.has(s.id));

  const handleConfirm = async (s: Signal) => {
    try {
      await confirmSignal(s.id);
      setConfirmedIds((prev) => new Set([...prev, s.id]));
      setGecureerd((prev) =>
        [...prev, { ...s, status: 'confirmed' as const }].sort((a, b) => b.rel - a.rel)
      );
    } catch {
      /* keep in inbox */
    }
  };

  return (
    <div>
      <p className="pac-page-sub" style={{ marginTop: 0, marginBottom: 16 }}>
        Signalen uit Tweede Kamer en Officiële Bekendmakingen, gefilterd op dit dossier. Bevestigde
        signalen tellen mee in het kompas en de tijdlijn.
      </p>

      {savedSearch && (
        <div className="pac-savedquery">
          <span className="lbl">Opgeslagen zoekvraag</span>
          <code>{savedSearch.query.q}</code>
          <span className="pac-savedquery-tags">
            {savedSearch.tags.map((t) => (
              <span key={t} className="pac-minitag">
                #{t}
              </span>
            ))}
          </span>
        </div>
      )}

      {visibleInbox.length > 0 && (
        <section className="pac-section" style={{ marginTop: 18 }}>
          <div className="pac-section-head">
            <h2 className="pac-section-title">
              Te bevestigen <span className="pac-q">— nieuw binnen voor dit dossier</span>
            </h2>
            <span className="pac-total">{visibleInbox.length} in inbox</span>
          </div>
          <div className="pac-cards">
            {visibleInbox.map((s) => (
              <div key={s.id} className="pac-signal pac-signal-inbox">
                <div className="pac-signal-rel">
                  <div className="pac-signal-rel-num">{s.rel}</div>
                  <div className="pac-signal-rel-lbl">
                    {s.status === 'ai_drafted' ? 'AI-rel.' : 'regel-rel.'}
                  </div>
                </div>
                <div className="pac-signal-body">
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      marginBottom: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span className={`pac-sigstatus ${s.status === 'ai_drafted' ? 'ai' : 'cand'}`}>
                      {s.status === 'ai_drafted' ? '✦ AI-concept' : 'Regel-kandidaat'}
                    </span>
                    <span className={`pac-bron pac-bron-${s.bron ?? ''}`}>
                      {s.bron === 'tk'
                        ? 'Tweede Kamer'
                        : s.bron === 'ob'
                          ? 'Off. Bekendmakingen'
                          : ''}
                    </span>
                  </div>
                  <div className="pac-signal-title">{s.title}</div>
                  <div className="pac-signal-src">
                    {s.src}
                    {s.ref && (
                      <a
                        className="pac-prov"
                        href={s.ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {s.ref.nr} ↗
                      </a>
                    )}
                  </div>
                  {s.status === 'ai_drafted' && s.duiding ? (
                    <div className="pac-signal-duiding ai">
                      <span className="lbl">AI-duiding · concept</span>
                      {s.duiding}
                    </div>
                  ) : (
                    <div className="pac-duiding-empty">
                      Door regels geselecteerd. <b>Handmatige duiding nodig.</b>
                    </div>
                  )}
                </div>
                <div className="pac-signal-impact">
                  {s.status === 'ai_drafted' && s.impact && (
                    <span className={`pac-impact ${s.impact}`}>{s.impactLabel}</span>
                  )}
                  <div className="pac-inbox-actions">
                    <button
                      type="button"
                      className="pac-btn pac-btn-sm"
                      onClick={() => void handleConfirm(s)}
                    >
                      Bevestigen
                    </button>
                    <button
                      type="button"
                      className="pac-btn pac-btn-sm pac-btn-ghost"
                      onClick={() => setDismissedIds((prev) => new Set([...prev, s.id]))}
                    >
                      Negeren
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="pac-section" style={{ marginTop: 18 }}>
        <div className="pac-section-head">
          <h2 className="pac-section-title">
            Gecureerd <span className="pac-q">— bevestigde signalen</span>
          </h2>
          <span className="pac-total">{gecureerd.length} signalen</span>
        </div>
        {gecureerd.length ? (
          <div className="pac-cards">
            {gecureerd.map((s) => (
              <div key={s.id} className="pac-signal">
                <div className="pac-signal-rel">
                  <div className="pac-signal-rel-num">{s.rel}</div>
                  <div className="pac-signal-rel-lbl">relevantie</div>
                </div>
                <div className="pac-signal-body">
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      marginBottom: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span className={`pac-tag ${signalTag(s.tab)}`}>{signalTagLabel(s.tab)}</span>
                    {s.bron && (
                      <span className={`pac-bron pac-bron-${s.bron}`}>
                        {s.bron === 'tk' ? 'Tweede Kamer' : 'Off. Bekendmakingen'}
                      </span>
                    )}
                  </div>
                  <div className="pac-signal-title">{s.title}</div>
                  <div className="pac-signal-src">
                    {s.src}
                    {s.ref && (
                      <a
                        className="pac-prov"
                        href={s.ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {s.ref.nr} ↗
                      </a>
                    )}
                  </div>
                  {s.duiding && (
                    <div className="pac-signal-duiding">
                      <span className="lbl">Duiding</span>
                      {s.duiding}
                    </div>
                  )}
                  {s.confirmedBy && (
                    <div className="pac-confirmed-by">
                      ✓ Bevestigd door {s.confirmedBy} · {s.confirmedAt}
                    </div>
                  )}
                </div>
                <div className="pac-signal-impact">
                  {s.impact && <span className={`pac-impact ${s.impact}`}>{s.impactLabel}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="pac-page-sub">Nog geen bevestigde signalen voor dit dossier.</p>
        )}
      </section>
    </div>
  );
}

function Tijdlijn({ d }: { d: Dossier }) {
  return (
    <div>
      <p className="pac-page-sub" style={{ marginTop: 0, marginBottom: 22 }}>
        De lobby-canon: relevante gebeurtenissen met gekoppelde documenten en een blik vooruit. Doel
        — weten in plaats van reconstrueren.
      </p>
      <div className="pac-timeline">
        {d.timeline.map((e, i) => (
          <div className={`pac-tl-item ${e.future ? 'future' : ''}`} key={i}>
            <div className="pac-tl-date">
              {e.date}
              {e.future ? ' · gepland' : ''}
            </div>
            <div className="pac-tl-title">{e.title}</div>
            <div className="pac-tl-desc">{e.desc}</div>
            {e.docs.length > 0 && (
              <div className="pac-tl-docs">
                {e.docs.map((doc, j) => (
                  <a key={j} className="pac-doc" href="#" onClick={(ev) => ev.preventDefault()}>
                    {doc}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
