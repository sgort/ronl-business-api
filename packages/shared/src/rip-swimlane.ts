/**
 * Swimlane vocabulary shared by the BPMN parser (backend) and the renderer
 * (frontend). Both sides use these exact types so a parser change cannot
 * drift from what the renderer expects.
 */

export type NodeKind = 'start' | 'end' | 'task' | 'service' | 'gateway' | 'parallel';

export interface SwimLane {
  key: string;
  label: string;
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
  lanes: SwimLane[];
  nodes: SwimNode[];
  edges: SwimEdge[];
}
