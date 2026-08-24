/**
 * What plato is allowed to show. Deny-by-default: a section added to the real
 * cockpit later cannot appear on a public site unless its id is added here.
 *
 * Dropped on purpose:
 *   IOU (iou-gebruiksscenario, iou-feedback, iou-actieve-zaken, iou-archief)
 *     — all four submit or fetch real cases, and three carry backend/auth
 *       references. Feedback posts to /public/feedback, which would work, but
 *       an open submit form is not wanted on a showcase.
 *   Hulpmiddelen (gereedschap-overzicht) — a caseworker tool index with no PA
 *     meaning.
 *
 * Both groups are also where the six ../CaseworkerDashboard/* imports live, so
 * dropping them is what lets DemoSectionRouter carry none.
 */
export const ALLOWED_SECTION_IDS: readonly string[] = [
  // Vandaag
  'vandaag',
  'sort-kompas',
  'sort-momentum',
  // Dossiers (data-driven: the id is a dossier id, not a static section)
  'dossiers',
  // Monitoring
  'agenda',
  'feiten',
  'politiek',
  'europa',
  'regionaal',
  'media',
  // Voortgang
  'voortgang',
  'kompas-log',
  'interventie-log',
  // Beheer — the nine curated sections
  'db-overzicht',
  'db-nieuw',
  'kompas-spec',
  'bronnen',
  'zoekcriteria',
  'curatie-spec',
  'notificaties',
  'profiel',
  'rollen',
];

/** Named so the palette test can assert their absence explicitly. */
export const DROPPED_SECTION_IDS: readonly string[] = [
  'iou-gebruiksscenario',
  'iou-feedback',
  'iou-actieve-zaken',
  'iou-archief',
  'gereedschap-overzicht',
];

export function isAllowedSection(id: string): boolean {
  return ALLOWED_SECTION_IDS.includes(id);
}
