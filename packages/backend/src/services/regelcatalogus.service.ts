/* eslint-disable @typescript-eslint/no-non-null-assertion */
import axios from 'axios';
import { createLogger } from '@utils/logger';

const logger = createLogger('regelcatalogus-service');

const SPARQL_ENDPOINT =
  process.env.RONL_SPARQL_ENDPOINT ||
  'https://api.open-regels.triply.cc/datasets/stevengort/RONL/services/RONL/sparql';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let assetUrlCache: Map<string, string> | null = null;
let assetsCachedAt = 0;

// ── Types ──────────────────────────────────────────────────────────────────

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
  services: Array<{ uri: string; title: string }>;
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

// ── In-memory cache ────────────────────────────────────────────────────────

interface Cache {
  data: RegelcatalogusData;
  fetchedAt: number;
}

let cache: Cache | null = null;

// ── SPARQL transport ───────────────────────────────────────────────────────
// Mirrors the LDE sparql.service.ts pattern exactly:
// POST with Content-Type: application/sparql-query and raw query body.

type SparqlBinding = Record<string, { value: string }>;

async function runQuery(query: string): Promise<SparqlBinding[]> {
  const response = await axios.post(SPARQL_ENDPOINT, query, {
    headers: {
      'Content-Type': 'application/sparql-query',
      Accept: 'application/sparql-results+json',
    },
    timeout: 10_000,
  });
  return (response.data?.results?.bindings ?? []) as SparqlBinding[];
}

function val(row: SparqlBinding, key: string): string | null {
  return row[key]?.value ?? null;
}

// ── Queries ────────────────────────────────────────────────────────────────

async function fetchServices(): Promise<CatalogService[]> {
  // Taken directly from the 'Get All Public Services' sample query in constants.ts
  const query = `
PREFIX cpsv: <http://purl.org/vocab/cpsv#>
PREFIX dct:  <http://purl.org/dc/terms/>

SELECT ?service ?title ?description
WHERE {
  ?service a cpsv:PublicService .
  ?service dct:title ?title .
  OPTIONAL { ?service dct:description ?description }
  FILTER(LANG(?title) = "nl")
}
ORDER BY ?title
`;
  const rows = await runQuery(query);
  return rows.map((r) => ({
    uri: val(r, 'service')!,
    title: val(r, 'title') ?? '',
    description: val(r, 'description') ?? '',
  }));
}

async function resolveLogoUrls(): Promise<Map<string, string>> {
  const now = Date.now();
  if (assetUrlCache && now - assetsCachedAt < CACHE_TTL_MS) {
    return assetUrlCache;
  }

  try {
    // Extract account/dataset from the endpoint URL — same pattern as LDE sparql.service.ts
    const match = SPARQL_ENDPOINT.match(/datasets\/([^/]+)\/([^/]+)/);
    if (!match) return new Map();
    const [, account, dataset] = match;

    const assetsUrl = `https://api.open-regels.triply.cc/datasets/${account}/${dataset}/assets`;
    logger.info('Fetching TriplyDB assets for logo resolution', { assetsUrl });

    type AssetEntry = { assetName: string; versions: Array<{ url: string }> };
    const response = await axios.get<AssetEntry[]>(assetsUrl, { timeout: 8_000 });

    assetUrlCache = new Map(
      response.data
        .filter((a) => a.versions.length > 0)
        .map((a) => [a.assetName, a.versions[0].url])
    );
    assetsCachedAt = now;

    logger.info('TriplyDB assets resolved', { count: assetUrlCache.size });
    return assetUrlCache;
  } catch (error) {
    logger.warn('Failed to resolve TriplyDB assets', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

async function fetchOrganizations(): Promise<Omit<CatalogOrganization, 'services'>[]> {
  // Taken from the 'Get All Organizations' sample query in constants.ts.
  // Vocab: cv:PublicOrganisation, skos:prefLabel, foaf:homepage, foaf:logo / schema:image
  const query = `
PREFIX cv:    <http://data.europa.eu/m8g/>
PREFIX dct:   <http://purl.org/dc/terms/>
PREFIX foaf:  <http://xmlns.com/foaf/0.1/>
PREFIX skos:  <http://www.w3.org/2004/02/skos/core#>
PREFIX schema: <http://schema.org/>

SELECT ?organization ?identifier ?name ?homepage ?spatial ?logo
WHERE {
  ?organization a cv:PublicOrganisation ;
                dct:identifier ?identifier ;
                skos:prefLabel ?name .
  OPTIONAL { ?organization foaf:homepage ?homepage }
  OPTIONAL { ?organization cv:spatial ?spatial }
  OPTIONAL { ?organization foaf:logo ?logo }
  OPTIONAL { ?organization schema:image ?logo }
  FILTER(LANG(?name) = "nl" || LANG(?name) = "")
}
ORDER BY ?name
`;
  const rows = await runQuery(query);
  return rows.map((r) => ({
    uri: val(r, 'organization')!,
    identifier: val(r, 'identifier') ?? '',
    name: val(r, 'name') ?? '',
    homepage: val(r, 'homepage'),
    logo: val(r, 'logo'),
  }));
}

async function fetchOrganizationServices(): Promise<
  Array<{ organizationUri: string; serviceUri: string; serviceTitle: string }>
> {
  // Based on the 'Services and Authorities' sample query in constants.ts.
  const query = `
PREFIX cpsv:  <http://purl.org/vocab/cpsv#>
PREFIX cv:    <http://data.europa.eu/m8g/>
PREFIX dct:   <http://purl.org/dc/terms/>

SELECT ?organization ?service ?serviceTitle
WHERE {
  ?service a cpsv:PublicService ;
           dct:title ?serviceTitle ;
           cv:hasCompetentAuthority ?organization .
  FILTER(LANG(?serviceTitle) = "nl")
}
`;
  const rows = await runQuery(query);
  return rows.map((r) => ({
    organizationUri: val(r, 'organization')!,
    serviceUri: val(r, 'service')!,
    serviceTitle: val(r, 'serviceTitle') ?? '',
  }));
}

async function fetchConcepts(): Promise<CatalogConcept[]> {
  // Taken directly from the 'NL-SBB Concepts and Services' sample query in constants.ts.
  // Traversal: concept → skos:exactMatch
  //            concept → dct:subject → variable → cpsv:isRequiredBy / cpsv:produces → DMN
  //            DMN → cprmv:implements → service
  const query = `
PREFIX skos:  <http://www.w3.org/2004/02/skos/core#>
PREFIX dct:   <http://purl.org/dc/terms/>
PREFIX cpsv:  <http://purl.org/vocab/cpsv#>
PREFIX cprmv: <https://cprmv.open-regels.nl/0.3.0/>

SELECT ?subject ?prefLabel ?exactMatch ?service ?serviceTitle
WHERE {
  ?subject skos:exactMatch ?exactMatch ;
           dct:subject ?variable .

  OPTIONAL {
    ?subject skos:prefLabel ?prefLabel .
    FILTER(LANG(?prefLabel) = "nl" || LANG(?prefLabel) = "")
  }

  {
    ?variable cpsv:isRequiredBy ?dmn .
  } UNION {
    ?variable cpsv:produces ?dmn .
  }

  ?dmn cprmv:implements ?service .
  OPTIONAL {
    ?service dct:title ?serviceTitle .
    FILTER(LANG(?serviceTitle) = "nl" || LANG(?serviceTitle) = "")
  }
}
ORDER BY ?service ?subject
`;
  const rows = await runQuery(query);
  return rows.map((r) => ({
    uri: val(r, 'subject')!,
    prefLabel: val(r, 'prefLabel') ?? '',
    exactMatch: val(r, 'exactMatch'),
    serviceUri: val(r, 'service') ?? '',
    serviceTitle: val(r, 'serviceTitle') ?? '',
  }));
}

async function fetchRules(): Promise<CatalogRule[]> {
  // From the 'Rules with Their Services' sample query in LDE constants.ts
  const query = `
PREFIX cpsv:  <http://purl.org/vocab/cpsv#>
PREFIX dct:   <http://purl.org/dc/terms/>
PREFIX ronl:  <https://regels.overheid.nl/ontology#>

SELECT ?serviceTitle ?ruleTitle ?validFrom ?confidence ?description
WHERE {
  ?service a cpsv:PublicService ;
           dct:title ?serviceTitle .
  ?rule a cpsv:Rule ;
        cpsv:implements ?service ;
        dct:title ?ruleTitle .
  OPTIONAL { ?rule dct:description ?description }
  OPTIONAL { ?rule ronl:validFrom ?validFrom }
  OPTIONAL { ?rule ronl:confidenceLevel ?confidence }
  FILTER(LANG(?serviceTitle) = "nl")
  FILTER(LANG(?ruleTitle) = "nl")
}
ORDER BY ?serviceTitle ?validFrom ?ruleTitle
`;
  const rows = await runQuery(query);
  return rows.map((r) => ({
    serviceTitle: val(r, 'serviceTitle') ?? '',
    ruleTitle: val(r, 'ruleTitle') ?? '',
    validFrom: val(r, 'validFrom'),
    confidence: val(r, 'confidence'),
    description: val(r, 'description'),
  }));
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getRegelcatalogusData(): Promise<RegelcatalogusData> {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    logger.debug('Regelcatalogus cache hit');
    return cache.data;
  }

  logger.info('Fetching regelcatalogus from TriplyDB', { endpoint: SPARQL_ENDPOINT });

  try {
    const [services, orgsBase, orgServices, concepts, assetUrls, rules] = await Promise.all([
      fetchServices(),
      fetchOrganizations(),
      fetchOrganizationServices(),
      fetchConcepts(),
      resolveLogoUrls(),
      fetchRules(),
    ]);

    const organizations: CatalogOrganization[] = orgsBase.map((org) => {
      // The RDF stores the filename as the trailing segment of the logo URI
      const logoFilename = org.logo ? (org.logo.split('/').pop() ?? null) : null;
      const resolvedLogo = logoFilename ? (assetUrls.get(logoFilename) ?? null) : null;

      return {
        ...org,
        logo: resolvedLogo,
        services: orgServices
          .filter((os) => os.organizationUri === org.uri)
          .map((os) => ({ uri: os.serviceUri, title: os.serviceTitle })),
      };
    });

    const data: RegelcatalogusData = { services, organizations, concepts, rules };
    cache = { data, fetchedAt: now };

    logger.info('Regelcatalogus cache refreshed', {
      services: services.length,
      organizations: organizations.length,
      concepts: concepts.length,
    });

    return data;
  } catch (error) {
    logger.error('Failed to fetch regelcatalogus from TriplyDB', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Return stale cache if available, otherwise empty slices
    return cache?.data ?? { services: [], organizations: [], concepts: [], rules: [] };
  }
}
