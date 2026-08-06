import { getNieuwsItems } from '@services/nieuws.service';
import { getBerichtenItems } from '@services/berichten.service';
import { getProductenDienstenItems } from '@services/productenDiensten.service';
import { getRegelcatalogusData, CatalogService } from '@services/regelcatalogus.service';
import { getPublicProcesses } from '@services/lde.service';
import { slugify } from '@utils/slug';
import { createLogger } from '@utils/logger';

const logger = createLogger('search-service');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type PublicItemType = 'bericht' | 'nieuws' | 'product' | 'regel' | 'proces';

export interface PublicRuleRow {
  naam: string;
  geldig: string | null;
}
export interface PublicFormRow {
  id: string;
  name: string;
}
export interface PublicSubprocessRow {
  id: string;
  name: string;
  bpmnProcessId: string;
  status: string;
}

export interface PublicIndexItem {
  /** Unique across the whole federated index, e.g. "regel-zorgtoeslag". */
  id: string;
  /** Path segment for this item's per-type detail route. */
  slug: string;
  type: PublicItemType;
  title: string;
  summary: string;
  org: string;
  date: string | null;
  audience: string[];
  external: string | null;
  facts: [string, string][];
  tech: [string, string][];
  rules?: PublicRuleRow[];
  ruleCount?: number;
  begrippen?: string[];
  forms?: PublicFormRow[];
  documents?: PublicFormRow[];
  subprocesses?: PublicSubprocessRow[];
}

export interface PublicSearchFilters {
  types?: string[];
  orgs?: string[];
  audience?: string[];
  sort?: 'rel' | 'date' | 'az';
}

// ── Mappers ────────────────────────────────────────────────────────────────

function mapRegelService(
  service: CatalogService,
  data: Awaited<ReturnType<typeof getRegelcatalogusData>>
): PublicIndexItem {
  const slug = slugify(service.title);
  const org = data.organizations.find((o) => o.services.some((s) => s.uri === service.uri));
  const rules = data.rules
    .filter((r) => r.serviceTitle === service.title)
    .map((r) => ({ naam: r.ruleTitle, geldig: r.validFrom }));
  const begrippen = data.concepts
    .filter((c) => c.serviceTitle === service.title)
    .map((c) => c.prefLabel);

  return {
    id: `regel-${slug}`,
    slug,
    type: 'regel',
    title: service.title,
    summary: service.description,
    org: org?.name ?? 'Onbekend',
    date: null,
    audience: ['Inwoner', 'Professional', 'Ontwikkelaar'],
    external: org?.homepage ?? null,
    rules,
    ruleCount: rules.length,
    begrippen,
    facts: [
      ['Uitvoeringsorganisatie', org?.name ?? '—'],
      ['Aantal regels', String(rules.length)],
      ['Vindbaar via', 'RONL kennisgraaf'],
    ],
    tech: [
      ['service.uri', service.uri],
      ['bron', 'RONL knowledge graph (SPARQL)'],
      ['formaat', 'DMN 1.3 + JSON-LD'],
      ['api', `/v1/public/regels/${slug}`],
    ],
  };
}

// ── Index builder ──────────────────────────────────────────────────────────

async function buildIndex(): Promise<PublicIndexItem[]> {
  const [berichten, nieuws, producten, catalogus, processen] = await Promise.all([
    getBerichtenItems(1000, 0),
    getNieuwsItems(1000, 0),
    getProductenDienstenItems(1000, 0),
    getRegelcatalogusData(),
    getPublicProcesses(),
  ]);

  const items: PublicIndexItem[] = [];

  for (const b of berichten.items) {
    items.push({
      id: `bericht-${b.id}`,
      slug: b.id,
      type: 'bericht',
      title: b.subject,
      summary: b.preview,
      org: b.sender.name,
      date: b.publishedAt,
      audience: ['Inwoner', 'Ondernemer'],
      external: 'flevoland.nl',
      facts: [
        ['Afzender', b.sender.name],
        ['Type', b.type],
      ],
      tech: [
        ['bericht.id', b.id],
        ['bron', 'Flevoland RSS'],
        ['api', `/v1/public/berichten/${b.id}`],
      ],
    });
  }

  for (const n of nieuws.items) {
    items.push({
      id: `nieuws-${n.id}`,
      slug: n.id,
      type: 'nieuws',
      title: n.title,
      summary: n.summary,
      org: n.source.name,
      date: n.publishedAt,
      audience: ['Inwoner', 'Ondernemer'],
      external: 'rijksoverheid.nl',
      facts: [
        ['Bron', n.source.name],
        ['Categorie', n.category ?? '—'],
      ],
      tech: [
        ['nieuws.id', n.id],
        ['bron', 'Rijksoverheid RSS'],
        ['api', `/v1/public/nieuws/${n.id}`],
      ],
    });
  }

  for (const p of producten.items) {
    items.push({
      id: `product-${p.id}`,
      slug: p.id,
      type: 'product',
      title: p.title,
      summary: p.description,
      org: 'Provincie Flevoland',
      date: p.modified,
      audience: p.audience.map((a) => (a === 'ondernemer' ? 'Ondernemer' : 'Inwoner')),
      external: 'flevoland.nl',
      facts: [
        ['Aanvragen bij', 'Provincie Flevoland'],
        ['Soort', p.soort],
        ['Online aanvragen', p.onlineAanvragen ? 'Ja' : 'Nee'],
      ],
      tech: [
        ['product.id', p.id],
        ['bron', 'Samenwerkende Catalogi (UPL)'],
        ['api', `/v1/public/producten/${p.id}`],
      ],
    });
  }

  for (const service of catalogus.services) {
    items.push(mapRegelService(service, catalogus));
  }

  for (const proces of processen) {
    items.push({
      id: `proces-${proces.key}`,
      slug: proces.key,
      type: 'proces',
      title: proces.naam,
      summary:
        proces.beschrijving ??
        'Uitvoerbaar proces (BPMN) dat is gepubliceerd op het procesplatform van Provincie Flevoland.',
      org: 'Provincie Flevoland',
      date: proces.gepubliceerd,
      audience: ['Professional', 'Ontwikkelaar'],
      external: null,
      forms: proces.forms,
      documents: proces.documents,
      subprocesses: proces.subprocesses,
      facts: [
        ['Proceskey', proces.key],
        ['Gepubliceerd', proces.gepubliceerd],
        ['Status', proces.status],
      ],
      tech: [
        ['process.key', proces.key],
        ['engine', 'Camunda 7 / BPMN 2.0'],
        ['formulieren', String(proces.forms.length)],
        ['subprocessen', String(proces.subprocesses.length)],
        ['api', `/v1/public/processen/${proces.key}`],
      ],
    });
  }

  return items;
}

interface Cache {
  items: PublicIndexItem[];
  fetchedAt: number;
}
let cache: Cache | null = null;

export async function getPublicIndex(forceRefresh = false): Promise<PublicIndexItem[]> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items;
  }
  const items = await buildIndex();
  cache = { items, fetchedAt: now };
  logger.info('Public search index rebuilt', { count: items.length });
  return items;
}

// ── Search / facets / lookup ────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchPublicIndex(
  index: PublicIndexItem[],
  q: string,
  filters: PublicSearchFilters
): PublicIndexItem[] {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean).map(escapeRegExp);

  let rows = index.map((it) => {
    const hay = `${it.title} ${it.summary || ''} ${it.org}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      const re = new RegExp(t);
      if (re.test(it.title.toLowerCase())) score += 10;
      if (re.test(hay)) score += 4;
      if (hay.split(/\W+/).some((w) => w.startsWith(t.replace(/\\/g, '')))) score += 2;
    }
    return { it, score };
  });

  if (terms.length) rows = rows.filter((r) => r.score > 0);
  if (filters.types?.length) rows = rows.filter((r) => filters.types!.includes(r.it.type));
  if (filters.orgs?.length) rows = rows.filter((r) => filters.orgs!.includes(r.it.org));
  if (filters.audience?.length) {
    rows = rows.filter((r) => (r.it.audience || []).some((a) => filters.audience!.includes(a)));
  }

  if (filters.sort === 'az') rows.sort((a, b) => a.it.title.localeCompare(b.it.title, 'nl'));
  else if (filters.sort === 'date') {
    rows.sort((a, b) => {
      if (!a.it.date && !b.it.date) return 0;
      if (!a.it.date) return 1;
      if (!b.it.date) return -1;
      return b.it.date.localeCompare(a.it.date); // newest first
    });
  } else rows.sort((a, b) => b.score - a.score);

  return rows.map((r) => r.it);
}

export function facetCounts(
  index: PublicIndexItem[],
  getter: (item: PublicIndexItem) => string | string[] | null | undefined
): [string, number][] {
  const map = new Map<string, number>();
  for (const item of index) {
    const value = getter(item);
    for (const v of ([] as string[]).concat(value ?? [])) {
      if (v) map.set(v, (map.get(v) ?? 0) + 1);
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function getPublicItemBySlug(
  index: PublicIndexItem[],
  type: PublicItemType,
  slug: string
): PublicIndexItem | undefined {
  return index.find((i) => i.type === type && i.slug === slug);
}
