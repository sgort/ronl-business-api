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
