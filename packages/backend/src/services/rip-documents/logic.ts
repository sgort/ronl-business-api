/**
 * Pure rules for RIP documents (Infra-board, werkwijze A / B / B+): the status
 * of every document an instance declares, the kredietcheck suggestion, and
 * what is still missing before a task may complete. No I/O here; the service
 * gathers engine and eDOCS state and hands it in.
 */
import { docLabel } from '../../rip-swimlane/doc-label';
import type { TaskDocumentSpec } from '../../rip-swimlane/document-spec';
import {
  figureVariable,
  linkedDocNumberVariable,
  linkedDocVariable,
} from '../../rip-swimlane/linked-docs';

export type DocKind = 'A' | 'B' | 'BP';
export type DocStatus = 'generated' | 'pending' | 'linked' | 'missing' | 'later' | 'not-needed';
export type TaskState = 'done' | 'active' | 'not-reached';

/** What a link variable (`linkedDoc_<slug>`, a String holding JSON) records. */
export interface LinkRecord {
  documentId: string;
  documentNumber: string;
  name?: string;
  linkedAt: string;
  linkedBy: string;
  /** Set when the file was uploaded through the IOU rather than picked. */
  uploadedVia?: 'ronl';
  /** True when the uploaded file went into the workspace (flag on). */
  inWorkspace?: boolean;
  /** The link is to an eDOCS folder (a map), not a document. */
  map?: boolean;
}

export interface LiveEdocsInfo {
  version: string | null;
  modified: string | null;
}

export interface ChecklistEntry {
  item: string;
  present: boolean;
}

export interface InstanceDocument {
  slug: string;
  label: string;
  kind: DocKind;
  format: string | null;
  taskKey: string;
  taskName: string;
  candidateGroups: string[];
  optional: boolean;
  map: boolean;
  status: DocStatus;
  edocs: {
    documentId: string;
    documentNumber: string;
    /** The document's name in eDOCS, as recorded when it was linked or uploaded. */
    name?: string;
    version: string | null;
    modified: string | null;
    uploadedVia?: 'ronl';
    inWorkspace?: boolean;
  } | null;
  figures: Record<string, number | null> | null;
  /**
   * Suggested figures from an earlier phase, while this document has none of
   * its own (the DO raming starts from the VO raming). Shown in the form to
   * confirm or change; stored only when the task completes with them.
   */
  prefill: Record<string, number | null> | null;
  checklist: ChecklistEntry[] | null;
}

/** A B+ document whose figures start from another document's, recorded in an earlier phase. */
export const PREFILL_FROM: Record<string, string> = {
  'rip-projectraming-do': 'rip-projectraming',
};

/** The variables to read from earlier phases to prefill these specs. */
export function prefillVariableNames(specs: TaskDocumentSpec[]): string[] {
  const names = new Set<string>();
  for (const s of specs) {
    for (const ref of s.linked) {
      const source = PREFILL_FROM[ref.slug];
      if (source) for (const fig of ref.figures) names.add(figureVariable(source, fig));
    }
    if (s.kredietCheck) names.add(KREDIET_VARIABLE);
  }
  return [...names];
}

/** Prefill for one document: the source's figures, while it has none of its own. */
function readPrefill(
  slug: string,
  figures: string[],
  vars: Record<string, unknown>,
  projectVars: Record<string, unknown>
): Record<string, number | null> | null {
  const source = PREFILL_FROM[slug];
  if (!source || figures.length === 0) return null;
  if (figures.some((f) => toWholeNumber(vars[figureVariable(slug, f)]) !== null)) return null;
  const values = Object.fromEntries(
    figures.map((f) => [f, toWholeNumber(projectVars[figureVariable(source, f)])])
  );
  return Object.values(values).some((v) => v !== null) ? values : null;
}

/**
 * Optional linked documents are required only under a condition on the
 * instance. One today: the full inkoopplan (format 2640968) when the A form
 * on Bepalen inkoopstrategie answers that an inkoopplan is written.
 */
export const OPTIONAL_CONDITIONS: Record<string, { variable: string; equals: string }> = {
  'rip-inkoopplan-vol': { variable: 'inkoopplanNodig', equals: 'ja' },
};

/** The two answers of each krediet gateway variable, keyed by meaning. */
export const KREDIET_VALUES: Record<string, { binnen: string; buiten: string }> = {
  projectkredietDekking: { binnen: 'binnen', buiten: 'buiten' },
  ramingBinnenKrediet: { binnen: 'ja', buiten: 'nee' },
};
const kredietValues = (variable: string) =>
  KREDIET_VALUES[variable] ?? { binnen: 'binnen', buiten: 'buiten' };

/** The projectkrediet the suggestion compares against (decision 23 Nov). */
export const KREDIET_VARIABLE = 'beschikbaarProjectkrediet';
export const MIN_REASON_LENGTH = 4;

export function parseLinkRecord(value: unknown): LinkRecord | null {
  if (value === null || value === undefined || value === '') return null;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const r = parsed as Record<string, unknown>;
  if (typeof r.documentId !== 'string' || r.documentId === '') return null;
  return {
    documentId: r.documentId,
    documentNumber: typeof r.documentNumber === 'string' ? r.documentNumber : r.documentId,
    ...(typeof r.name === 'string' ? { name: r.name } : {}),
    linkedAt: typeof r.linkedAt === 'string' ? r.linkedAt : '',
    linkedBy: typeof r.linkedBy === 'string' ? r.linkedBy : '',
    ...(r.uploadedVia === 'ronl' ? { uploadedVia: 'ronl' as const } : {}),
    ...(typeof r.inWorkspace === 'boolean' ? { inWorkspace: r.inWorkspace } : {}),
    ...(r.map === true ? { map: true } : {}),
  };
}

/** The variables a link writes: the JSON record and the bare number templates bind. */
export function linkVariables(
  slug: string,
  record: LinkRecord
): Record<string, { value: string; type: 'String' }> {
  return {
    [linkedDocVariable(slug)]: { value: JSON.stringify(record), type: 'String' },
    [linkedDocNumberVariable(slug)]: { value: record.documentNumber, type: 'String' },
  };
}

/**
 * Where an instance stands on one user task, from its activity history. A
 * task that ran and now runs again (a loop back) counts as active.
 */
export function taskState(
  activities: Array<{ activityId: string; endTime: string | null; canceled?: boolean }>,
  taskKey: string
): TaskState {
  const runs = activities.filter((a) => a.activityId === taskKey);
  if (runs.some((a) => a.endTime === null)) return 'active';
  if (runs.some((a) => a.endTime !== null && !a.canceled)) return 'done';
  return 'not-reached';
}

/** A whole number, from a number or a plain numeric string; null otherwise. */
export function toWholeNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** Number figures of a B+ document as read from the instance, null where absent. */
function readFigures(
  slug: string,
  figures: string[],
  vars: Record<string, unknown>
): Record<string, number | null> | null {
  if (figures.length === 0) return null;
  return Object.fromEntries(figures.map((f) => [f, toWholeNumber(vars[figureVariable(slug, f)])]));
}

/** Is an optional document required, given the instance's variables? */
export function optionalRequired(slug: string, vars: Record<string, unknown>): boolean {
  const cond = OPTIONAL_CONDITIONS[slug];
  return !!cond && vars[cond.variable] === cond.equals;
}

/**
 * Every document an instance's model declares, one entry per slug. A slug on
 * two tasks (the raming on both MBVI routes) is reported against the task the
 * instance actually took, falling back to the first in model order.
 */
export function buildInstanceDocuments(input: {
  specs: TaskDocumentSpec[];
  vars: Record<string, unknown>;
  activities: Array<{ activityId: string; endTime: string | null; canceled?: boolean }>;
  live: Map<string, LiveEdocsInfo | null>;
  checklists: Map<string, ChecklistEntry[]>;
  /** Values earlier phases of the project recorded (getProjectVariables). */
  projectVars?: Record<string, unknown>;
}): InstanceDocument[] {
  const { specs, vars, activities, live, checklists } = input;
  const projectVars = input.projectVars ?? {};
  const out = new Map<string, InstanceDocument>();
  const rank: Record<TaskState, number> = { active: 2, done: 1, 'not-reached': 0 };
  const stateOf = new Map(specs.map((s) => [s.taskKey, taskState(activities, s.taskKey)]));
  const rankOf = (taskKey: string) => rank[stateOf.get(taskKey) ?? 'not-reached'];

  const put = (doc: InstanceDocument) => {
    const prev = out.get(doc.slug);
    if (!prev || rankOf(doc.taskKey) > rankOf(prev.taskKey)) {
      out.set(doc.slug, doc);
    }
  };

  for (const spec of specs) {
    const state = taskState(activities, spec.taskKey);
    const base = {
      taskKey: spec.taskKey,
      taskName: spec.taskName,
      candidateGroups: spec.candidateGroups,
    };

    for (const slug of spec.generated) {
      put({
        ...base,
        slug,
        label: docLabel(slug),
        kind: 'A',
        format: null,
        optional: false,
        map: false,
        status: state === 'done' ? 'generated' : state === 'active' ? 'pending' : 'later',
        edocs: null,
        figures: null,
        prefill: null,
        checklist: null,
      });
    }

    for (const ref of spec.linked) {
      const link = parseLinkRecord(vars[linkedDocVariable(ref.slug)]);
      let status: DocStatus;
      if (link) status = 'linked';
      else if (state === 'not-reached') status = 'later';
      else if (ref.optional && state === 'done' && !optionalRequired(ref.slug, vars)) {
        status = 'not-needed';
      } else status = 'missing';

      const info = link ? live.get(ref.slug) : null;
      put({
        ...base,
        slug: ref.slug,
        label: docLabel(ref.slug),
        kind: ref.figures.length > 0 ? 'BP' : 'B',
        format: ref.format,
        optional: ref.optional,
        map: ref.map,
        status,
        edocs: link
          ? {
              documentId: link.documentId,
              documentNumber: link.documentNumber,
              ...(link.name ? { name: link.name } : {}),
              version: info?.version ?? null,
              modified: info?.modified ?? null,
              ...(link.uploadedVia ? { uploadedVia: link.uploadedVia } : {}),
              ...(link.inWorkspace !== undefined ? { inWorkspace: link.inWorkspace } : {}),
            }
          : null,
        figures: readFigures(ref.slug, ref.figures, vars),
        prefill: readPrefill(ref.slug, ref.figures, vars, projectVars),
        checklist: ref.map
          ? (checklists.get(ref.slug) ?? ref.checklist.map((item) => ({ item, present: false })))
          : null,
      });
    }
  }
  return [...out.values()];
}

/**
 * Which way the IOU suggests the krediet question goes: binnen when the raming
 * total is at most the projectkrediet. No suggestion without both numbers --
 * then the person picks freely.
 */
export function kredietSuggestion(
  raming: number | null,
  krediet: number | null
): 'binnen' | 'buiten' | null {
  if (raming === null || krediet === null) return null;
  return raming <= krediet ? 'binnen' : 'buiten';
}

export interface KredietCheckState {
  variable: string;
  slug: string;
  taskKey: string;
  taskName: string;
  raming: number | null;
  krediet: number | null;
  /**
   * The projectkrediet an earlier phase recorded, while this instance has
   * none: prefilled in the form to confirm or change.
   */
  kredietPrefill: number | null;
  /** The suggestion in the variable's own values (binnen/buiten or ja/nee). */
  voorstel: string | null;
  /** The confirmed answer, once given. */
  answer: string | null;
  afwijking: string | null;
  values: { binnen: string; buiten: string };
}

/** The kredietcheck of every task that declares one, as the instance stands. */
export function buildKredietChecks(
  specs: TaskDocumentSpec[],
  vars: Record<string, unknown>,
  projectVars: Record<string, unknown> = {}
): KredietCheckState[] {
  const out: KredietCheckState[] = [];
  for (const s of specs) {
    if (!s.kredietCheck) continue;
    const { variable, slug } = s.kredietCheck;
    const values = kredietValues(variable);
    const raming = toWholeNumber(vars[figureVariable(slug, 'totaal')]);
    const krediet = toWholeNumber(vars[KREDIET_VARIABLE]);
    const suggestion = kredietSuggestion(raming, krediet);
    const answer = typeof vars[variable] === 'string' ? (vars[variable] as string) : null;
    const afw = vars[`${variable}_afwijking`];
    out.push({
      variable,
      slug,
      taskKey: s.taskKey,
      taskName: s.taskName,
      raming,
      krediet,
      kredietPrefill: krediet === null ? toWholeNumber(projectVars[KREDIET_VARIABLE]) : null,
      voorstel: suggestion ? values[suggestion] : null,
      answer,
      afwijking: typeof afw === 'string' && afw !== '' ? afw : null,
      values,
    });
  }
  return out;
}

export interface MissingItem {
  slug: string;
  what: 'document' | 'figure' | 'checklist' | 'reason' | 'answer';
  label: string;
}

export interface CompletionCheck {
  missing: MissingItem[];
  /**
   * Variables the server sets on completion regardless of what was sent:
   * figures and the krediet as Long, and the recomputed suggestion.
   */
  variables: Record<string, { value: unknown; type: string }>;
}

/**
 * What a task still lacks before it may complete. `submitted` wins over the
 * instance's variables for anything the completion itself sends (figures, the
 * kredietcheck answer, the inkoopplan choice); links are only ever on the
 * instance, written by the link route.
 */
export function checkCompletion(input: {
  spec: TaskDocumentSpec | null;
  submitted: Record<string, unknown>;
  instanceVars: Record<string, unknown>;
  checklists: Map<string, ChecklistEntry[]>;
}): CompletionCheck {
  const { spec, submitted, instanceVars, checklists } = input;
  const missing: MissingItem[] = [];
  const variables: CompletionCheck['variables'] = {};
  if (!spec) return { missing, variables };
  const merged = { ...instanceVars, ...submitted };
  const has = (name: string) => Object.prototype.hasOwnProperty.call(submitted, name);

  for (const ref of spec.linked) {
    const label = docLabel(ref.slug);
    if (ref.optional && !optionalRequired(ref.slug, merged)) continue;
    if (!parseLinkRecord(instanceVars[linkedDocVariable(ref.slug)])) {
      missing.push({ slug: ref.slug, what: 'document', label });
    }
    for (const fig of ref.figures) {
      const name = figureVariable(ref.slug, fig);
      const n = toWholeNumber(merged[name]);
      if (n === null) missing.push({ slug: ref.slug, what: 'figure', label: `${label}: ${fig}` });
      else if (has(name)) variables[name] = { value: n, type: 'Long' };
    }
    if (ref.map) {
      const entries =
        checklists.get(ref.slug) ?? ref.checklist.map((item) => ({ item, present: false }));
      for (const e of entries.filter((x) => !x.present)) {
        missing.push({ slug: ref.slug, what: 'checklist', label: `${label}: ${e.item}` });
      }
    }
  }

  if (spec.kredietCheck) {
    const { variable, slug } = spec.kredietCheck;
    const values = kredietValues(variable);
    const label = `Kredietcheck ${docLabel(slug)}`;
    const raming = toWholeNumber(merged[figureVariable(slug, 'totaal')]);
    const krediet = toWholeNumber(merged[KREDIET_VARIABLE]);
    if (krediet !== null && has(KREDIET_VARIABLE)) {
      variables[KREDIET_VARIABLE] = { value: krediet, type: 'Long' };
    }
    const suggestion = kredietSuggestion(raming, krediet);
    const voorstel = suggestion ? values[suggestion] : null;
    const answer = merged[variable];
    if (answer !== values.binnen && answer !== values.buiten) {
      missing.push({ slug, what: 'answer', label });
    } else if (voorstel !== null && answer !== voorstel) {
      const reason = merged[`${variable}_afwijking`];
      if (typeof reason !== 'string' || reason.trim().length < MIN_REASON_LENGTH) {
        missing.push({ slug, what: 'reason', label });
      }
    }
    // Recomputed here, never taken from the request.
    variables[`${variable}_voorstel`] = { value: voorstel ?? '', type: 'String' };
  }
  return { missing, variables };
}
