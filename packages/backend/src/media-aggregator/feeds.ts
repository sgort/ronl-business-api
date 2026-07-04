/**
 * media-aggregator — curated feed registry.
 *
 * MVP scope: a small, reliable set of Dutch news feeds. Two of these are already
 * proven to work elsewhere in this backend:
 *   - Provincie Flevoland RSS  → berichten.service.ts
 *   - Rijksoverheid /api/rss   → nieuws.service.ts
 * so the aggregator returns real Flevoland data on day one. The rest add national
 * breadth; the gazetteer (enrich.ts) scopes national items to Flevoland by mention.
 *
 * Expanding coverage = adding entries here. Nothing else changes.
 * VERIFY the exact URL of each feed against the outlet before enabling in prod;
 * the two "proven" feeds above are known-good, the others are the usual public paths.
 */

import type { FeedSource } from './types';

const RIJKSOVERHEID_QUERY = JSON.stringify({
  filters: [{ field: 'content_type', values: ['pro:newsDocument'], type: 'all' }],
  resultSearchTerm: '',
});

export const FEEDS: FeedSource[] = [
  // ── Regional — Flevoland desks (always province-tagged) ──────────────────
  {
    id: 'provincie-flevoland',
    name: 'Provincie Flevoland',
    homepage: 'flevoland.nl',
    type: 'regional',
    url: 'https://www.flevoland.nl/Content/Pages/Loket?rss=news', // proven: berichten.service.ts
    alwaysFlevoland: true,
  },
  {
    id: 'omroep-flevoland',
    name: 'Omroep Flevoland',
    homepage: 'omroepflevoland.nl',
    type: 'regional',
    url: 'https://www.omroepflevoland.nl/rss', // VERIFY exact path in prod
    alwaysFlevoland: true,
  },

  // ── National — region-scoped by gazetteer match (enrich.ts) ──────────────
  {
    id: 'rijksoverheid',
    name: 'Rijksoverheid',
    homepage: 'rijksoverheid.nl',
    type: 'national',
    url: 'https://www.rijksoverheid.nl/api/rss', // proven: nieuws.service.ts
    params: { query: RIJKSOVERHEID_QUERY },
  },
  {
    id: 'nos-algemeen',
    name: 'NOS Nieuws',
    homepage: 'nos.nl',
    type: 'national',
    url: 'https://feeds.nos.nl/nosnieuwsalgemeen',
  },
  {
    id: 'nu-algemeen',
    name: 'NU.nl',
    homepage: 'nu.nl',
    type: 'national',
    url: 'https://www.nu.nl/rss/Algemeen',
  },
];
