/**
 * Curated Dutch labels for document refs that have one, for every process
 * view (the Infra-board and the caseworker procesweergave). The RIP BPMN carries 77
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
  example_treefelling_beschikking: 'Beschikking kapvergunning',
  // Infra-board documenten (R2.1-R2.4): the names in the RIP-team's overview.
  'rip-psu-presentatie': 'PSU-presentatie',
  'rip-ontwerptoelichting': 'Ontwerptoelichting',
  'rip-bevindingenformulier': 'Bevindingenformulier',
  'rip-hoeveelheidsbepaling': 'Hoeveelheidsbepaling',
  'rip-projectraming': 'Projectraming VO',
  'rip-ssk-rekenmodel': 'SSK-rekenmodel Provincie Flevoland UAV',
  'rip-inkoopplan': 'Inkoopplan reguliere projecten',
  'rip-inkoopplan-vol': 'Inkoopplan (format 2640968)',
  'rip-memo-projectkrediet': 'Memo projectkrediet',
  'rip-projectraming-do': 'Projectraming DO',
  'rip-ils-flevoland': 'ILS Flevoland',
  'rip-verzamelmap-vg': 'Verzamelmap documenten V&G',
};

export function docLabel(slug: string): string {
  const curated = DOC_LABELS[slug];
  if (curated) return curated;
  const words = slug.replace(/^rip-/, '').replace(/[-_]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
