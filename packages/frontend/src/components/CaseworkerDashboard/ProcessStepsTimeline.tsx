import { useEffect, useState } from 'react';
import type { ActivityHistoryItem } from '@ronl/shared';
import { businessApi } from '../../services/api';
import { activityTypeLabel, AUTOMATED_TYPES } from './processSteps';

interface Props {
  instanceId: string;
}

/**
 * Self-fetching activity-history timeline (Tailwind-styled) for views outside
 * the V2 design system, e.g. the RIP Fase 1 WIP viewer. Shows what the engine
 * executed — including the automated steps a caseworker never sees in the inbox.
 */
export default function ProcessStepsTimeline({ instanceId }: Props) {
  const [steps, setSteps] = useState<ActivityHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    businessApi.process
      .activityHistory(instanceId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) setSteps(res.data);
        else setError(true);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  if (loading) {
    return <div className="text-sm text-gray-400">Processtappen laden…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-500">Processtappen konden niet worden geladen.</div>;
  }
  if (!steps || steps.length === 0) {
    return <div className="text-sm text-gray-400">Geen processtappen.</div>;
  }

  return (
    <ol className="border-l-2 border-gray-200 ml-1">
      {steps.map((a) => {
        const running = !a.endTime;
        const automated = AUTOMATED_TYPES.has(a.activityType);
        const dotColor = running
          ? 'bg-pink-600'
          : a.canceled
            ? 'bg-gray-300'
            : automated
              ? 'bg-gray-300'
              : 'bg-gray-500';
        return (
          <li key={a.id} className="relative pl-4 py-1.5">
            <span
              className={`absolute -left-[7px] top-3 w-2.5 h-2.5 rounded-full border-2 border-white ${dotColor}`}
            />
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`text-sm whitespace-pre-line ${automated ? 'text-gray-500' : 'text-gray-800'}`}
              >
                {a.activityName ?? a.activityId}
              </span>
              <span className="shrink-0 text-[11px] uppercase tracking-wide text-gray-400">
                {activityTypeLabel(a.activityType)}
              </span>
            </div>
            <div className="flex gap-3 mt-0.5 text-[11px] text-gray-400">
              <span>{new Date(a.startTime).toLocaleString('nl-NL')}</span>
              {running ? (
                <span className="text-pink-600 font-semibold">Loopt nog</span>
              ) : a.canceled ? (
                <span className="text-gray-400">Afgebroken</span>
              ) : (
                <span>Afgerond</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
