import axios from 'axios';
import { config } from '@utils/config';
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
  return b.status === 'active' && (!b.boardOwner || PUBLIC_PROCESS_BOARDS.has(b.boardOwner));
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
