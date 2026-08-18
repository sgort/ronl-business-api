import axios from 'axios';
import { config } from '@utils/config';
import { SPARQL_ENDPOINT } from '@services/regelcatalogus.service';
import { createLogger } from '@utils/logger';

const logger = createLogger('lde-service');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — mirrors regelcatalogus.service

// Only these boardOwner values (plus untagged bundles) are exposed on the
// public site. infra-board and other internal boards stay caseworker-only.
const PUBLIC_PROCESS_BOARDS = new Set(['caseworker']);

// ── LDE's native shape (mirrors ProcessBundle in packages/frontend/src/services/api.ts) ──

interface LdeDeployedForm {
  id: string;
  name: string;
}
interface LdeDeployedDocument {
  id: string;
  name: string;
}
interface LdeSubprocess {
  id: string;
  name: string;
  bpmnProcessId: string;
  status: string;
}
interface LdeProcessBundle {
  id: string;
  bpmnProcessId: string;
  name: string;
  description?: string;
  processRole: string;
  status: string;
  boardOwner?: string;
  deployedAt: string;
  linkedDmnTemplates: string[];
  deployedForms: LdeDeployedForm[];
  deployedDocuments: LdeDeployedDocument[];
  subprocesses: LdeSubprocess[];
}

// ── Public view model ─────────────────────────────────────────────────────

export interface PublicProcess {
  key: string; // bpmnProcessId — the public identifier / URL slug
  naam: string;
  beschrijving: string | null;
  gepubliceerd: string;
  status: string;
  forms: LdeDeployedForm[];
  documents: LdeDeployedDocument[];
  subprocesses: LdeSubprocess[];
}

function isPubliclyVisible(b: LdeProcessBundle): boolean {
  const statusOk = b.status === 'active' || (config.public.showWipProcesses && b.status === 'wip');
  return statusOk && (!b.boardOwner || PUBLIC_PROCESS_BOARDS.has(b.boardOwner));
}

function toPublicProcess(b: LdeProcessBundle): PublicProcess {
  return {
    key: b.bpmnProcessId,
    naam: b.name,
    beschrijving: b.description ?? null,
    gepubliceerd: b.deployedAt,
    status: b.status,
    forms: b.deployedForms,
    documents: b.deployedDocuments,
    subprocesses: b.subprocesses,
  };
}

interface Cache {
  items: PublicProcess[];
  fetchedAt: number;
}
let cache: Cache | null = null;

export async function getPublicProcesses(forceRefresh = false): Promise<PublicProcess[]> {
  const now = Date.now();
  if (!forceRefresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items;
  }

  try {
    const response = await axios.get<{ success: boolean; data: LdeProcessBundle[] }>(
      `${config.lde.apiUrl}/bundles/public`,
      { timeout: 10_000 }
    );
    const items = (response.data.data ?? []).filter(isPubliclyVisible).map(toPublicProcess);
    cache = { items, fetchedAt: now };
    logger.info('LDE public process bundles refreshed', { count: items.length });
    return items;
  } catch (error) {
    logger.error('Failed to fetch LDE public process bundles', {
      error: error instanceof Error ? error.message : String(error),
    });
    return cache?.items ?? [];
  }
}

export async function getPublicProcessByKey(
  key: string,
  forceRefresh = false
): Promise<PublicProcess | null> {
  const items = await getPublicProcesses(forceRefresh);
  return items.find((i) => i.key === key) ?? null;
}

// ── Published DMNs ────────────────────────────────────────────────────────
// LDE's /v1/dmns lists every DMN published in the RONL knowledge graph, keyed
// to the CPSV service it implements. The public site joins on that service URI
// to offer the DMN source as a download on the rule-catalogue detail page.

interface LdeDmn {
  identifier?: string;
  title?: string;
  service?: string;
  serviceTitle?: string;
  /** Origin-relative on LDE, e.g. "/v1/dmns/<identifier>/xml". */
  xmlUrl?: string;
}

export interface PublicDmn {
  /** The DMN filename as published, e.g. "HvA_full_dmn_export-patched.dmn". */
  title: string;
  /** Absolute, browser-followable URL to the DMN 1.3 XML. */
  xmlUrl: string;
}

interface DmnCache {
  byService: Map<string, PublicDmn[]>;
  fetchedAt: number;
}
let dmnCache: DmnCache | null = null;

export async function getPublicDmnsByService(
  forceRefresh = false
): Promise<Map<string, PublicDmn[]>> {
  const now = Date.now();
  if (!forceRefresh && dmnCache && now - dmnCache.fetchedAt < CACHE_TTL_MS) {
    return dmnCache.byService;
  }

  try {
    const response = await axios.get<{ success: boolean; data: { dmns: LdeDmn[] } }>(
      `${config.lde.apiUrl}/dmns`,
      { params: { endpoint: SPARQL_ENDPOINT }, timeout: 10_000 }
    );

    const byService = new Map<string, PublicDmn[]>();
    for (const dmn of response.data.data?.dmns ?? []) {
      if (!dmn.service || !dmn.xmlUrl) continue;
      // xmlUrl is origin-relative and already carries LDE's /v1 prefix, so resolve
      // it against the configured API URL rather than concatenating (which would
      // yield .../v1/v1/dmns/...).
      const xmlUrl = new URL(dmn.xmlUrl, config.lde.apiUrl).toString();
      const entry = { title: dmn.title ?? dmn.identifier ?? 'DMN', xmlUrl };
      const existing = byService.get(dmn.service);
      if (existing) existing.push(entry);
      else byService.set(dmn.service, [entry]);
    }

    dmnCache = { byService, fetchedAt: now };
    logger.info('LDE published DMNs refreshed', { services: byService.size });
    return byService;
  } catch (error) {
    logger.error('Failed to fetch LDE published DMNs', {
      error: error instanceof Error ? error.message : String(error),
    });
    return dmnCache?.byService ?? new Map();
  }
}
