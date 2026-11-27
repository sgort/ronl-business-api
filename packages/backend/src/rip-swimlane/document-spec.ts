import {
  decodeXmlEntities,
  parseDocumentChecklist,
  parseDocumentFigures,
  parseKredietCheck,
  parseLinkedDocumentRef,
  type KredietCheckSpec,
  type LinkedDocRef,
} from './linked-docs';

/**
 * Everything one user task declares about documents: what it generates
 * (ronl:documentRef, werkwijze A) and what it needs linked (B / B+ / map).
 */
export interface TaskDocumentSpec {
  taskKey: string;
  taskName: string;
  candidateGroups: string[];
  /** Generated documents (template slugs). */
  generated: string[];
  linked: Array<
    LinkedDocRef & {
      /** Figure keys for a B+ document; empty for B. */
      figures: string[];
      /** Required item names for a map; empty otherwise. */
      checklist: string[];
    }
  >;
  kredietCheck: KredietCheckSpec | null;
}

function attrOf(tag: string, name: string): string | null {
  // `name` is one of the literals below, never input.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXmlEntities(m[1]) : null;
}

const list = (v: string | null): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/**
 * Reads the document spec of every user task in a BPMN, in document order.
 * Only tasks that declare at least one document are returned.
 *
 * Regex over the start tags rather than a full parse: the attributes needed
 * all sit on the `<bpmn:userTask>` start tag, the same reach operaton.service
 * already relies on for ronl:documentRef, and this runs on every task
 * completion, where a full XML parse of a 40-task model would be waste.
 */
export function readDocumentSpecs(bpmnXml: string): TaskDocumentSpec[] {
  const out: TaskDocumentSpec[] = [];
  for (const m of bpmnXml.matchAll(/<bpmn:userTask\b[^>]*>/g)) {
    const tag = m[0];
    const taskKey = attrOf(tag, 'id');
    if (!taskKey) continue;
    const linkedRefs = parseLinkedDocumentRef(attrOf(tag, 'ronl:linkedDocumentRef'));
    const figures = parseDocumentFigures(attrOf(tag, 'ronl:documentFigures'));
    const checklist = parseDocumentChecklist(attrOf(tag, 'ronl:documentChecklist'));
    const generated = list(attrOf(tag, 'ronl:documentRef'));
    const kredietCheck = parseKredietCheck(attrOf(tag, 'ronl:kredietCheck'));
    if (generated.length === 0 && linkedRefs.length === 0 && !kredietCheck) continue;
    out.push({
      taskKey,
      taskName: (attrOf(tag, 'name') ?? taskKey).replace(/\s+/g, ' ').trim(),
      candidateGroups: list(attrOf(tag, 'camunda:candidateGroups')),
      generated,
      linked: linkedRefs.map((r) => ({
        ...r,
        figures: figures[r.slug] ?? [],
        checklist: r.map ? (checklist[r.slug] ?? []) : [],
      })),
      kredietCheck,
    });
  }
  return out;
}

/** The spec of one task, or null when it declares no documents. */
export function readTaskDocumentSpec(bpmnXml: string, taskKey: string): TaskDocumentSpec | null {
  return readDocumentSpecs(bpmnXml).find((s) => s.taskKey === taskKey) ?? null;
}
