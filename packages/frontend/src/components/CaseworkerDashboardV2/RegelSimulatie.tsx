// packages/frontend/src/components/CaseworkerDashboardV2/RegelSimulatie.tsx
/**
 * Regelsimulatie — section shell.
 * Ports docs/regelsimulatie-handoff/reference/preview/mock-simulatie.jsx's
 * `MockSimulatie` (reference lines 428-743) 1:1, wiring together the engine
 * (Task 1) and the five sub-components (Tasks 3-5) into the actual page.
 */
import { useEffect, useMemo, useState } from 'react';
import { run } from './regelsimulatie/simEngine';
import type { ExhaustionEvent, FeedUitkomst, SimConfig } from './regelsimulatie/types';
import { simEur, simEurK } from './regelsimulatie/simFormat';
import SimPot from './regelsimulatie/SimPot';
import SimOutcomeRow from './regelsimulatie/SimOutcomeRow';
import SimTweak from './regelsimulatie/SimTweak';
import SimChart from './regelsimulatie/SimChart';
import SimMissedPanel from './regelsimulatie/SimMissedPanel';

const SIM_DEFAULTS: SimConfig = {
  seed: 20260112,
  populatie: 3150, // ~10% oversubscribed: both years' budgets run out before year-end
  eigenaarRatio: 0.68,
  kostenGem: 4200,
  kostenSd: 1800,
  pFailliet: 0.02,
  pBuitenprovincie: 0.07,
  pGeenRelatie: 0.03,
  pGeenToestemming: 0.14,
  pNaamMismatch: 0.05,
  budgetScale: 1,
  aandeel2026: 0.46, // submissions split so 2026 (€875k) and 2027 (€1,0M) are similarly oversubscribed
  arrivalPow: 1.3, // mild opening rush (U^pow); keeps the sawtooth without stranding late budget
  // processing + extra-info + bezwaar
  doorlooptijdGem: 8,
  pAanvullendeInfo: 0.32,
  infoWachtGem: 60,
  bezwaarKans: 0.22,
  bezwaarToewijzing: 0.25,
};

const SIM_LS_KEY = 'sim-thuisbatterij-v2';

function simPct(n: number): string {
  return Math.round(n * 100) + '%';
}

interface StoredSimState {
  cfg?: Partial<SimConfig>;
  day?: number;
}

function readStored(): StoredSimState {
  try {
    return JSON.parse(localStorage.getItem(SIM_LS_KEY) || '{}') as StoredSimState;
  } catch {
    return {};
  }
}

// Numeric fields that have a declared min/max range on their SimTweak slider
// (matching the ranges passed at each SimTweak call site below). `seed`,
// `arrivalPow`, and `aandeel2026` have no slider and are intentionally
// excluded. A hand-edited or corrupted localStorage value (e.g. `populatie`
// far outside 0-5000) isn't otherwise validated on restore, which — combined
// with how expensive a single run() can get at extreme settings — risks a
// self-inflicted freeze on load. Clamp restored values into their declared
// range before merging them over SIM_DEFAULTS.
const CFG_RANGES: Partial<Record<keyof SimConfig, [number, number]>> = {
  populatie: [400, 5000],
  eigenaarRatio: [0.2, 0.9],
  kostenGem: [1500, 7000],
  kostenSd: [500, 3000],
  budgetScale: [0.4, 2],
  doorlooptijdGem: [2, 40],
  pAanvullendeInfo: [0, 0.6],
  infoWachtGem: [3, 90],
  bezwaarKans: [0, 0.6],
  bezwaarToewijzing: [0, 0.6],
  pFailliet: [0, 0.2],
  pBuitenprovincie: [0, 0.3],
  pGeenRelatie: [0, 0.2],
  pGeenToestemming: [0, 0.4],
  pNaamMismatch: [0, 0.2],
};

function clampCfg(partial: Partial<SimConfig>): Partial<SimConfig> {
  const clamped: Partial<SimConfig> = { ...partial };
  for (const key of Object.keys(clamped) as (keyof SimConfig)[]) {
    const range = CFG_RANGES[key];
    const v = clamped[key];
    if (range && typeof v === 'number' && Number.isFinite(v)) {
      const [min, max] = range;
      (clamped[key] as number) = Math.min(max, Math.max(min, v));
    }
  }
  return clamped;
}

const feedBadge: Record<FeedUitkomst, { bg: string; ch: string }> = {
  volledig: { bg: 'bg-green', ch: '✓' },
  'niet-uitbetaald': { bg: 'bg-over', ch: '€' },
  'geen-hoogte': { bg: 'bg-ink3', ch: '0' },
  afgewezen: { bg: 'bg-over', ch: '✕' },
  'beroep-toegekend': { bg: 'bg-hold', ch: '⚖' },
  'beroep-afgewezen': { bg: 'bg-ink3', ch: '⚖' },
};
const feedLabel: Record<FeedUitkomst, string> = {
  volledig: 'Toegekend — uitbetaald',
  'niet-uitbetaald': 'Geldig, maar niet uitbetaald — budget op',
  'geen-hoogte': 'Recht, maar kosten te laag',
  afgewezen: 'Afgewezen',
  'beroep-toegekend': 'Beroep toegekend — alsnog uitbetaald',
  'beroep-afgewezen': 'Beroep afgewezen',
};

export default function RegelSimulatie() {
  const [cfg, setCfg] = useState<SimConfig>(() => ({
    ...SIM_DEFAULTS,
    ...clampCfg(readStored().cfg || {}),
  }));
  const [day, setDay] = useState<number>(() => readStored().day || 0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [tweaksOpen, setTweaksOpen] = useState(true);

  const result = useMemo(() => run(cfg), [cfg]);
  const N = result.days.length;
  const curDay = Math.min(day, N - 1);
  const snap = result.days[curDay];

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SIM_LS_KEY, JSON.stringify({ cfg, day: curDay }));
      } catch {
        // ignore write failures (e.g. storage disabled)
      }
    }, 200);
    return () => clearTimeout(t);
  }, [cfg, curDay]);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setDay((d) => {
        const next = d + speed;
        if (next >= N - 1) {
          setRunning(false);
          return N - 1;
        }
        return next;
      });
    }, 55);
    return () => clearInterval(iv);
  }, [running, speed, N]);

  const setTweak = (k: keyof SimConfig, v: number) => {
    setCfg((c) => ({ ...c, [k]: v }));
  };
  const reset = () => {
    setDay(0);
    setRunning(false);
  };
  const toggle = () => {
    if (curDay >= N - 1) {
      setDay(0);
      setRunning(true);
    } else setRunning((r) => !r);
  };

  const per = { year: snap.year, mode: snap.mode };
  const c = result.ceilings[snap.year];
  const holdInPool = snap.holdTotal;
  const reservedTot = snap.reservedTot;

  const feedItems = useMemo(() => {
    const arr = result.feed.filter((e) => e.day <= curDay);
    return arr.slice(-40).reverse();
  }, [result, curDay]);

  // fresh annual budgets (2026 €875k + 2027 €1.0M); the 2026→2027 carry-over just
  // moves unspent 2026 money forward, so it's not added again here.
  const totalProgramme = result.ceilings[2026].bundled + 1000000 * result.cfg.budgetScale;
  const grantedTotal = snap.toegekendBedrag;
  const outcomeTotal = snap.ingediend || 1;

  const exhaustEvents: ExhaustionEvent[] = Object.values(result.exhaustion).sort(
    (a, b) => a.day - b.day
  );
  const firstExhaust = exhaustEvents[0];

  return (
    <div className="sim">
      <header className="sim-head">
        <div>
          <p className="v2-crumb">Simulatie · Subsidie thuisbatterij</p>
          <h1 className="v2-page-title">Regelsimulatie — Subsidie thuisbatterij</h1>
          <p className="sim-lede">
            De volledige aanvraagperiode <b>2026–2027</b> uitgespeeld tegen een synthetische
            doelgroep. Elke aanvraag doorloopt de échte DMN-beslisregels (recht, hoogte, plafond)
            met een <b>doorlooptijd</b>: bij indiening wordt de basishoogte <b>gereserveerd</b> in
            de pot en pas vrijgegeven bij afwijzing of uitbetaling. Sommige aanvragen krijgen een{' '}
            <b>verzoek om aanvullende informatie</b> — dat verlengt de behandeling én verschuift de
            uitbetaal-prioriteit naar het moment dat de info binnenkomt. Daardoor kan een{' '}
            <b>geldige</b> aanvraag alsnog onbetaald blijven omdat een andere claim voorrang had.
          </p>
        </div>
        <div className="sim-badges">
          <span className="sim-badge dmn">DMN-getrouw · recht + hoogte + plafond</span>
          <span className="sim-badge">Reservering + doorlooptijd + aanvullende info</span>
          <span className="sim-badge">CVDR750157 · Flevoland</span>
          <span className="sim-badge mock">Synthetische populatie</span>
        </div>
      </header>

      <div className="sim-tweaks">
        <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Scenario-parameters</span>
          <button type="button" className="sim-collapse" onClick={() => setTweaksOpen((o) => !o)}>
            {tweaksOpen ? 'verbergen ▲' : 'tonen ▼'}
          </button>
        </h3>
        {tweaksOpen && (
          <>
            <div className="sim-tweakgrid">
              <SimTweak
                label="Omvang doelgroep"
                value={cfg.populatie}
                display={cfg.populatie.toLocaleString('nl-NL') + ' aanvragen'}
                min={400}
                max={5000}
                step={100}
                onChange={(v) => setTweak('populatie', v)}
              />
              <SimTweak
                label="Verhouding eigenaar / huurder"
                value={cfg.eigenaarRatio}
                display={
                  simPct(cfg.eigenaarRatio) + ' eig · ' + simPct(1 - cfg.eigenaarRatio) + ' huur'
                }
                min={0.2}
                max={0.9}
                step={0.02}
                onChange={(v) => setTweak('eigenaarRatio', v)}
              />
              <SimTweak
                label="Gem. subsidiabele kosten"
                value={cfg.kostenGem}
                display={simEur(cfg.kostenGem)}
                min={1500}
                max={7000}
                step={100}
                onChange={(v) => setTweak('kostenGem', v)}
              />
              <SimTweak
                label="Spreiding kosten (σ)"
                value={cfg.kostenSd}
                display={'± ' + simEur(cfg.kostenSd)}
                min={500}
                max={3000}
                step={100}
                onChange={(v) => setTweak('kostenSd', v)}
              />
              <SimTweak
                label="Budget-schaal (plafonds)"
                value={cfg.budgetScale}
                display={
                  cfg.budgetScale.toFixed(2).replace('.', ',') + '× · ' + simEurK(totalProgramme)
                }
                min={0.4}
                max={2}
                step={0.05}
                onChange={(v) => setTweak('budgetScale', v)}
              />
              <SimTweak
                label="Gem. doorlooptijd"
                value={cfg.doorlooptijdGem}
                display={cfg.doorlooptijdGem + ' dagen'}
                min={2}
                max={40}
                step={1}
                onChange={(v) => setTweak('doorlooptijdGem', v)}
              />
            </div>
            <div className="sim-tweakgrid" style={{ marginTop: 16 }}>
              <SimTweak
                label="Kans op verzoek aanvullende info"
                value={cfg.pAanvullendeInfo}
                display={simPct(cfg.pAanvullendeInfo)}
                min={0}
                max={0.6}
                step={0.02}
                onChange={(v) => setTweak('pAanvullendeInfo', v)}
              />
              <SimTweak
                label="Wachttijd aanvullende info"
                value={cfg.infoWachtGem}
                display={cfg.infoWachtGem + ' dagen'}
                min={3}
                max={90}
                step={1}
                onChange={(v) => setTweak('infoWachtGem', v)}
              />
              <SimTweak
                label="Bezwaarkans (na gemiste uitbetaling)"
                value={cfg.bezwaarKans}
                display={simPct(cfg.bezwaarKans)}
                min={0}
                max={0.6}
                step={0.02}
                onChange={(v) => setTweak('bezwaarKans', v)}
              />
              <SimTweak
                label="Bezwaar toegewezen"
                value={cfg.bezwaarToewijzing}
                display={simPct(cfg.bezwaarToewijzing)}
                min={0}
                max={0.6}
                step={0.02}
                onChange={(v) => setTweak('bezwaarToewijzing', v)}
              />
            </div>
            <div className="sim-tweakgrid" style={{ marginTop: 16 }}>
              <SimTweak
                label="Uitval — failliet"
                value={cfg.pFailliet}
                display={simPct(cfg.pFailliet)}
                min={0}
                max={0.2}
                step={0.01}
                onChange={(v) => setTweak('pFailliet', v)}
              />
              <SimTweak
                label="Uitval — buiten Flevoland"
                value={cfg.pBuitenprovincie}
                display={simPct(cfg.pBuitenprovincie)}
                min={0}
                max={0.3}
                step={0.01}
                onChange={(v) => setTweak('pBuitenprovincie', v)}
              />
              <SimTweak
                label="Uitval — geen eigenaar/huurder"
                value={cfg.pGeenRelatie}
                display={simPct(cfg.pGeenRelatie)}
                min={0}
                max={0.2}
                step={0.01}
                onChange={(v) => setTweak('pGeenRelatie', v)}
              />
              <SimTweak
                label="Uitval — huurder zonder toestemming"
                value={cfg.pGeenToestemming}
                display={simPct(cfg.pGeenToestemming)}
                min={0}
                max={0.4}
                step={0.01}
                onChange={(v) => setTweak('pGeenToestemming', v)}
              />
              <SimTweak
                label="Uitval — naam ≠ energierekening"
                value={cfg.pNaamMismatch}
                display={simPct(cfg.pNaamMismatch)}
                min={0}
                max={0.2}
                step={0.01}
                onChange={(v) => setTweak('pNaamMismatch', v)}
              />
            </div>
            <p className="sim-tweak-foot">
              Wijzig een parameter en de hele periode wordt opnieuw doorgerekend (deterministisch).
              Budget wordt gereserveerd zodra een aanvraag binnenkomt en pas vrijgegeven bij besluit
              of uitbetaling. Elke aanvraag valt onder het budget van haar <b>indienjaar</b> — een
              aanvraag uit 2026 die pas in 2027 wordt afgehandeld, wordt nog uit het budget 2026
              betaald. Plafonds: eigenaren €437,5k · huurders €437,5k, apart tot 1 okt en daarna
              gebundeld (geen onderscheid). 2026 telt €875k;{' '}
              <b>2027 = €1,0 mln + wat 2026 overhield</b>
              {result && result.ceilings
                ? ` (nu €${(result.ceilings[2027].bundled / 1e6).toFixed(2).replace('.', ',')} mln)`
                : ''}
              .
            </p>
          </>
        )}
      </div>

      <div className="sim-controlbar">
        <button type="button" className="sim-btn" onClick={toggle}>
          {running ? '❚❚ Pauze' : curDay >= N - 1 ? '↻ Opnieuw' : '▶ Speel af'}
        </button>
        <button type="button" className="sim-btn ghost" onClick={reset}>
          Reset
        </button>
        <span className="sim-datepill">
          {result.meta.fmtDate(snap.ts)} ·{' '}
          <span className="yr">
            dag {curDay + 1}/{N}
          </span>
        </span>
        <span className={'sim-modepill ' + per.mode}>
          {per.mode === 'split'
            ? 'Gesplitst plafond'
            : per.mode === 'bundled'
              ? 'Gebundeld plafond'
              : 'Buiten periode'}
        </span>
        <div className="sim-scrub">
          <input
            type="range"
            aria-label="Tijdlijn"
            min={0}
            max={N - 1}
            step={1}
            value={curDay}
            onChange={(e) => {
              setRunning(false);
              setDay(parseInt(e.target.value, 10));
            }}
          />
        </div>
        <div className="sim-speed">
          <span>Snelheid</span>
          <input
            type="range"
            aria-label="Snelheid"
            min={1}
            max={12}
            step={1}
            value={speed}
            onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
          />
          <span style={{ fontFamily: 'var(--v2-mono)', minWidth: 34 }}>{speed}×</span>
        </div>
      </div>

      <div className="sim-grid">
        {/* LEFT */}
        <div style={{ minWidth: 0 }}>
          <div className="sim-card">
            <h2>
              Budgetuitputting{' '}
              <span className="h2-note">
                actieve pot · {snap.year}{' '}
                {per.mode === 'split' ? '(gesplitst)' : per.mode === 'bundled' ? '(gebundeld)' : ''}
              </span>
            </h2>

            <div className="sim-metrics">
              <div className="sim-metric">
                <div className="m-label">Programmabudget</div>
                <div className="m-value">{simEurK(totalProgramme)}</div>
                <div className="m-sub">2026 + 2027</div>
              </div>
              <div className="sim-metric green">
                <div className="m-label">Uitbetaald</div>
                <div className="m-value">{simEurK(grantedTotal)}</div>
                <div className="m-sub">{snap.volledig} beschikkingen</div>
              </div>
              <div className="sim-metric">
                <div className="m-label" style={{ color: 'var(--v2-amber)' }}>
                  Gereserveerd
                </div>
                <div className="m-value" style={{ color: 'var(--v2-amber)' }}>
                  {simEurK(reservedTot)}
                </div>
                <div className="m-sub">{snap.inBehandeling} in behandeling</div>
              </div>
              <div className="sim-metric accent">
                <div className="m-label">Vrij te besteden</div>
                <div className="m-value">{simEurK(snap.beschikbaar)}</div>
                <div className="m-sub">
                  {per.mode === 'split' ? 'na reservering' : snap.year + ' gebundeld'}
                </div>
              </div>
            </div>

            <div style={{ minHeight: 150 }}>
              {per.mode === 'split' ? (
                <>
                  <SimPot
                    name="Eigenaren"
                    tag={String(snap.year)}
                    total={c.eig}
                    used={snap.reedsE}
                    reserved={snap.reservedE}
                    hold={0}
                  />
                  <SimPot
                    name="Huurders"
                    tag={String(snap.year)}
                    total={c.huur}
                    used={snap.reedsH}
                    reserved={snap.reservedH}
                    hold={0}
                  />
                </>
              ) : per.mode === 'bundled' ? (
                <>
                  <SimPot
                    name="Gebundeld budget"
                    tag={String(snap.year)}
                    total={c.bundled}
                    used={snap.reedsE + snap.reedsH}
                    reserved={reservedTot}
                    hold={holdInPool}
                  />
                  <div style={{ fontSize: 11.5, color: 'var(--v2-ink-3)', marginTop: -4 }}>
                    Vanaf 1 oktober {snap.year} zijn de eigenaren- en huurderspotten samengevoegd
                    tot één plafond.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--v2-ink-3)' }}>
                  Buiten de aanvraagperiode.
                </div>
              )}
            </div>

            {firstExhaust ? (
              <div
                className={'sim-exhaust' + (firstExhaust.day > curDay ? ' safe' : '')}
                style={{ minHeight: 46 }}
              >
                <span className="x-mark">
                  {firstExhaust.day > curDay ? 'prognose' : 'uitputting'}
                </span>
                <span className="x-body">
                  {firstExhaust.day > curDay ? (
                    <>
                      Bij dit scenario raakt de eerste pot uitgeput op{' '}
                      <b>{result.meta.fmtDate(firstExhaust.ts)}</b> — <b>{firstExhaust.label}</b>.
                      Speel door om het te zien.
                    </>
                  ) : (
                    <>
                      Eerste uitputting: <b>{result.meta.fmtDate(firstExhaust.ts)}</b> —{' '}
                      {firstExhaust.label}.
                      {exhaustEvents.length > 1 && (
                        <> Daarna volgen er {exhaustEvents.length - 1} meer.</>
                      )}
                    </>
                  )}
                </span>
              </div>
            ) : (
              <div className="sim-exhaust safe" style={{ minHeight: 46 }}>
                <span className="x-mark">ruimte</span>
                <span className="x-body">
                  Bij dit scenario blijft elke pot binnen het plafond — het budget raakt <b>niet</b>{' '}
                  uitgeput.
                </span>
              </div>
            )}
          </div>

          <div className="sim-card">
            <h2>
              Beschikbaar budget over tijd{' '}
              <span className="h2-note">sawtooth · vrij (blauw) vs. incl. reservering (amber)</span>
            </h2>
            <SimChart result={result} day={curDay} />
          </div>

          <SimMissedPanel result={result} day={curDay} />
        </div>

        {/* RIGHT */}
        <div style={{ minWidth: 0 }}>
          <div className="sim-card">
            <h2>
              Uitkomsten{' '}
              <span className="h2-note">
                {snap.ingediend.toLocaleString('nl-NL')} ingediend t/m nu
              </span>
            </h2>
            <div className="sim-outcome">
              <SimOutcomeRow
                dot="bg-green"
                name="Toegekend — uitbetaald"
                val={snap.volledig}
                amount={snap.bedragVolledig}
                total={outcomeTotal}
              />
              <SimOutcomeRow
                dot="bg-over"
                name="Geldig, maar niet uitbetaald (budget op)"
                val={snap.nietUitbetaald}
                amount={snap.bedragNietUitbetaald}
                total={outcomeTotal}
              />
              {result.agg.missedDueToRFI > 0 &&
                (() => {
                  const vs = result.apps.filter(
                    (a) =>
                      a.missedDueToRFI &&
                      a.payoutResolvedDay != null &&
                      a.payoutResolvedDay <= curDay
                  );
                  const eur = vs.reduce((s, a) => s + a.basis, 0);
                  return (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 11.5,
                        color: 'var(--v2-ink-3)',
                        padding: '0 0 8px 22px',
                        marginTop: -4,
                      }}
                    >
                      <span>↳ waarvan valide, misgelopen door RFI-prioriteitsverschuiving</span>
                      <span
                        style={{
                          fontFamily: 'var(--v2-mono)',
                          fontWeight: 700,
                          color: 'var(--v2-overdue)',
                        }}
                      >
                        {vs.length} · {simEurK(eur)}
                      </span>
                    </div>
                  );
                })()}
              {result.agg.missedDueToBeroep > 0 &&
                (() => {
                  const vs = result.apps.filter(
                    (a) =>
                      a.missedDueToBeroep &&
                      a.payoutResolvedDay != null &&
                      a.payoutResolvedDay <= curDay
                  );
                  const eur = vs.reduce((s, a) => s + a.basis, 0);
                  return (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 11.5,
                        color: 'var(--v2-ink-3)',
                        padding: '0 0 8px 22px',
                        marginTop: -4,
                      }}
                    >
                      <span>↳ waarvan valide, verdrongen door een succesvol beroep</span>
                      <span
                        style={{
                          fontFamily: 'var(--v2-mono)',
                          fontWeight: 700,
                          color: 'var(--sim-hold, #7c3aed)',
                        }}
                      >
                        {vs.length} · {simEurK(eur)}
                      </span>
                    </div>
                  );
                })()}
              <SimOutcomeRow
                dot="bg-amber"
                name="In behandeling (gereserveerd)"
                val={snap.inBehandeling}
                amount={snap.bedragInBehandeling}
                total={outcomeTotal}
              />
              <SimOutcomeRow
                dot="bg-amber"
                name="Besloten — wacht op uitbetaling"
                val={snap.wachtUitbetaling}
                amount={snap.bedragWacht}
                total={outcomeTotal}
              />
              <SimOutcomeRow
                dot="bg-ink3"
                name="Recht, kosten te laag"
                val={snap.kostenTeLaag}
                amount={snap.bedragKostenTeLaag}
                total={outcomeTotal}
              />
              <SimOutcomeRow
                dot="bg-over"
                name="Geen recht (afgewezen)"
                val={snap.afgewezenRecht}
                amount={snap.bedragAfgewezen}
                total={outcomeTotal}
              />
            </div>
            <div
              style={{ borderTop: '1px solid var(--v2-rule-2)', margin: '14px 0', paddingTop: 14 }}
            >
              <div
                style={{
                  fontFamily: 'var(--v2-mono)',
                  fontSize: 10,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--v2-ink-3)',
                  marginBottom: 10,
                }}
              >
                Afwijzingsredenen (recht) · hele periode
              </div>
              <SimOutcomeRow
                dot="bg-chrome"
                name="Failliet"
                val={result.agg.redenen.failliet}
                total={Math.max(result.agg.afgewezenRecht, 1)}
              />
              <SimOutcomeRow
                dot="bg-chrome"
                name="Buiten Flevoland"
                val={result.agg.redenen.buitenprovincie}
                total={Math.max(result.agg.afgewezenRecht, 1)}
              />
              <SimOutcomeRow
                dot="bg-chrome"
                name="Geen eigenaar/huurder"
                val={result.agg.redenen.relatie}
                total={Math.max(result.agg.afgewezenRecht, 1)}
              />
              <SimOutcomeRow
                dot="bg-chrome"
                name="Huurder zonder toestemming"
                val={result.agg.redenen.toestemming}
                total={Math.max(result.agg.afgewezenRecht, 1)}
              />
              <SimOutcomeRow
                dot="bg-chrome"
                name="Naam ≠ energierekening"
                val={result.agg.redenen.energierekening}
                total={Math.max(result.agg.afgewezenRecht, 1)}
              />
            </div>
            <div
              style={{
                borderTop: '1px solid var(--v2-rule-2)',
                margin: '14px 0 0',
                paddingTop: 14,
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
                alignContent: 'flex-start',
                minHeight: 40,
                fontSize: 12,
                color: 'var(--v2-ink-2)',
              }}
            >
              <span>
                <b style={{ fontFamily: 'var(--v2-mono)' }}>
                  {result.agg.rfiTotaal.toLocaleString('nl-NL')}
                </b>{' '}
                verzoeken aanvullende info
              </span>
              <span>
                <b style={{ fontFamily: 'var(--v2-mono)', color: 'var(--v2-overdue)' }}>
                  {result.agg.missedDueToRFI.toLocaleString('nl-NL')}
                </b>{' '}
                misgelopen door prioriteitsverschuiving
              </span>
              <span>
                <b style={{ fontFamily: 'var(--v2-mono)' }}>
                  {snap.rfiOpen.toLocaleString('nl-NL')}
                </b>{' '}
                nu wachtend op info
              </span>
              <span>
                <b style={{ fontFamily: 'var(--v2-mono)' }}>
                  {result.agg.bezwaarToegewezen.toLocaleString('nl-NL')}
                </b>{' '}
                beroepen toegekend
              </span>
              <span>
                <b style={{ fontFamily: 'var(--v2-mono)', color: 'var(--sim-hold, #7c3aed)' }}>
                  {result.agg.missedDueToBeroep.toLocaleString('nl-NL')}
                </b>{' '}
                verdrongen door beroep
              </span>
            </div>
          </div>

          <div className="sim-card">
            <h2>
              Aanvragen <span className="h2-note">meest recent boven</span>
            </h2>
            {feedItems.length === 0 ? (
              <div className="sim-feed-empty">Nog geen aanvragen — speel de simulatie af.</div>
            ) : (
              <div className="sim-feed">
                {feedItems.map((e) => {
                  const b = feedBadge[e.uitkomst] || feedBadge.afgewezen;
                  return (
                    <div className="sim-fitem" key={e.id + '-' + e.day}>
                      <span className={'f-badge ' + b.bg}>{b.ch}</span>
                      <div>
                        <div className="f-title">
                          {e.naam}
                          <span className="f-type">{e.type === 'eigenaar' ? 'eig' : 'huur'}</span>
                          {e.isRFI && (
                            <span
                              className="f-type"
                              style={{ background: 'var(--v2-amber)', color: '#5a4a00' }}
                            >
                              ⓘ info
                            </span>
                          )}
                        </div>
                        <div className="f-sub">
                          {e.plaats} · besluit {result.meta.fmtShort(e.ts)} · kosten{' '}
                          {simEur(e.kosten)}
                          <br />
                          {feedLabel[e.uitkomst]}
                          {e.uitkomst === 'afgewezen' ? ' · ' + e.reden : ''}
                          {e.uitkomst === 'niet-uitbetaald' && e.blockedById
                            ? ` · voorrang ging naar aanvraag #${e.blockedById}${e.justMissedByOne ? ' (net misgelopen)' : ''}`
                            : ''}
                          {e.bezwaar ? ' · ⚑ beroep' : ''}
                        </div>
                      </div>
                      <span className={'f-amt ' + (e.bedrag > 0 ? 'c-green' : 'c-over')}>
                        {e.bedrag > 0 ? simEur(e.bedrag) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
