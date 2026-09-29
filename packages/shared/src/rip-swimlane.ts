/**
 * Swimlane vocabulary shared by the BPMN parser (backend) and the renderer
 * (frontend). Both sides use these exact types so a parser change cannot
 * drift from what the renderer expects.
 */

import type { AwbPhaseCode } from './awb-phases';

export type NodeKind =
  | 'start'
  | 'end'
  | 'task'
  | 'service'
  | 'gateway'
  | 'parallel'
  /** scriptTask: runs in the engine, no human involved. */
  | 'script'
  /** businessRuleTask: evaluates a DMN decision (see SwimNode.dmn). */
  | 'rule'
  /** callActivity: starts another process (see SwimNode.calls). */
  | 'call';

export interface SwimLane {
  key: string;
  label: string;
  /**
   * Literal candidateGroups of the user tasks in this lane, unique and
   * sorted. Absent when the lane has none.
   */
  candidateGroups?: string[];
}

export interface SwimNode {
  id: string;
  kind: NodeKind;
  col: number;
  row: number;
  label: string;
  /**
   * Resolved document labels from `ronl:documentRef`, when the task carries
   * any. The attribute holds a comma-separated list because a task can produce
   * several deliverables — R2.2's "Opstellen concept VO" yields both an
   * Ontwerptoelichting and an Objectenboom.
   */
  docs?: string[];
  /** BPMN flowNode id — maps live activity history onto the node. */
  bpmnId: string;
  /** decisionRef of a `rule` node. */
  dmn?: string;
  /** calledElement (process key) of a `call` node. */
  calls?: string;
  /** `camunda:formRef` of the node, when it has one. */
  formRef?: string;
  /**
   * Explicit `ronl:awbPhase`, or inherited from the latest-phase forward
   * predecessor. Absent throughout a process that carries no markers.
   */
  awbPhase?: AwbPhaseCode;
}

export interface SwimEdge {
  from: string;
  to: string;
  label?: string;
  /** Target resolves to an earlier column: a rework loop. */
  back?: boolean;
}

export interface PhaseSwimlaneModel {
  phaseCode: string;
  /** The `bpmn:process` id. */
  processKey?: string;
  /** The `bpmn:process` name. */
  processName?: string;
  lanes: SwimLane[];
  nodes: SwimNode[];
  edges: SwimEdge[];
}
