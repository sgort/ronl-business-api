import { useEffect, useState } from 'react';
import type {
  ActivityHistoryItem,
  ApiResponse,
  PhaseSwimlaneModel,
  ProcessLineage,
} from '@ronl/shared';
import { businessApi } from '../../services/api';
import { buildProcessContext, type ProcessContext } from './processContext';

/** How far up a call chain to walk; the Awb processes nest one level. */
const MAX_DEPTH = 5;

interface ContextTask {
  id: string;
  processInstanceId: string;
  taskDefinitionKey: string;
}

async function unwrap<T>(request: Promise<ApiResponse<T>>): Promise<T> {
  const res = await request;
  if (!res.success || res.data === undefined) throw new Error('request failed');
  return res.data;
}

/** The value, or undefined when the request fails: for the parts the view can do without. */
async function optional<T>(request: () => Promise<ApiResponse<T>>): Promise<T | undefined> {
  try {
    return await unwrap(request());
  } catch {
    return undefined;
  }
}

/**
 * Fetch what the procesweergave needs for one task. Only the task's OWN
 * lineage and history are required -- they reject the whole load. Anything
 * above or beside it (a caller refused by the tenant check, a finished child,
 * a model) is optional, so a partial chain still renders.
 */
export async function loadProcessContext(task: ContextTask): Promise<ProcessContext> {
  const own = await unwrap(businessApi.process.lineage(task.processInstanceId));

  const lineages: ProcessLineage[] = [own];
  for (let cur = own; cur.superProcessInstanceId && lineages.length <= MAX_DEPTH;) {
    const up = await optional(() => businessApi.process.lineage(cur.superProcessInstanceId!));
    if (!up) break;
    lineages.push(up);
    cur = up;
  }

  const histories: Record<string, ActivityHistoryItem[]> = {
    [own.processInstanceId]: await unwrap(
      businessApi.process.activityHistory(own.processInstanceId)
    ),
  };
  await Promise.all(
    lineages.slice(1).map(async (l) => {
      const h = await optional(() => businessApi.process.activityHistory(l.processInstanceId));
      if (h) histories[l.processInstanceId] = h;
    })
  );

  // Children a call activity started that are not in the chain: for a task in
  // the parent, the subprocess that already ran.
  const inChain = new Set(lineages.map((l) => l.processInstanceId));
  const children = new Set(
    Object.values(histories)
      .flat()
      .map((e) => e.calledProcessInstanceId)
      .filter((id): id is string => !!id && !inChain.has(id))
  );
  await Promise.all(
    [...children].map(async (id) => {
      const h = await optional(() => businessApi.process.activityHistory(id));
      if (h) histories[id] = h;
    })
  );

  const keys = new Set<string>(lineages.map((l) => l.processDefinitionKey));
  for (const e of Object.values(histories).flat()) {
    if (e.processDefinitionKey) keys.add(e.processDefinitionKey);
  }
  const models: Record<string, PhaseSwimlaneModel> = {};
  await Promise.all(
    [...keys].map(async (key) => {
      const m = await optional(() => businessApi.process.swimlane(key));
      if (m) models[key] = m;
    })
  );

  // A subprocess the case has not reached yet appears in no history, only as
  // a call node's target -- load it too, so the overlay can open it.
  const called = new Set(
    Object.values(models)
      .flatMap((m) => m.nodes)
      .map((n) => n.calls)
      .filter((key): key is string => !!key && !(key in models))
  );
  await Promise.all(
    [...called].map(async (key) => {
      const m = await optional(() => businessApi.process.swimlane(key));
      if (m) models[key] = m;
    })
  );

  return buildProcessContext({ task, lineages, histories, models });
}

export interface TaskProcessContextState {
  data: ProcessContext | null;
  loading: boolean;
  error: boolean;
}

/**
 * The process context of the selected task, reloaded when the task changes.
 * A result for a task that is no longer selected is discarded, so a slow
 * earlier load can never overwrite the current one.
 */
export function useTaskProcessContext(task: ContextTask | null): TaskProcessContextState {
  // The result remembers which task it is for, so the render on which the
  // task changes -- before the effect has run -- already reports loading
  // instead of the previous task's data (or an idle state PR 3 would read as
  // "no lanes" and flash the flat list for).
  const [result, setResult] = useState<{
    forKey: string;
    data: ProcessContext | null;
    error: boolean;
  } | null>(null);
  const id = task?.id;
  const instanceId = task?.processInstanceId;
  const nodeId = task?.taskDefinitionKey;
  const key = id && instanceId && nodeId ? `${id}|${instanceId}|${nodeId}` : null;

  useEffect(() => {
    if (!key || !id || !instanceId || !nodeId) return;
    let alive = true;
    loadProcessContext({ id, processInstanceId: instanceId, taskDefinitionKey: nodeId })
      .then((data) => alive && setResult({ forKey: key, data, error: false }))
      .catch(() => alive && setResult({ forKey: key, data: null, error: true }));
    return () => {
      alive = false;
    };
  }, [key, id, instanceId, nodeId]);

  if (!key) return { data: null, loading: false, error: false };
  if (result?.forKey !== key) return { data: null, loading: true, error: false };
  return { data: result.data, loading: false, error: result.error };
}
