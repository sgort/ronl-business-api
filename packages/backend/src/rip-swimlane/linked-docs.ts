/**
 * The B / B+ document convention on a BPMN user task (Infra-board documenten,
 * R2.1-R2.4). `ronl:documentRef` keeps meaning "generated from a template"
 * (werkwijze A). These four attributes describe a document the process does
 * NOT generate, but must know about:
 *
 *   ronl:linkedDocumentRef="<slug>:<format>[:optional][:map]"  comma-separated
 *   ronl:documentFigures="<slug>=<fig>,<fig>"                   semicolon-separated per slug
 *   ronl:documentChecklist="<slug>=<item>|<item>"               semicolon-separated per slug
 *   ronl:kredietCheck="<variable>:<slug>"
 *
 * Pure parsing only, shared by the swimlane parser and the document/completion
 * services, so the grammar lives in one place. Every parser is total: a
 * malformed entry is dropped rather than thrown, because a typo in one model
 * must not take down every view that reads it. What a dropped entry means for
 * completion is the caller's decision.
 */

export interface LinkedDocRef {
  slug: string;
  /** eDOCS format (template) number the document is made from. */
  format: string;
  /** Required only under a condition (the inkoopplan). */
  optional: boolean;
  /** The link points at an eDOCS folder, not a document. */
  map: boolean;
}

export interface KredietCheckSpec {
  /** The gateway variable the task answers, e.g. projectkredietDekking. */
  variable: string;
  /** The B+ document whose `totaal` figure drives the suggestion. */
  slug: string;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function parseLinkedDocumentRef(value: string | null | undefined): LinkedDocRef[] {
  if (!value) return [];
  const out: LinkedDocRef[] = [];
  for (const entry of value.split(',')) {
    const [slug, format, ...flags] = entry.split(':').map((p) => p.trim());
    if (!slug || !SLUG.test(slug) || !format) continue;
    out.push({
      slug,
      format,
      optional: flags.includes('optional'),
      map: flags.includes('map'),
    });
  }
  return out;
}

/** `<slug>=<a>,<b>` (several slugs separated by `;`) to slug -> keys. */
function parseSlugLists(value: string | null | undefined, sep: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!value) return out;
  for (const part of value.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const slug = part.slice(0, eq).trim();
    if (!SLUG.test(slug)) continue;
    const items = part
      .slice(eq + 1)
      .split(sep)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (items.length > 0) out[slug] = items;
  }
  return out;
}

export function parseDocumentFigures(value: string | null | undefined): Record<string, string[]> {
  return parseSlugLists(value, ',');
}

export function parseDocumentChecklist(value: string | null | undefined): Record<string, string[]> {
  return parseSlugLists(value, '|');
}

export function parseKredietCheck(value: string | null | undefined): KredietCheckSpec | null {
  if (!value) return null;
  const [variable, slug] = value.split(':').map((p) => p.trim());
  if (!variable || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable) || !slug || !SLUG.test(slug)) {
    return null;
  }
  return { variable, slug };
}

/**
 * Process-variable name of a figure: `<base>_<figure>`, where the base is
 * fixed per document (the brief's table) rather than derived, so the names
 * stay readable in Cockpit and in templates. A slug without an entry uses its
 * own name with hyphens turned into underscores.
 */
const FIGURE_BASE: Record<string, string> = {
  'rip-projectraming': 'raming',
  'rip-projectraming-do': 'raming_do',
  'rip-ssk-rekenmodel': 'ssk',
};

export function figureVariable(slug: string, figure: string): string {
  const base = FIGURE_BASE[slug] ?? slug.replace(/^rip-/, '').replace(/-/g, '_');
  return `${base}_${figure}`;
}

/** The link variable (JSON) and the plain eDOCS number templates bind to. */
export const linkedDocVariable = (slug: string): string => `linkedDoc_${slug}`;
export const linkedDocNumberVariable = (slug: string): string => `linkedDocNumber_${slug}`;

/**
 * XML attribute values read by regex arrive still entity-encoded (`&amp;`,
 * `&#246;`, `&#10;`). The swimlane parser gets them decoded from
 * fast-xml-parser; this brings the regex path to the same text.
 */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
