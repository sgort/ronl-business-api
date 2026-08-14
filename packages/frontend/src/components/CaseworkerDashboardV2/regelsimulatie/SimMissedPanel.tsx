import { useState } from 'react';
import { simEur } from './simFormat';
import type { SimApp, SimResult } from './types';

// hatched pink for "needs more info" (RFI) and purple for budget claimed by
// an upheld appeal — mirrors the reference's inline gradient constants.
const INFO =
  'repeating-linear-gradient(135deg, var(--color-secondary,#e70077) 0 8px, #f4569f 8px 16px)';
const BEROEP = 'repeating-linear-gradient(135deg, var(--sim-hold,#7c3aed) 0 8px, #a06ff0 8px 16px)';
const PROC = '#e08a1e'; // processing (orange)

/* ---- one process segment (local submit→besluit scale) ----- */
function MtSeg({
  bg,
  color,
  label,
  l,
  r,
  reveal,
  big,
}: {
  bg: string;
  color: string;
  label: string;
  l: number;
  r: number;
  reveal: number;
  big?: boolean;
}) {
  const rr = Math.min(r, reveal);
  const w = rr - l;
  if (w <= 0.3) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: big ? 10 : 7,
        height: big ? 28 : 22,
        left: l + '%',
        width: w + '%',
        background: bg,
        color,
        borderRadius: big ? 14 : 11,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: big ? 12.5 : 10.5,
        fontWeight: 600,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--v2-sans)',
      }}
    >
      {w > (big ? 10 : 16) ? label : ''}
    </div>
  );
}

/* ---- process view: valid, but unpaid because an RFI was issued ---- */
export default function SimMissedPanel({ result, day }: { result: SimResult; day: number }) {
  const N = result.days.length;
  const cur = Math.min(day, N - 1);
  const meta = result.meta;

  const [selId, setSelId] = useState<number | null>(null);
  const [mode, setMode] = useState<'rfi' | 'beroep' | 'all'>('rfi');

  const rfiCount = result.agg.missedDueToRFI;
  const beroepCount = result.agg.missedDueToBeroep;
  const allCount = result.agg.nietUitbetaald;
  const filt: (a: SimApp) => boolean =
    mode === 'rfi'
      ? (a) => a.missedDueToRFI
      : mode === 'beroep'
        ? (a) => a.missedDueToBeroep
        : (a) => a.uitkomst === 'niet-uitbetaald';
  const all = result.apps.filter(filt).sort((a, b) => b.decisionDay - a.decisionDay);
  const revealed = all.filter((a) => a.submitDay <= cur);
  const n = revealed.length;
  let idx = revealed.findIndex((x) => x.id === selId);
  if (idx < 0) idx = 0;
  const a = n > 0 ? revealed[idx] : null;
  const go = (delta: number) => {
    const j = Math.max(0, Math.min(n - 1, idx + delta));
    setSelId(revealed[j].id);
  };

  const accent = mode === 'beroep' ? 'var(--sim-hold, #7c3aed)' : 'var(--v2-overdue)';

  let lane = null;
  let caption = null;
  if (a) {
    const span = Math.max(1, a.decisionDay - a.submitDay);
    const L = (d: number) => Math.max(0, Math.min(100, ((d - a.submitDay) / span) * 100));
    const reveal = Math.max(0, Math.min(100, ((cur - a.submitDay) / span) * 100));
    const subEnd = a.submitDay + 1;
    const preEnd = a.subprocessStart != null ? a.subprocessStart : a.decisionDay;
    const infoEnd = a.infoReceivedDay != null ? a.infoReceivedDay : preEnd;
    const done = reveal >= 99.9;
    const infoDays =
      a.infoReceivedDay != null && a.subprocessStart != null
        ? a.infoReceivedDay - a.subprocessStart
        : 0;
    lane = (
      <div>
        {/* main process bar: submit → processing → decision (unpaid) */}
        <div
          style={{
            position: 'relative',
            height: 48,
            background: 'var(--v2-rail-bg, #eef1f5)',
            borderRadius: 11,
          }}
        >
          <MtSeg
            bg="var(--v2-chrome)"
            color="#fff"
            label="ingediend"
            l={0}
            r={L(subEnd)}
            reveal={reveal}
            big
          />
          <MtSeg
            bg={PROC}
            color="#fff"
            label="behandeling"
            l={L(subEnd)}
            r={100}
            reveal={reveal}
            big
          />
          {!done && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: reveal + '%',
                width: 2,
                background: 'var(--color-secondary, #e70077)',
              }}
            />
          )}
          {done && (
            <div
              title="Geldig, maar niet uitbetaald — pot was leeg"
              style={{
                position: 'absolute',
                top: 8,
                left: 'calc(100% - 16px)',
                width: 32,
                height: 32,
                borderRadius: 16,
                background: accent,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 16,
                boxShadow: '0 1px 4px rgba(0,0,0,.28)',
              }}
            >
              {mode === 'beroep' ? '✕' : '!'}
            </div>
          )}
          {done && a.justMissedByOne && mode !== 'beroep' && (
            <>
              <div
                style={{
                  position: 'absolute',
                  inset: -4,
                  border: '2px solid var(--v2-amber)',
                  borderRadius: 14,
                  boxShadow: '0 0 0 4px rgba(229,183,0,.28)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: -12,
                  left: 14,
                  background: 'var(--v2-amber)',
                  color: '#5a4a00',
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 9,
                  whiteSpace: 'nowrap',
                }}
              >
                Net misgelopen — één aanvraag ervóór
              </div>
            </>
          )}
        </div>
        {/* RFI sub-row: the "aanvullende info" span */}
        {a.isRFI && a.subprocessStart != null && a.infoReceivedDay != null && (
          <div
            style={{
              position: 'relative',
              height: 22,
              marginTop: 6,
              borderRadius: 8,
              border: '1px dashed var(--color-secondary, #e70077)',
            }}
          >
            {(() => {
              const iL = L(preEnd);
              const iR = Math.min(L(infoEnd), reveal);
              const iW = iR - iL;
              if (iW <= 0.3) return null;
              return (
                <div
                  title="Verzoek om aanvullende informatie — behandeling gepauzeerd tot de info binnen is"
                  style={{
                    position: 'absolute',
                    top: 2,
                    bottom: 2,
                    left: iL + '%',
                    width: iW + '%',
                    background: INFO,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 10.5,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  {iW > 16 ? 'aanvullende info' : ''}
                </div>
              );
            })()}
            <span
              style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 10,
                color: 'var(--v2-ink-4, #9aa2ad)',
                fontFamily: 'var(--v2-mono)',
                pointerEvents: 'none',
              }}
            >
              ↳ aanvullende info
            </span>
          </div>
        )}
        {/* beroep sub-row: budget claimed by an upheld appeal of another request */}
        {a.missedDueToBeroep && (
          <div
            title="Budget geclaimd door een succesvol beroep tegen een afwijzing van een andere aanvraag"
            style={{
              position: 'relative',
              height: 22,
              marginTop: 6,
              borderRadius: 8,
              border: '1px dashed var(--sim-hold, #7c3aed)',
              background: BEROEP,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 8,
            }}
          >
            <span
              style={{ fontSize: 10, color: '#fff', fontFamily: 'var(--v2-mono)', fontWeight: 600 }}
            >
              ↳ budget naar succesvol beroep{a.beroepDisplacerId ? ' #' + a.beroepDisplacerId : ''}
            </span>
          </div>
        )}
      </div>
    );
    caption = (
      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 12,
          fontSize: 11.5,
          color: 'var(--v2-ink-3)',
          fontFamily: 'var(--v2-mono)',
        }}
      >
        <span>ingediend {meta.fmtShort(meta.dayToTs(a.submitDay))}</span>
        {a.subprocessStart != null && (
          <span>info gevraagd {meta.fmtShort(meta.dayToTs(a.subprocessStart))}</span>
        )}
        {a.infoReceivedDay != null && (
          <span>info binnen {meta.fmtShort(meta.dayToTs(a.infoReceivedDay))}</span>
        )}
        <span>besluit {meta.fmtShort(meta.dayToTs(a.decisionDay))}</span>
        <span style={{ color: 'var(--v2-ink-2)' }}>
          doorlooptijd {span} dgn{infoDays ? ` (${infoDays} wachten op info)` : ''}
        </span>
      </div>
    );
  }

  const tag = (app: SimApp) => {
    if (app.missedDueToRFI && app.missedDueToBeroep) {
      return { t: 'RFI + beroep', bg: 'var(--sim-hold, #7c3aed)', c: '#fff' };
    }
    if (app.missedDueToBeroep)
      return { t: 'door beroep', bg: 'var(--sim-hold, #7c3aed)', c: '#fff' };
    if (app.missedDueToRFI) return { t: 'door verschuiving', bg: 'var(--v2-overdue)', c: '#fff' };
    return { t: 'budget op', bg: 'var(--v2-rule-2)', c: 'var(--v2-ink-3)' };
  };

  const btn = (key: 'rfi' | 'beroep' | 'all', label: string, count: number, col: string) => (
    <button
      type="button"
      key={key}
      onClick={() => {
        setMode(key);
        setSelId(null);
      }}
      style={{
        padding: '6px 13px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        border: 'none',
        borderLeft: key === 'rfi' ? 'none' : '1px solid var(--v2-rule-2)',
        background: mode === key ? col : '#fff',
        color: mode === key ? '#fff' : 'var(--v2-ink-2)',
      }}
    >
      {label} ({count})
    </button>
  );

  return (
    <div className="sim-card">
      <h2>
        Geldige aanvragen die misliepen
        <span className="h2-note">recht + positieve hoogte, tóch niet uitbetaald</span>
      </h2>
      <p style={{ margin: '2px 0 12px', fontSize: 13, color: 'var(--v2-ink-2)', lineHeight: 1.5 }}>
        Aanvragen die de subsidie hadden moeten krijgen maar onbetaald bleven. Isoleer per oorzaak —
        of de
        <b> RFI-prioriteitsverschuiving</b> de aantoonbare oorzaak was (met hun échte indiendatum
        lagen ze nog vóór de uitputting), óf een <b>succesvol beroep</b> van een ander (een
        afwijzing die met succes werd aangevochten en alsnog subsidie kreeg) hun budget opsoupeerde.
        Beide per aanvraag contrafeitelijk gecontroleerd.
      </p>

      <div
        style={{
          display: 'flex',
          marginBottom: 14,
          border: '1px solid var(--v2-rule-2)',
          borderRadius: 9,
          overflow: 'hidden',
          width: 'fit-content',
          maxWidth: '100%',
          flexWrap: 'wrap',
        }}
      >
        {btn('rfi', 'Door RFI-verschuiving', rfiCount, 'var(--v2-overdue)')}
        {btn('beroep', 'Door succesvol beroep', beroepCount, 'var(--sim-hold, #7c3aed)')}
        {btn('all', 'Alle onbetaalde', allCount, 'var(--v2-chrome)')}
      </div>

      {n === 0 ? (
        <div className="sim-feed-empty">
          {all.length === 0
            ? mode === 'rfi'
              ? 'In dit scenario verliest geen enkele geldige aanvraag de uitbetaling puur door de prioriteitsverschuiving van een verzoek om aanvullende informatie.'
              : mode === 'beroep'
                ? 'In dit scenario verdringt geen enkel succesvol beroep een andere geldige aanvraag uit het budget.'
                : 'In dit scenario blijft geen enkele geldige aanvraag onbetaald.'
            : 'Nog niets misgelopen — speel de simulatie verder af.'}
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--v2-ink)' }}>
                {a!.persoon.voornaam} {a!.persoon.achternaam}
              </span>
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10.5,
                  fontFamily: 'var(--v2-mono)',
                  textTransform: 'uppercase',
                  color: 'var(--v2-ink-3)',
                }}
              >
                {a!.type === 'eigenaar' ? 'eigenaar' : 'huurder'} · {a!.persoon.plaats}
              </span>
              {mode === 'all' &&
                (() => {
                  const g = tag(a!);
                  return (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: 8,
                        background: g.bg,
                        color: g.c,
                      }}
                    >
                      {g.t}
                    </span>
                  );
                })()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{ fontSize: 12, fontFamily: 'var(--v2-mono)', color: 'var(--v2-ink-3)' }}
              >
                aanvraag {idx + 1} / {n}
              </span>
              {n > 1 && (
                <>
                  <button
                    type="button"
                    className="sim-btn ghost"
                    style={{ padding: '4px 11px', opacity: idx === 0 ? 0.4 : 1 }}
                    onClick={() => go(-1)}
                    disabled={idx === 0}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    className="sim-btn ghost"
                    style={{ padding: '4px 11px', opacity: idx === n - 1 ? 0.4 : 1 }}
                    onClick={() => go(1)}
                    disabled={idx === n - 1}
                  >
                    ▶
                  </button>
                </>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 18,
              alignItems: 'center',
              marginBottom: 8,
              fontSize: 12.5,
              flexWrap: 'wrap',
            }}
          >
            <span>
              <b style={{ color: accent }}>{simEur(a!.basis)}</b> misgelopen
            </span>
            <span style={{ color: 'var(--v2-ink-3)' }}>
              kosten {simEur(a!.persoon.gemaakteKosten || 0)}
            </span>
            {a!.missedDueToBeroep && a!.beroepDisplacerId ? (
              <span style={{ color: 'var(--v2-ink-3)' }}>
                budget naar succesvol beroep{' '}
                <b style={{ fontFamily: 'var(--v2-mono)', color: 'var(--sim-hold, #7c3aed)' }}>
                  #{a!.beroepDisplacerId}
                </b>
              </span>
            ) : (
              a!.blockedById && (
                <span style={{ color: 'var(--v2-ink-3)' }}>
                  voorrang ging naar aanvraag{' '}
                  <b style={{ fontFamily: 'var(--v2-mono)', color: 'var(--v2-ink-2)' }}>
                    #{a!.blockedById}
                  </b>
                </span>
              )
            )}
          </div>

          {lane}
          {caption}

          {n > 1 && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                minWidth: 0,
                marginTop: 18,
                paddingBottom: 4,
              }}
            >
              {revealed.map((x, k) => {
                const active = k === idx;
                const bcol = x.missedDueToBeroep
                  ? 'var(--sim-hold, #7c3aed)'
                  : x.missedDueToRFI
                    ? 'var(--v2-overdue)'
                    : 'var(--v2-rule-2)';
                return (
                  <button
                    type="button"
                    key={x.id}
                    onClick={() => setSelId(x.id)}
                    title={`${x.persoon.voornaam} ${x.persoon.achternaam} · ${simEur(x.basis)} misgelopen`}
                    style={{
                      flexShrink: 0,
                      cursor: 'pointer',
                      fontFamily: 'var(--v2-mono)',
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 7,
                      border: '1px solid ' + (active ? 'var(--v2-amber)' : bcol),
                      background: active ? 'var(--v2-amber)' : '#fff',
                      color: active
                        ? '#5a4a00'
                        : x.missedDueToBeroep
                          ? 'var(--sim-hold, #7c3aed)'
                          : x.missedDueToRFI
                            ? 'var(--v2-overdue)'
                            : 'var(--v2-ink-3)',
                      fontWeight: active ? 700 : 500,
                    }}
                  >
                    #{x.id}
                    {x.missedDueToBeroep ? ' ⚖' : x.justMissedByOne ? ' ★' : ''}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
