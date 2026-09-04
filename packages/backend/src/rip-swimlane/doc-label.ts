/**
 * Curated Dutch labels for document refs that have one. The BPMN carries 77
 * `ronl:documentRef` slugs across the twelve phases; only a handful have an
 * agreed display name. Everything else is humanised from the slug rather than
 * invented here — a wrong Dutch label is worse than a plain one.
 *
 * Deliberately a separate table from `externalTaskWorker.service.ts`'s
 * `templateIdToLabel`, which maps these same three slugs ('rip-intake-report',
 * 'rip-psu-report', 'rip-pdp') to English: that one names the rendered eDOCS
 * document itself (folding it in here would change live eDOCS document
 * names), while this one drives on-screen labels for the RIP UI. Two maps
 * keying the same slugs to different values on purpose — if you're
 * reconciling them, don't.
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
