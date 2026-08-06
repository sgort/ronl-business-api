/**
 * Resolves the backend base URL in both runtimes this module is used from:
 *  - the browser build, where Vite statically replaces `import.meta.env.*`
 *  - the Node prerender script (Task 20), which sets PUBLIC_API_BASE_URL
 *    because import.meta.env isn't populated outside a Vite build/dev server.
 */
function resolveApiBase(): string {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
  if (viteEnv?.VITE_API_URL) return viteEnv.VITE_API_URL;
  if (typeof process !== 'undefined' && process.env?.PUBLIC_API_BASE_URL) {
    return process.env.PUBLIC_API_BASE_URL;
  }
  throw new Error('No API base URL configured (VITE_API_URL or PUBLIC_API_BASE_URL)');
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${resolveApiBase()}/public${path}`);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok) {
    throw new Error(`${path} → HTTP ${res.status}: ${body.error?.message ?? 'request failed'}`);
  }
  if (!body.success) {
    throw new Error(body.error?.message ?? 'Request failed');
  }
  return body.data as T;
}

/** Like getJSON, but resolves to null on a 404 instead of throwing —
 * used by the per-item detail lookups, where "not found" is a normal
 * outcome (bad slug, stale link), not an application error. */
async function getJSONOrNull<T>(path: string): Promise<T | null> {
  const res = await fetch(`${resolveApiBase()}/public${path}`);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`${path} → HTTP ${res.status}: ${body.error?.message ?? 'request failed'}`);
  }
  if (!body.success) {
    throw new Error(body.error?.message ?? 'Request failed');
  }
  return body.data as T;
}

function qs(params: Record<string, string | string[] | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    const v = Array.isArray(value) ? value.join(',') : value;
    if (!v) continue;
    parts.push(`${key}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

// ── Federated search ─────────────────────────────────────────────────────

export type PublicItemType = 'bericht' | 'nieuws' | 'product' | 'regel' | 'proces';

export interface PublicHit {
  id: string;
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
  rules?: { naam: string; geldig: string | null }[];
  ruleCount?: number;
  begrippen?: string[];
  forms?: { id: string; name: string }[];
  documents?: { id: string; name: string }[];
  subprocesses?: { id: string; name: string; bpmnProcessId: string; status: string }[];
}

export interface SearchResponse {
  items: PublicHit[];
  total: number;
  facets: {
    soort: [string, number][];
    bron: [string, number][];
    doelgroep: [string, number][];
  };
}

export interface SearchParams {
  q?: string;
  soort?: string[];
  bron?: string[];
  doelgroep?: string[];
  sort?: 'rel' | 'date' | 'az';
}

export function searchPublic(params: SearchParams): Promise<SearchResponse> {
  const query = qs({
    q: params.q,
    soort: params.soort,
    bron: params.bron,
    doelgroep: params.doelgroep,
    sort: params.sort,
  });
  return getJSON<SearchResponse>(`/zoeken${query}`);
}

// ── Berichten ────────────────────────────────────────────────────────────

export interface BerichtItem {
  id: string;
  subject: string;
  preview: string;
  content: string | null;
  publishedAt: string;
  sender: { id: string; name: string };
}

export async function getBerichten(limit = 50): Promise<{ items: BerichtItem[]; total: number }> {
  return getJSON(`/berichten?limit=${limit}`);
}
export function getBerichtBySlug(slug: string): Promise<BerichtItem | null> {
  return getJSONOrNull(`/berichten/${encodeURIComponent(slug)}`);
}

// ── Nieuws ───────────────────────────────────────────────────────────────

export interface NieuwsItem {
  id: string;
  title: string;
  summary: string;
  category: string | null;
  publishedAt: string;
  url: string | null;
  source: { id: string; name: string };
}

export async function getNieuws(limit = 50): Promise<{ items: NieuwsItem[]; total: number }> {
  return getJSON(`/nieuws?limit=${limit}`);
}
export function getNieuwsBySlug(slug: string): Promise<PublicHit | null> {
  return getJSONOrNull(`/nieuws/${encodeURIComponent(slug)}`);
}

// ── Producten & Diensten ─────────────────────────────────────────────────

export interface ProductItem {
  id: string;
  title: string;
  description: string;
  url: string;
  audience: ('ondernemer' | 'particulier')[];
  onlineAanvragen: boolean;
  modified: string | null;
  soort: 'subsidie' | 'vergunning' | 'bezwaar';
}

export async function getProducten(limit = 200): Promise<{ items: ProductItem[]; total: number }> {
  return getJSON(`/producten-diensten?limit=${limit}`);
}
export function getProductBySlug(slug: string): Promise<PublicHit | null> {
  return getJSONOrNull(`/producten/${encodeURIComponent(slug)}`);
}

// ── Regelcatalogus ───────────────────────────────────────────────────────

export interface CatalogService {
  uri: string;
  title: string;
  description: string;
}
export interface CatalogOrganization {
  uri: string;
  identifier: string;
  name: string;
  homepage: string | null;
  logo: string | null;
  services: { uri: string; title: string }[];
}
export interface CatalogConcept {
  uri: string;
  prefLabel: string;
  exactMatch: string | null;
  serviceUri: string;
  serviceTitle: string;
}
export interface CatalogRule {
  serviceTitle: string;
  ruleTitle: string;
  validFrom: string | null;
  confidence: string | null;
  description: string | null;
}
export interface RegelcatalogusData {
  services: CatalogService[];
  organizations: CatalogOrganization[];
  concepts: CatalogConcept[];
  rules: CatalogRule[];
}

export async function getRegelcatalogus(): Promise<RegelcatalogusData> {
  return getJSON('/regelcatalogus');
}
export function getRegelBySlug(slug: string): Promise<PublicHit | null> {
  return getJSONOrNull(`/regels/${encodeURIComponent(slug)}`);
}

// ── Processen ────────────────────────────────────────────────────────────

export interface PublicProcess {
  key: string;
  naam: string;
  beschrijving: string | null;
  gepubliceerd: string;
  status: string;
  forms: { id: string; name: string }[];
  documents: { id: string; name: string }[];
  subprocesses: { id: string; name: string; bpmnProcessId: string; status: string }[];
}

export async function getProcessen(): Promise<PublicProcess[]> {
  return getJSON('/processen');
}
export function getProcesByKey(key: string): Promise<PublicProcess | null> {
  return getJSONOrNull(`/processen/${encodeURIComponent(key)}`);
}
