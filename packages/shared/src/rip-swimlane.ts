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
  /** Resolved document label from `ronl:documentRef`, when the task carries one. */
  doc?: string;
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

/**
 * Curated Dutch labels for document refs that have one. The BPMN carries 77
 * `ronl:documentRef` slugs across the twelve phases; only a handful have an
 * agreed display name. Everything else is humanised from the slug rather than
 * invented here — a wrong Dutch label is worse than a plain one.
 */
const DOC_LABELS: Record<string, string> = {
  'rip-intake-report': 'Intake-verslag',
  'rip-psu-report': 'PSU-verslag',
  'rip-pdp': 'Uitgangspunten VO-fase',
};

export function docLabel(slug: string): string {
  const curated = DOC_LABELS[slug];
  if (curated) return curated;
  const words = slug.replace(/^rip-/, '').replace(/-/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
