import { useEffect, useState } from 'react';
import { businessApi } from '../../services/api';
import type { SignatureSpec } from '../../services/api';

export interface TaskSignature {
  /** No answer yet for this task: show neither the form nor the panel. */
  loading: boolean;
  /** The task's signing spec; null for no task, a failed fetch, or before it arrives. */
  spec: SignatureSpec | null;
}

/**
 * The ValidSign signing spec of a task: whether it must be signed, and the
 * state of its package. Every task view asks the same question through this
 * hook, so a process configures signing with `ronl:signatureRef` alone.
 *
 * `loading` until this task's answer is in, so a view never shows the
 * fallback form for a task that turns out to need a signature: approving it
 * there would bypass the signature. A failed fetch ends loading with no
 * spec, which means "use the form", never a stuck panel. Keyed by task id,
 * so a slow answer for a task the user already left cannot show up on the
 * next.
 */
export function useTaskSignature(taskId: string | null): TaskSignature {
  const [settled, setSettled] = useState<{
    taskId: string;
    spec: SignatureSpec | null;
  } | null>(null);

  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    // Promise.resolve().then so a synchronous throw from the API layer is a
    // rejection like any other.
    Promise.resolve()
      .then(() => businessApi.validsign.taskSpec(taskId))
      .then(
        (res) => (res.success && res.data ? res.data : null),
        () => null
      )
      .then((spec) => {
        if (alive) setSettled({ taskId, spec });
      });
    return () => {
      alive = false;
    };
  }, [taskId]);

  if (!taskId) return { loading: false, spec: null };
  if (!settled || settled.taskId !== taskId) return { loading: true, spec: null };
  return { loading: false, spec: settled.spec };
}
