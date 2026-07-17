/**
 * Flevoland gazetteer — shared between media-aggregator/enrich.ts (region tagging)
 * and pa-monitoring/rules.ts (geographic relevance scoring). Single source of truth;
 * kept as two literal shapes rather than deriving one from the other because
 * FLEVOLAND_TERMS uses short recognizable forms (e.g. 'zuiderzeeland', not
 * 'waterschap zuiderzeeland') that directly affect scoring — an automatic derivation
 * could silently change which articles match.
 */

/** Canonical municipality → alias town/village names that imply it. Used for region tagging. */
export const FLEVOLAND_MUNICIPALITY_ALIASES: Record<string, string[]> = {
  Almere: ['almere', 'almere-buiten', 'almere buiten', 'almere-haven', 'almere haven'],
  Lelystad: ['lelystad', 'lelystad airport'],
  Dronten: ['dronten', 'swifterbant', 'biddinghuizen'],
  Noordoostpolder: [
    'noordoostpolder',
    'emmeloord',
    'nagele',
    'ens',
    'marknesse',
    'luttelgeest',
    'kraggenburg',
    'creil',
    'espel',
    'bant',
    'rutten',
    'tollebeek',
  ],
  Urk: ['urk'],
  Zeewolde: ['zeewolde'],
  'Waterschap Zuiderzeeland': ['waterschap zuiderzeeland', 'zuiderzeeland'],
};

/** Flat lowercase term set for simple substring relevance scoring. Used by rules.ts. */
export const FLEVOLAND_TERMS = new Set([
  'almere',
  'lelystad',
  'dronten',
  'noordoostpolder',
  'urk',
  'zeewolde',
  'zuiderzeeland',
]);
