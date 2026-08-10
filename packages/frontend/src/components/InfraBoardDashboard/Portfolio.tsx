import { useState } from 'react';
import {
  getMockPortfolio,
  makePhase1Row,
  MIJN_PROJECT_NRS,
  TL,
  type PortfolioProject,
} from '../../pages/infra-board/infra-board.data';
import { STATUS, roleByKey, type StatusKey } from '../../pages/infra-board/rip-model';
import { RIP_PHASES, RIP_STAGES, ripPhaseByCode } from '../../pages/infra-board/rip-phases.catalog';
import { useActivePhase1 } from '../../services/infra.api';
import type { ProjectRef } from '../../pages/InfraBoardDashboard';

interface Props {
  phaseLabels: string[];
  onOpenProject: (ref: ProjectRef) => void;
}

function curPhaseIdx(p: PortfolioProject): number {
  return RIP_PHASES.findIndex((rp) => rp.code === p.ripPhaseCode);
}

function Gantt({
  rows,
  onOpenProject,
}: {
  rows: PortfolioProject[];
  onOpenProject: (ref: ProjectRef) => void;
}) {
  const QW = 26;
  const trackW = TL.quarters * QW;
  const years = Array.from({ length: TL.quarters / 4 }, (_, y) => TL.startYear + y);
  return (
    <div className="pb-gantt-wrap">
      <div
        className="pb-gantt"
        style={{ ['--track-w' as string]: trackW + 'px', ['--qw' as string]: QW + 'px' }}
      >
        <div className="pb-gantt-head">
          <div className="pb-gantt-namecol">Project</div>
          <div className="pb-gantt-track pb-gantt-years">
            {years.map((y) => (
              <div className="yr" key={y} style={{ width: 4 * QW }}>
                {y}
                <div className="qs">
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                    <span key={q}>{q}</span>
                  ))}
                </div>
              </div>
            ))}
            <div className="pb-gantt-today" style={{ left: (TL.todayIdx + 0.5) * QW }}>
              <span>vandaag</span>
            </div>
          </div>
        </div>
        <div className="pb-gantt-body">
          {rows.map((p) => (
            <div
              className="pb-gantt-row"
              key={p.id}
              onClick={() => onOpenProject({ nr: p.nr, instanceId: p.instanceId })}
            >
              <div className="pb-gantt-namecol">
                <span className={`pb-health ${p.health}`} />
                <span className="nm">{p.naam}</span>
                <span className="meta">
                  {p.nr} · {roleByKey(p.role).short}
                  {p.instanceId && <span className="pb-live-badge">live</span>}
                </span>
              </div>
              <div className="pb-gantt-track">
                <div className="pb-gantt-grid">
                  {Array.from({ length: TL.quarters }).map((_, i) => (
                    <span
                      key={i}
                      className={(i + 1) % 4 === 0 ? 'q yr-end' : 'q'}
                      style={{ width: QW }}
                    />
                  ))}
                </div>
                <div className="pb-gantt-todayline" style={{ left: (TL.todayIdx + 0.5) * QW }} />
                {p.segments.map((seg) => {
                  const s = STATUS[seg.status];
                  const phase = ripPhaseByCode(seg.phaseCode)!;
                  return (
                    <div
                      key={seg.phaseCode}
                      className={`pb-gantt-bar ${seg.status} ${seg.phaseCode === p.ripPhaseCode ? 'current' : ''}`}
                      style={{
                        left: seg.from * QW + 1,
                        width: seg.len * QW - 2,
                        background: s.color,
                      }}
                      title={`${phase.code} · ${phase.name} — ${s.label}`}
                    >
                      <span className="ph">{phase.code}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kanban({
  rows,
  onOpenProject,
}: {
  rows: PortfolioProject[];
  onOpenProject: (ref: ProjectRef) => void;
}) {
  return (
    <div className="pb-kanban">
      {RIP_PHASES.map((ph, i) => {
        const cards = rows.filter((p) => p.ripPhaseCode === ph.code);
        const stage = RIP_STAGES.find((s) => s.code === ph.stage)!;
        const firstOfStage = i === 0 || RIP_PHASES[i - 1].stage !== ph.stage;
        return (
          <div className={`pb-kan-col ${firstOfStage ? 'stage-start' : ''}`} key={ph.code}>
            <div
              className="pb-kan-stage"
              style={{ color: stage.color }}
              aria-hidden={!firstOfStage}
            >
              {firstOfStage ? (
                <>
                  <span className="pb-stage-dot" style={{ background: stage.color }} />
                  {stage.code} · {stage.name}
                </>
              ) : (
                <>&nbsp;</>
              )}
            </div>
            <div className="pb-kan-head">
              <span className="t">
                <span className="kc" style={{ background: stage.color }}>
                  {ph.code}
                </span>
                {ph.name}
              </span>
              <span className="c">{cards.length}</span>
            </div>
            <div className="pb-kan-cards">
              {cards.map((p) => {
                const st = p.segments[i].status;
                return (
                  <button
                    type="button"
                    className="pb-kan-card"
                    key={p.id}
                    onClick={() => onOpenProject({ nr: p.nr, instanceId: p.instanceId })}
                  >
                    <div className="top">
                      <span className="pb-proj-nr">{p.nr}</span>
                      {p.instanceId && <span className="pb-live-badge">live</span>}
                      <span className={`pb-health ${p.health}`} />
                    </div>
                    <div className="nm">{p.naam}</div>
                    <div className="bot">
                      <span className="pb-rol">{roleByKey(p.role).short}</span>
                      <span
                        className="pb-statuspill"
                        style={{ color: STATUS[st].color, borderColor: STATUS[st].color }}
                      >
                        {STATUS[st].short}
                      </span>
                    </div>
                    <div className="ms">
                      {st === 'wachtend' ? `Wacht op start van ${ph.code}` : p.milestone}
                    </div>
                  </button>
                );
              })}
              {cards.length === 0 && <div className="pb-kan-empty">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Portfolio({ onOpenProject }: Props) {
  const [view, setView] = useState<'tijdlijn' | 'kanban'>('tijdlijn');
  const [scope, setScope] = useState<'alle' | 'mijn' | 'risico'>('alle');
  const [role, setRole] = useState('alle');

  const { data: liveInstances } = useActivePhase1();

  // Convert live instances to portfolio rows and prepend them.
  // Remove any mock row whose project number matches a live instance (avoid duplicates).
  const liveRows: PortfolioProject[] = (liveInstances ?? []).map(makePhase1Row);
  const liveNrs = new Set(liveRows.map((r) => r.nr));
  const all = [...liveRows, ...getMockPortfolio().filter((p) => !liveNrs.has(p.nr))];
  const mijn = new Set(MIJN_PROJECT_NRS);
  let rows = all;
  if (scope === 'mijn') rows = rows.filter((p) => mijn.has(p.nr));
  if (scope === 'risico')
    rows = rows.filter(
      (p) =>
        p.health === 'rood' ||
        (['risk', 'overdue', 'action'] as StatusKey[]).includes(p.segments[curPhaseIdx(p)].status)
    );
  if (role !== 'alle') rows = rows.filter((p) => p.role === role);

  // Role filter options are derived from the projects actually present, so live
  // rows carrying any declared leadRole surface here (not just the two mock roles).
  const roleOptions = Array.from(new Set(all.map((p) => p.role))).sort((a, b) =>
    roleByKey(a).label.localeCompare(roleByKey(b).label)
  );

  const counts = {
    total: all.length,
    mijn: MIJN_PROJECT_NRS.length,
    risico: all.filter(
      (p) =>
        p.health === 'rood' ||
        (['risk', 'overdue', 'action'] as StatusKey[]).includes(p.segments[curPhaseIdx(p)].status)
    ).length,
  };

  return (
    <div className="pb-view">
      <p className="pb-eyebrow">Portfolio · Provincie Flevoland</p>
      <h1 className="pb-h1">Projectenportfolio</h1>
      <p className="pb-lead">
        {counts.total} projecten over de RIP-fasen (venster 2022–2027)
        {liveInstances ? ` · ${liveInstances.length} actieve RIP Fase 1 instanties` : ''}. Bekijk
        als tijdlijn of per fase. Klik een project om in te zoomen.
      </p>

      <div className="pb-port-toolbar">
        <div className="pb-segment">
          <button
            className={view === 'tijdlijn' ? 'active' : ''}
            onClick={() => setView('tijdlijn')}
          >
            Tijdlijn
          </button>
          <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>
            Per fase
          </button>
        </div>
        <div className="pb-segment">
          <button className={scope === 'alle' ? 'active' : ''} onClick={() => setScope('alle')}>
            Alle · {counts.total}
          </button>
          <button className={scope === 'mijn' ? 'active' : ''} onClick={() => setScope('mijn')}>
            Mijn · {counts.mijn}
          </button>
          <button className={scope === 'risico' ? 'active' : ''} onClick={() => setScope('risico')}>
            Risico · {counts.risico}
          </button>
        </div>
        <label className="pb-rolefilter">
          Rol
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="alle">Alle rollen</option>
            {roleOptions.map((k) => (
              <option key={k} value={k}>
                {roleByKey(k).label}
              </option>
            ))}
          </select>
        </label>
        <div className="pb-legend">
          {(['done', 'active', 'wachtend', 'risk', 'overdue', 'action'] as StatusKey[]).map((k) => (
            <span className="lg" key={k}>
              <span className="sw" style={{ background: STATUS[k].color }} />
              {STATUS[k].label}
            </span>
          ))}
        </div>
      </div>

      {view === 'tijdlijn' ? (
        <Gantt rows={rows} onOpenProject={onOpenProject} />
      ) : (
        <Kanban rows={rows} onOpenProject={onOpenProject} />
      )}
    </div>
  );
}
