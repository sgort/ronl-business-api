/**
 * TakenInbox — V2 replacement for TakenSection.
 *
 * Three columns:
 *   ┌──────────────┬──────────────────────┬────────────────────────┐
 *   │ Filter rail  │ Task list            │ Detail (form / claim)  │
 *   └──────────────┴──────────────────────┴────────────────────────┘
 *
 * Re-uses:
 *   - businessApi.task.list / variables / claim
 *   - TaskFormViewer for the form rendering on claimed tasks
 *
 * Differences from the existing TakenSection:
 *   - Quick-filter rail (alle / overdue / mine / today / this week)
 *   - Sort by deadline by default (most urgent first)
 *   - Detail pane uses a sectioned layout instead of a single card
 *   - "Procesgegevens" rendered as a clean key/value table, not collapsed
 *
 * The component still exposes `onCountChange` so the V2 shell can
 * show a badge in the left rail.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ActivityHistoryItem, KeycloakUser, Task } from '@ronl/shared';
import { businessApi } from '../../services/api';
import TaskFormViewer from '../CaseworkerDashboard/TaskFormViewer';
import { activityTypeLabel, AUTOMATED_TYPES } from '../CaseworkerDashboard/processSteps';
import ProcessVarsSection from '../CaseworkerDashboard/ProcessVarsSection';

type FilterId = 'all' | 'overdue' | 'mine' | 'today' | 'week' | 'unassigned';

interface FilterDef {
  id: FilterId;
  label: string;
  /** Predicate used to count + filter the task list. */
  match: (t: Task, ctx: { now: Date; userSub?: string }) => boolean;
}

const FILTERS: FilterDef[] = [
  { id: 'all', label: 'Alle taken', match: () => true },
  {
    id: 'overdue',
    label: 'Te laat',
    match: (t, { now }) => !!t.due && new Date(t.due).getTime() < now.getTime(),
  },
  {
    id: 'today',
    label: 'Vandaag',
    match: (t, { now }) => {
      if (!t.due) return false;
      const d = new Date(t.due);
      return d.toDateString() === now.toDateString();
    },
  },
  {
    id: 'week',
    label: 'Deze week',
    match: (t, { now }) => {
      if (!t.due) return false;
      const d = new Date(t.due).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      return d >= now.getTime() && d <= now.getTime() + sevenDays;
    },
  },
  {
    id: 'mine',
    label: 'Mijn claim',
    match: (t, { userSub }) => !!t.assignee && t.assignee === userSub,
  },
  {
    id: 'unassigned',
    label: 'Openstaand',
    match: (t) => !t.assignee,
  },
];

interface Props {
  user: KeycloakUser | null;
  /** Optional initial filter — supports cross-component links (e.g. rail "Te laat" item). */
  initialFilter?: FilterId;
  onCountChange?: (count: number) => void;
}

export default function TakenInbox({ user, initialFilter = 'all', onCountChange }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<FilterId>(initialFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [taskVariables, setTaskVariables] = useState<Record<string, unknown> | null>(null);
  const [activity, setActivity] = useState<ActivityHistoryItem[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // ── Load tasks ─────────────────────────────────────────
  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await businessApi.task.list();
      if (res.success) {
        const data = res.data as Task[];
        setTasks(data);
        onCountChange?.(data.length);
      } else {
        setError('Taken konden niet worden geladen.');
        onCountChange?.(0);
      }
    } catch {
      setError('Taken konden niet worden geladen.');
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  // ── Filter + sort ──────────────────────────────────────
  const ctx = useMemo(() => ({ now: new Date(), userSub: user?.sub }), [user?.sub]);

  const counts = useMemo(() => {
    const out = {} as Record<FilterId, number>;
    for (const f of FILTERS) out[f.id] = tasks.filter((t) => f.match(t, ctx)).length;
    return out;
  }, [tasks, ctx]);

  const visible = useMemo(() => {
    const def = FILTERS.find((f) => f.id === activeFilter)!;
    return tasks
      .filter((t) => def.match(t, ctx))
      .slice()
      .sort((a, b) => {
        // Deadline ascending (soonest first), no-deadline last.
        const ad = a.due ? new Date(a.due).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.due ? new Date(b.due).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return new Date(b.created).getTime() - new Date(a.created).getTime();
      });
  }, [tasks, activeFilter, ctx]);

  const selected = visible.find((t) => t.id === selectedId) ?? null;

  // ── Load detail on selection ───────────────────────────
  const handleSelect = async (task: Task) => {
    setSelectedId(task.id);
    setTaskVariables(null);
    setActivity(null);
    setActionMessage(null);
    setDetailLoading(true);
    try {
      const [varsRes, activityRes] = await Promise.allSettled([
        businessApi.task.variables(task.id),
        businessApi.process.activityHistory(task.processInstanceId),
      ]);
      if (varsRes.status === 'fulfilled' && varsRes.value.success) {
        setTaskVariables(varsRes.value.data as Record<string, unknown>);
      }
      if (activityRes.status === 'fulfilled' && activityRes.value.success) {
        setActivity(activityRes.value.data as ActivityHistoryItem[]);
      }
    } catch {
      /* non-critical */
    } finally {
      setDetailLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!selected) return;
    setClaiming(true);
    setActionMessage(null);
    try {
      const res = await businessApi.task.claim(selected.id);
      if (res.success) {
        setActionMessage({ type: 'success', text: 'Taak geclaimd.' });
        // Mutate the local task list so the detail pane reflects the new assignee
        setTasks((ts) => ts.map((t) => (t.id === selected.id ? { ...t, assignee: user?.sub } : t)));
      } else {
        setActionMessage({ type: 'error', text: 'Claimen mislukt.' });
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Claimen mislukt.' });
    } finally {
      setClaiming(false);
    }
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="v2-taken">
      {/* Filter rail (column 1) */}
      <aside className="v2-taken-filters" aria-label="Taakfilters">
        <h3 className="v2-taken-filters-title">Filters</h3>
        <ul>
          {FILTERS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className={[
                  'v2-taken-filter',
                  activeFilter === f.id ? 'active' : '',
                  f.id === 'overdue' ? 'overdue' : '',
                ].join(' ')}
                onClick={() => setActiveFilter(f.id)}
              >
                <span>{f.label}</span>
                <span className="count">{counts[f.id] ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="v2-taken-refresh" onClick={loadTasks}>
          ↺ Vernieuwen
        </button>
      </aside>

      {/* Task list (column 2) */}
      <section className="v2-taken-list" aria-label="Takenlijst">
        <header>
          <h3>{FILTERS.find((f) => f.id === activeFilter)!.label}</h3>
          <span className="v2-taken-list-meta">{visible.length} taken</span>
        </header>

        {loading && <div className="v2-taken-state">Taken laden…</div>}
        {error && <div className="v2-taken-state v2-taken-state-error">{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div className="v2-taken-state">Geen taken in dit filter.</div>
        )}

        <ul>
          {visible.map((t) => {
            const overdue = !!t.due && new Date(t.due).getTime() < Date.now();
            return (
              <li key={t.id}>
                <button
                  type="button"
                  className={`v2-taken-item ${selected?.id === t.id ? 'active' : ''} ${
                    overdue ? 'overdue' : ''
                  }`}
                  onClick={() => handleSelect(t)}
                >
                  <div className="v2-taken-item-row">
                    <span className="v2-taken-item-name">{t.name}</span>
                    {t.assignee ? (
                      <span className="v2-taken-pill claimed">Geclaimd</span>
                    ) : (
                      <span className="v2-taken-pill open">Open</span>
                    )}
                  </div>
                  <div className="v2-taken-item-meta">
                    <code>{t.processDefinitionKey ?? t.processDefinitionId}</code>
                    {t.due && (
                      <span className={overdue ? 'due overdue' : 'due'}>
                        {overdue ? 'Te laat — ' : 'Deadline '}
                        {new Date(t.due).toLocaleDateString('nl-NL')}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Detail pane (column 3) */}
      <section className="v2-taken-detail" aria-label="Taakdetails">
        {!selected ? (
          <div className="v2-taken-empty">
            <p>Selecteer een taak om de details te bekijken.</p>
          </div>
        ) : (
          <article>
            <header>
              <p className="v2-taken-eyebrow">
                {selected.processDefinitionKey ?? selected.processDefinitionId}
              </p>
              <h2>{selected.name}</h2>
              {selected.description && <p className="v2-taken-desc">{selected.description}</p>}
            </header>

            {actionMessage && (
              <div className={`v2-taken-msg v2-taken-msg-${actionMessage.type}`}>
                {actionMessage.text}
              </div>
            )}

            <dl className="v2-taken-meta">
              <div>
                <dt>Aangemaakt</dt>
                <dd>{new Date(selected.created).toLocaleString('nl-NL')}</dd>
              </div>
              {selected.due && (
                <div>
                  <dt>Deadline</dt>
                  <dd
                    className={
                      new Date(selected.due).getTime() < Date.now() ? 'v2-taken-overdue' : ''
                    }
                  >
                    {new Date(selected.due).toLocaleString('nl-NL')}
                  </dd>
                </div>
              )}
              <div>
                <dt>Status</dt>
                <dd>{selected.assignee ? 'Geclaimd' : 'Openstaand'}</dd>
              </div>
              <div>
                <dt>Taak ID</dt>
                <dd className="v2-taken-mono">{selected.id}</dd>
              </div>
            </dl>

            <section className="v2-taken-section">
              <h3>Procesgegevens</h3>
              <ProcessVarsSection variables={taskVariables} loading={detailLoading} />
            </section>

            <section className="v2-taken-section">
              <h3>Processtappen</h3>
              {detailLoading ? (
                <p className="v2-taken-state">Laden…</p>
              ) : activity && activity.length > 0 ? (
                <ol className="v2-taken-steps">
                  {activity.map((a) => {
                    const running = !a.endTime;
                    const automated = AUTOMATED_TYPES.has(a.activityType);
                    return (
                      <li
                        key={a.id}
                        className={[
                          'v2-taken-step',
                          running ? 'running' : '',
                          automated ? 'automated' : '',
                          a.canceled ? 'canceled' : '',
                        ].join(' ')}
                      >
                        <div className="v2-taken-step-row">
                          <span className="v2-taken-step-name">
                            {a.activityName ?? a.activityId}
                          </span>
                          <span className="v2-taken-step-type">
                            {activityTypeLabel(a.activityType)}
                          </span>
                        </div>
                        <div className="v2-taken-step-meta">
                          <span>{new Date(a.startTime).toLocaleString('nl-NL')}</span>
                          {running ? (
                            <span className="v2-taken-step-status running">Loopt nog</span>
                          ) : a.canceled ? (
                            <span className="v2-taken-step-status canceled">Afgebroken</span>
                          ) : (
                            <span className="v2-taken-step-status done">Afgerond</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="v2-taken-state">Geen processtappen.</p>
              )}
            </section>

            <section className="v2-taken-section">
              <h3>Acties</h3>
              {!selected.assignee ? (
                <button type="button" className="v2-btn" onClick={handleClaim} disabled={claiming}>
                  {claiming ? 'Claimen…' : 'Taak claimen'}
                </button>
              ) : (
                <TaskFormViewer
                  taskId={selected.id}
                  variables={taskVariables}
                  onCompleted={() => {
                    setActionMessage({ type: 'success', text: 'Taak voltooid.' });
                    setSelectedId(null);
                    setTaskVariables(null);
                    setActivity(null);
                    loadTasks();
                  }}
                  onError={() => setActionMessage({ type: 'error', text: 'Opslaan mislukt.' })}
                />
              )}
            </section>
          </article>
        )}
      </section>
    </div>
  );
}
