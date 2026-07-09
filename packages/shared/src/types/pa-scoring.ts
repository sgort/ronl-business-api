/** PA curation scoring constants — shared between rules.ts (backend) and the frontend preview. */

export const REL_BASE = 3;
export const ZWAARTYPE_BUMP = 2;
export const MEDIA_MUNI_BUMP = 1;
/** Province geographic match on media items — same weight as ZWAARTYPE_BUMP but semantically distinct. */
export const MEDIA_PROV_BUMP = 2;
export const TITLE_HIT = 3;
export const DESC_HIT = 1;
export const TAG_HIT = 1;
export const MATCH_CAP = 5;
export const REL_MAX = 10;
export const NOISE_FLOOR = 3;

/** Inbox persistence cutoff — items with rel < REL_THRESHOLD are dropped by runCurationCycle. */
export const REL_THRESHOLD = 4;
