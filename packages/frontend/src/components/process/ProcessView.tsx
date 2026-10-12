import { useMemo, type ReactNode, type Ref } from 'react';
import type { PhaseSwimlaneModel, SwimNode } from '@ronl/shared';
import PhaseSwimlane from './PhaseSwimlane';
import { myLaneKeys } from './laneSteps';
import { legendEntries, nodeMarks, type ProcessTask, type Viewer } from './processMarks';
import type { StatusKey } from './status';
import { useViewer } from './useViewer';
import './process-view.css';

export interface ProcessViewTitle {
  name: string;
  code: string;
  /** Adds "(live)" to the meta line. */
  live?: boolean;
  /** Rendered before the name inside the heading (the overlay's main › subprocess buttons). */
  crumbs?: ReactNode;
}

const NO_TASKS: readonly ProcessTask[] = [];

/**
 * The one way a dashboard shows a BPMN process: an optional stepper, the
 * title bar, a legend and the swimlane. A dashboard passes data; who is
 * looking comes from the token (useViewer), and the marks on open tasks, the
 * viewer's lanes and the legend are derived here, so a new dashboard gets the
 * whole rendering by using this component. Nothing outside components/process
 * may render PhaseSwimlane directly (process-view-guard.test.ts).
 */
export default function ProcessView({
  model,
  statusById,
  tasks = NO_TASKS,
  title,
  stepper,
  focusNodeId,
  scrollToNodeId,
  onOpenCall,
  viewer: viewerOverride,
  titleRef,
}: {
  model: PhaseSwimlaneModel;
  statusById: Record<string, StatusKey>;
  tasks?: readonly ProcessTask[];
  title: ProcessViewTitle;
  stepper?: ReactNode;
  /** The task this view is about: outlined unless it is the viewer's own (that one has its tab). */
  focusNodeId?: string | null;
  /** Centre this node horizontally; defaults to focusNodeId. */
  scrollToNodeId?: string | null;
  onOpenCall?: (node: SwimNode) => void;
  viewer?: Viewer;
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  const tokenViewer = useViewer();
  const viewer = viewerOverride ?? tokenViewer;
  const marks = useMemo(() => nodeMarks(model, tasks, viewer), [model, tasks, viewer]);
  const myLanes = useMemo(() => myLaneKeys(model, viewer.roles), [model, viewer.roles]);
  const entries = legendEntries({ model, statusById, marks, myLanes, roles: viewer.roles });

  return (
    <div className="pv pbd">
      {stepper}
      <div className="pb-phase-titlebar">
        <h3 ref={titleRef} {...(titleRef ? { tabIndex: -1 } : {})}>
          {title.crumbs}
          {title.name} <span className="rcode">{title.code}</span>
        </h3>
        <span className="meta">
          Processtappen &amp; rollen — procesmodel{title.live ? ' (live)' : ''}
        </span>
      </div>
      <ul className="pv-legend" aria-label="Legenda">
        {entries.map((e) => (
          <li key={e.key} data-legend={e.key}>
            <i className={`sw ${e.key}`} aria-hidden="true" />
            {e.label}
          </li>
        ))}
      </ul>
      <PhaseSwimlane
        model={model}
        statusById={statusById}
        marks={marks}
        myLanes={myLanes}
        focusNodeId={focusNodeId}
        scrollToNodeId={scrollToNodeId}
        onOpenCall={onOpenCall}
      />
    </div>
  );
}
