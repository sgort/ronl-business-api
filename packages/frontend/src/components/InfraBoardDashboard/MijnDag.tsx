import { getUser } from '../../services/keycloak';
import type { KeycloakUser } from '@ronl/shared';
import { useOpenTasks, groupTasksByHorizon, type LiveTodo } from '../../services/infra.api';
import {
  getMockTodos,
  getMockPortfolio,
  MIJN_PROJECT_NRS,
} from '../../pages/infra-board/infra-board.data';
import { STATUS, HEALTH, roleByKey, type StatusKey } from '../../pages/infra-board/rip-model';
import { ripPhaseByCode } from '../../pages/infra-board/rip-phases.catalog';
import type { ProjectRef } from '../../pages/InfraBoardDashboard';

interface Props {
  user: KeycloakUser | null;
  onOpenProject: (ref: ProjectRef) => void;
  onGotoPortfolio: () => void;
}

function TodoRow({
  prio,
  titel,
  proj,
  sub,
  actie,
  onOpen,
}: {
  prio: StatusKey;
  titel: string;
  proj: string;
  sub: string;
  actie: string;
  onOpen: () => void;
}) {
  return (
    <div className="pb-todo-item" onClick={onOpen}>
      <span className="pb-prio" style={{ background: STATUS[prio]?.color }} />
      <div className="pb-todo-main">
        <div className="t">
          {titel}
          <span className="proj">{proj}</span>
        </div>
        <div className="s">{sub}</div>
      </div>
      <button
        type="button"
        className="pb-todo-action"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        {actie}
        <span className="arr">→</span>
      </button>
    </div>
  );
}

export default function MijnDag({ user, onOpenProject, onGotoPortfolio }: Props) {
  const u = user ?? getUser();
  const first = (u?.name || u?.preferred_username || 'collega').split(/[\s-]+/)[0];

  // LIVE work surface: the user's open engine tasks.
  const { data: tasks } = useOpenTasks();
  const liveGroups = tasks ? groupTasksByHorizon(tasks) : null;

  // Curated mock fills the rest until those aggregates have endpoints.
  const mock = getMockTodos();
  const portfolio = getMockPortfolio();
  const mijn = MIJN_PROJECT_NRS.map((nr) => portfolio.find((p) => p.nr === nr)).filter(
    Boolean
  ) as ReturnType<typeof getMockPortfolio>;

  const liveCount = liveGroups
    ? liveGroups.vandaag.length + liveGroups.deze_week.length + liveGroups.volgende_week.length
    : 0;

  const renderLive = (items: LiveTodo[]) =>
    items.map((it) => (
      <TodoRow
        key={it.taskId}
        prio={it.prio}
        titel={it.titel}
        proj={it.proj}
        sub={it.sub}
        actie="Behandelen"
        onOpen={() => onOpenProject({ nr: it.proj, instanceId: it.processInstanceId })}
      />
    ));

  const group = (title: string, live: LiveTodo[] | undefined, mockItems: typeof mock.vandaag) => {
    const total = (live?.length ?? 0) + mockItems.length;
    return (
      <div className="pb-todo-group">
        <div className="pb-todo-grouphead">
          <h3>{title}</h3>
          <span className="count">
            {total} {total === 1 ? 'taak' : 'taken'}
          </span>
        </div>
        {live && renderLive(live)}
        {mockItems.map((it, i) => (
          <TodoRow key={'m' + i} {...it} onOpen={() => onOpenProject({ nr: it.proj })} />
        ))}
      </div>
    );
  };

  return (
    <div className="pb-view">
      <div className="pb-day-head">
        <div className="date">
          vrijdag 19 juni 2026
          <br />
          week 25
        </div>
        <p className="pb-eyebrow">Mijn dag · Provincie Flevoland</p>
        <h1 className="pb-h1">Goedemorgen, {first}</h1>
        <p className="pb-lead">
          Je hebt {liveCount} open {liveCount === 1 ? 'taak' : 'taken'} in lopende RIP-processen en
          stuurt {mijn.length} projecten als{' '}
          {(u?.roles ?? []).slice(0, 2).join(' / ') || 'projectteam'}.
        </p>
      </div>

      <div className="pb-day">
        <div>
          {group('Vandaag', liveGroups?.vandaag, mock.vandaag)}
          {group('Deze week', liveGroups?.deze_week, mock.deze_week)}
          {group('Volgende week', liveGroups?.volgende_week, mock.volgende_week)}
        </div>

        <div>
          <div className="pb-side-card">
            <div className="pb-side-head">
              <h3 className="pb-card-h">Mijn projecten</h3>
              <button type="button" className="link" onClick={onGotoPortfolio}>
                Hele portfolio →
              </button>
            </div>
            {mijn.map((p) => {
              const ph = ripPhaseByCode(p.ripPhaseCode)!;
              return (
                <button
                  type="button"
                  key={p.id}
                  className="pb-mp-item"
                  onClick={() => onOpenProject({ nr: p.nr })}
                >
                  <div>
                    <div className="pb-mp-name">{p.naam}</div>
                    <div className="pb-mp-meta">
                      <span className={`pb-health ${p.health}`} />
                      <span>{p.nr}</span>
                      <span>· {roleByKey(p.role).short}</span>
                      <span>· {HEALTH[p.health].label}</span>
                    </div>
                  </div>
                  <span className="pb-mp-phase">
                    {ph.code} · {ph.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
