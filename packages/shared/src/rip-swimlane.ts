/**
 * Swimlane vocabulary shared by the BPMN parser (backend) and the renderer
 * (frontend). Both sides use these exact types so a parser change cannot
 * drift from what the renderer expects.
 */

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
   * Code of the node's phase in the model's `phaseSet`: its own marker, or
   * inherited from the latest-phase forward predecessor. Absent throughout a
   * process that carries no markers.
   */
  phase?: string;
}

/** One step of a process's phase stepper. */
export interface ProcessPhase {
  /** What a node's marker carries: `ronl:awbPhase` for Awb, `ronl:phase` otherwise. */
  code: string;
  name: string;
  /** Under the name on the stepper, and before it in the caption: "Fase 4+5", "Archiefwet", "Fase 2". */
  codeLabel: string;
}

/**
 * The phases a process moves through, in order.
 *
 * - `awb`: the built-in Awb table, chosen by `ronl:awbPhase` markers.
 * - `bpmn`: declared by the process itself in `ronl:phases`, so a process
 *   modelled in LDE gets a stepper without a change here.
 */
export interface PhaseSet {
  scheme: 'awb' | 'bpmn';
  /** Prefix of a phase reference, "Awb-fase 6": the process's `ronl:phaseLabel`, "Fase" by default. */
  label: string;
  phases: ProcessPhase[];
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
  /** Present when at least one node carries a phase marker; drives the stepper. */
  phaseSet?: PhaseSet;
  lanes: SwimLane[];
  nodes: SwimNode[];
  edges: SwimEdge[];
}
