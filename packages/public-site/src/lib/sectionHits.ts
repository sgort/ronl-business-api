import type { BerichtItem, NieuwsItem, ProductItem, PublicProcess, PublicHit } from './api';
import type { PubType } from './sections';

// The per-type mapping from a section's raw API items to the common PublicHit
// shape SectionIndex renders. Extracted so the prerender step and the page use
// exactly one implementation: the prerender embeds mapToHits(...) into each
// section route's HTML, and SectionIndex seeds its list straight from that blob
// (no client-side re-fetch, no loading flash → no CLS), while a cold load still
// fetches and maps through the same function.
export function mapToHits(type: PubType, raw: unknown[]): PublicHit[] {
  switch (type) {
    case 'bericht':
      return (raw as BerichtItem[]).map((b) => ({
        id: b.id,
        slug: b.id,
        type: 'bericht',
        title: b.subject,
        summary: b.preview,
        org: b.sender.name,
        date: b.publishedAt,
        audience: [],
        external: null,
        facts: [],
        tech: [],
      }));
    case 'nieuws':
      return (raw as NieuwsItem[]).map((n) => ({
        id: n.id,
        slug: n.id,
        type: 'nieuws',
        title: n.title,
        summary: n.summary,
        org: n.source.name,
        date: n.publishedAt,
        audience: [],
        external: null,
        facts: [],
        tech: [],
      }));
    case 'product':
      return (raw as ProductItem[]).map((p) => ({
        id: p.id,
        slug: p.id,
        type: 'product',
        title: p.title,
        summary: p.description,
        org: 'Provincie Flevoland',
        date: p.modified,
        audience: p.audience,
        external: null,
        facts: [],
        tech: [],
      }));
    case 'proces':
      return (raw as PublicProcess[]).map((p) => ({
        id: p.key,
        slug: p.key,
        type: 'proces',
        title: p.naam,
        summary: p.beschrijving ?? '',
        org: 'Provincie Flevoland',
        date: p.gepubliceerd,
        audience: [],
        external: null,
        facts: [],
        tech: [],
      }));
    case 'regel':
      return []; // Regelcatalogus owns this type
  }
}
