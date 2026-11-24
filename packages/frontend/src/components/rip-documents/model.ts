/**
 * Display rules for RIP documents (Infra-board, werkwijze A / B / B+): labels,
 * amounts, what a task still needs, and the Beheer WIP summary. Pure, so the
 * components stay thin. The server repeats every completion rule; these exist
 * so the person sees what is missing before pressing the button.
 */
import type {
  DocKind,
  DocStatus,
  InstanceDocument,
  KredietCheck,
} from '../../services/rip-documents.types';

export const KIND: Record<DocKind, { tag: string; long: string; cls: string }> = {
  A: { tag: 'A', long: 'Binnen · document gegenereerd', cls: 'a' },
  B: { tag: 'B', long: 'Buiten · gekoppeld', cls: 'b' },
  BP: { tag: 'B+', long: 'Buiten · met kerngetallen', cls: 'bp' },
};

export const STATUS: Record<DocStatus, { cls: string; text: string }> = {
  // Says what the IOU knows: the producing task is done. Whether the
  // document also reached eDOCS shows only in the eDOCS column.
  generated: { cls: 'ok', text: 'Opgemaakt' },
  pending: { cls: 'wait', text: 'Wordt opgemaakt bij akkoord' },
  linked: { cls: 'ok', text: 'Gekoppeld' },
  missing: { cls: 'miss', text: 'Ontbreekt — taak wacht' },
  later: { cls: 'nil', text: 'Nog niet aan de beurt' },
  'not-needed': { cls: 'nil', text: 'Niet nodig — criteria voldaan' },
};

/** Labels of the figures the models declare; anything else is shown by its key. */
const FIGURE_LABELS: Record<string, { label: string; unit: 'eur' | 'jaar' }> = {
  totaal: { label: 'Totaal projectraming (excl. btw)', unit: 'eur' },
  onvoorzien: { label: 'Waarvan onvoorzien', unit: 'eur' },
  prijspeil: { label: 'Prijspeil', unit: 'jaar' },
  bouwkosten: { label: 'Bouwkosten (excl. btw)', unit: 'eur' },
};

export function figureDef(slug: string, key: string): { label: string; unit: 'eur' | 'jaar' } {
  if (slug === 'rip-ssk-rekenmodel' && key === 'totaal') {
    return { label: 'Totaal SSK-raming (excl. btw)', unit: 'eur' };
  }
  return FIGURE_LABELS[key] ?? { label: key, unit: 'eur' };
}

/** Same names as the backend (rip-swimlane/linked-docs.ts figureVariable). */
const FIGURE_BASE: Record<string, string> = {
  'rip-projectraming': 'raming',
  'rip-projectraming-do': 'raming_do',
  'rip-ssk-rekenmodel': 'ssk',
};
export function figureVariable(slug: string, figure: string): string {
  const base = FIGURE_BASE[slug] ?? slug.replace(/^rip-/, '').replace(/-/g, '_');
  return `${base}_${figure}`;
}

/** Where prefilled figures come from, as the form names it. */
export const PREFILL_SOURCE: Record<string, string> = {
  'rip-projectraming-do': 'Projectraming VO, R2.3',
};

/** The projectkrediet the kredietcheck compares against. */
export const KREDIET_VARIABLE = 'beschikbaarProjectkrediet';
export const MIN_REASON_LENGTH = 4;

/** Optional documents and the form answer that makes them required. */
export const OPTIONAL_CONDITIONS: Record<
  string,
  { variable: string; equals: string; note: string }
> = {
  'rip-inkoopplan-vol': {
    variable: 'inkoopplanNodig',
    equals: 'ja',
    note: 'Alleen als er een inkoopplan wordt geschreven · map −63 Werken',
  },
};

export const euro = (n: number): string => `€ ${Math.round(n).toLocaleString('nl-NL')}`;

/**
 * A whole number from what a person typed: Dutch thousands separators and
 * spaces are ignored, a decimal comma or any other character makes it invalid.
 */
export function parseWhole(input: string | undefined): number | null {
  if (input === undefined) return null;
  const s = input.replace(/[\s.]/g, '');
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** Re-format an amount being typed with Dutch thousands separators. */
export function formatAmountInput(input: string): string {
  const n = parseWhole(input);
  return n === null ? input : n.toLocaleString('nl-NL');
}

export function kredietSuggestion(
  raming: number | null,
  krediet: number | null
): 'binnen' | 'buiten' | null {
  if (raming === null || krediet === null) return null;
  return raming <= krediet ? 'binnen' : 'buiten';
}

/** The documents a task has to link (B / B+), ignoring what is already done or not needed. */
export function linkedDocsOfTask(docs: InstanceDocument[], taskKey: string): InstanceDocument[] {
  return docs.filter((d) => d.taskKey === taskKey && d.kind !== 'A' && d.status !== 'not-needed');
}

/** Is an optional document required, given the answers on the form? */
export function optionalRequired(slug: string, formData: Record<string, unknown>): boolean {
  const cond = OPTIONAL_CONDITIONS[slug];
  return !!cond && formData[cond.variable] === cond.equals;
}

export interface TaskInputs {
  /** Slugs linked so far, including during this visit. */
  linked: Set<string>;
  /** Typed figures, slug -> figure -> text. */
  figures: Record<string, Record<string, string>>;
  /** Checklist state of a linked map, slug -> entries. */
  checklists: Record<string, Array<{ item: string; present: boolean }>>;
  /** Current values of the task's form. */
  formData: Record<string, unknown>;
  /** The kredietcheck of this task, when it has one. */
  kredietcheck?: {
    check: KredietCheck;
    /** Typed projectkrediet. */
    krediet: string;
    /** binnen / buiten as chosen, null while following the suggestion. */
    choice: 'binnen' | 'buiten' | null;
    reason: string;
  };
}

export interface TaskCompletionState {
  /** What is still needed, as the footer says it. Empty = complete. */
  missing: string[];
  /** Variables to send with the completion. */
  variables: Record<string, unknown>;
  /** The kredietcheck as it stands, for display. */
  krediet: {
    raming: number | null;
    krediet: number | null;
    voorstel: 'binnen' | 'buiten' | null;
    keuze: 'binnen' | 'buiten' | null;
    deviates: boolean;
  } | null;
}

/** What a task still needs and what its completion sends, from the inputs so far. */
export function taskCompletionState(
  docs: InstanceDocument[],
  inputs: TaskInputs
): TaskCompletionState {
  const missing: string[] = [];
  const variables: Record<string, unknown> = {};

  for (const d of docs) {
    if (d.optional && !optionalRequired(d.slug, inputs.formData)) continue;
    if (!inputs.linked.has(d.slug))
      missing.push(d.map ? `${d.label}: map koppelen` : `${d.label} koppelen`);
    if (d.map && inputs.linked.has(d.slug)) {
      for (const e of inputs.checklists[d.slug] ?? d.checklist ?? []) {
        if (!e.present) missing.push(`${e.item} in de map`);
      }
    }
    for (const fig of Object.keys(d.figures ?? {})) {
      const n = parseWhole(inputs.figures[d.slug]?.[fig]);
      if (n === null) missing.push(`${figureDef(d.slug, fig).label} invullen`);
      else variables[figureVariable(d.slug, fig)] = n;
    }
  }

  let krediet: TaskCompletionState['krediet'] = null;
  const kc = inputs.kredietcheck;
  if (kc) {
    const { check } = kc;
    const typedRaming = parseWhole(inputs.figures[check.slug]?.totaal);
    const raming = typedRaming ?? check.raming;
    const kredietValue = parseWhole(kc.krediet) ?? check.krediet;
    const voorstel = kredietSuggestion(raming, kredietValue);
    const keuze = kc.choice ?? voorstel;
    const deviates = !!voorstel && !!keuze && keuze !== voorstel;
    krediet = { raming, krediet: kredietValue, voorstel, keuze, deviates };

    if (kredietValue !== null) variables[KREDIET_VARIABLE] = kredietValue;
    if (!keuze) missing.push('antwoord op de kredietvraag');
    else variables[check.variable] = check.values[keuze];
    if (deviates) {
      if (kc.reason.trim().length < MIN_REASON_LENGTH)
        missing.push('reden voor afwijken van het voorstel');
      else variables[`${check.variable}_afwijking`] = kc.reason.trim();
    }
  }
  return { missing, variables, krediet };
}

/** Beheer › WIP: the eDOCS cell and, when documents hold the task up, the blockade. */
export function wipSummary(
  docs: InstanceDocument[],
  checks: KredietCheck[],
  openTaskKeys: Set<string>
): { edocs: { cls: 'miss' | 'ok'; text: string; title?: string } | null; blockade: string | null } {
  const linkedKinds = docs.filter((d) => d.kind !== 'A' && d.status !== 'not-needed');
  const missing = linkedKinds.filter((d) => d.status === 'missing' && !d.optional);
  const edocs =
    linkedKinds.length === 0
      ? null
      : missing.length > 0
        ? {
            cls: 'miss' as const,
            text: `${missing.length} ontbreekt`,
            title: missing.map((m) => m.label).join(', '),
          }
        : {
            cls: 'ok' as const,
            text: `${linkedKinds.filter((d) => d.status === 'linked').length}/${linkedKinds.length} gekoppeld`,
          };

  let blockade: string | null = null;
  if (missing.length > 0) blockade = `Wacht op koppeling ${missing[0].label}`;
  else {
    const kc = checks.find((c) => openTaskKeys.has(c.taskKey) && !c.answer);
    if (kc) {
      const v = kredietSuggestion(kc.raming, kc.krediet);
      if (v) blockade = `Kredietcheck: voorstel ${v} projectkrediet`;
    }
  }
  return { edocs, blockade };
}

/** "3 jun 2026" from what eDOCS sends ("2026-06-03 12:38:29 UTC"); the input when unreadable. */
export function shortDate(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s.replace(' UTC', 'Z').replace(' ', 'T'));
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The eDOCS refusals the backend answers in English for every API client,
 * worded for the Infra-board. Our own document routes already answer in Dutch.
 */
const EDOCS_TEXT: Record<string, string> = {
  EDOCS_USER_TOKEN_UNAVAILABLE:
    'eDOCS is alleen beschikbaar als u bent ingelogd met uw Flevoland-account.',
  EDOCS_REAUTH_REQUIRED: 'Log opnieuw in met uw Flevoland-account om eDOCS te gebruiken.',
  EDOCS_ACCESS_DENIED: 'eDOCS geeft dit account geen toegang.',
  EDOCS_ERROR: 'eDOCS is nu niet bereikbaar. Probeer het later opnieuw.',
};

/** Dutch text for a failed document call: a known eDOCS code, the problem detail, or the fallback. */
export function documentErrorText(
  body: unknown,
  fallback: string,
  detailOf: (body: unknown, fallback: string) => string
): string {
  const code =
    typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && EDOCS_TEXT[code]) return EDOCS_TEXT[code];
  return detailOf(body, fallback);
}
