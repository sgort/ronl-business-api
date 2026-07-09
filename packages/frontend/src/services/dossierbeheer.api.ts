/**
 * Dossierbeheer API — the authoring writes for /pa/dossiers, plus the
 * template + snippet libraries.
 *
 * Honours the runtime mock/live flag (isDossiersMock): in mock mode the whole
 * surface runs on a local in-memory store seeded from MOCK_DOSSIERS — no backend
 * needed — so every page can be validated first. In live mode it hits the
 * backend; after any mutation the caller also refetches usePaData().dossiers so
 * the cockpit stays in sync (the confirm-loop pattern).
 */

import axios from 'axios';
import keycloak from './keycloak';
import { isDossiersMock } from './pa.api';
import type {
  AdminDossier,
  AdminDossierStatus,
  DossierArchief,
  DossierMarkdown,
  DossierSnippet,
  DossierTemplate,
  DossierVersion,
  Momentum,
  PartialKompasScores,
} from '@ronl/shared';
import {
  buildSeedAdminDossiers,
  DB_TEMPLATES,
  DB_SNIPPETS,
  todayLabel,
} from '../pages/public-affairs-v2/dossierbeheer.data';

const API_BASE = import.meta.env.VITE_API_URL as string;

export { isDossiersMock };

async function authHeaders(): Promise<Record<string, string>> {
  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(120);
    } catch {
      /* expired — proceed anyway */
    }
  }
  return keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {};
}

async function get<T>(path: string): Promise<T> {
  const res = await axios.get<{ success: boolean; data: T }>(`${API_BASE}${path}`, {
    headers: await authHeaders(),
  });
  return res.data.data;
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await axios.post<{ success: boolean; data: T }>(`${API_BASE}${path}`, body, {
    headers: await authHeaders(),
  });
  return res.data.data;
}
async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await axios.patch<{ success: boolean; data: T }>(`${API_BASE}${path}`, body, {
    headers: await authHeaders(),
  });
  return res.data.data;
}
async function del(path: string): Promise<void> {
  await axios.delete(`${API_BASE}${path}`, { headers: await authHeaders() });
}

export interface DossierWriteInput {
  naam: string;
  onderwerp: string;
  status: AdminDossierStatus;
  momentum: Momentum;
  eigenaar: string;
  kompas: PartialKompasScores;
  md: DossierMarkdown;
  sjabloon?: string;
  gepubliceerd?: boolean;
}

// ── Offline mock store (mock mode only) ─────────────────────────────
// Lazily seeded from MOCK_DOSSIERS; mutations are illustrative (in-memory)
// exactly like the design prototype. Reset by a full reload.

let mockStore: AdminDossier[] | null = null;
function store(): AdminDossier[] {
  if (!mockStore) mockStore = buildSeedAdminDossiers();
  return mockStore;
}
const clone = (d: AdminDossier): AdminDossier => JSON.parse(JSON.stringify(d));
const slugify = (naam: string): string =>
  naam
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function mockVersion(v: number, by: string, note: string): DossierVersion {
  return { v, at: todayLabel(), by, note };
}

// ── Reads ───────────────────────────────────────────────────────────

export function fetchAdminDossiers(): Promise<AdminDossier[]> {
  if (isDossiersMock()) return Promise.resolve(store().map(clone));
  return get<AdminDossier[]>('/pa/dossiers?admin=1');
}

export function fetchTemplates(): Promise<DossierTemplate[]> {
  if (isDossiersMock()) return Promise.resolve(DB_TEMPLATES);
  return get<DossierTemplate[]>('/pa/templates');
}

export function fetchSnippets(): Promise<DossierSnippet[]> {
  if (isDossiersMock()) return Promise.resolve(DB_SNIPPETS);
  return get<DossierSnippet[]>('/pa/snippets');
}

// ── Writes ──────────────────────────────────────────────────────────

export function createDossier(input: DossierWriteInput): Promise<AdminDossier> {
  if (isDossiersMock()) {
    const id = slugify(input.naam) || `dossier-${Date.now()}`;
    const created: AdminDossier = {
      id,
      naam: input.naam,
      onderwerp: input.onderwerp,
      status: input.status,
      momentum: input.momentum,
      eigenaar: input.eigenaar,
      kompas: input.kompas,
      md: input.md,
      versie: 1,
      gepubliceerd: Boolean(input.gepubliceerd),
      sjabloon: input.sjabloon ?? 'blanco',
      archief: null,
      bewerkt: 'nu',
      versies: [
        mockVersion(
          1,
          input.eigenaar,
          input.gepubliceerd ? 'Aangemaakt en gepubliceerd.' : 'Aangemaakt.'
        ),
      ],
    };
    store().unshift(created);
    return Promise.resolve(clone(created));
  }
  return post<AdminDossier>('/pa/dossiers', input);
}

export function updateDossier(
  id: string,
  patchBody: Partial<DossierWriteInput>
): Promise<AdminDossier> {
  if (isDossiersMock()) {
    const items = store();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return Promise.reject(new Error('not found'));
    const prev = items[idx];
    // Archived dossiers are read-only (mirrors the backend 409 guard).
    if (prev.status === 'gearchiveerd') return Promise.reject(new Error('archived'));
    const nextVersie = prev.versie + 1;
    const updated: AdminDossier = {
      ...prev,
      ...patchBody,
      kompas: patchBody.kompas ?? prev.kompas,
      md: patchBody.md ?? prev.md,
      versie: nextVersie,
      bewerkt: 'nu',
      versies: [
        ...prev.versies,
        mockVersion(
          nextVersie,
          patchBody.eigenaar ?? prev.eigenaar,
          patchBody.gepubliceerd ? 'Bijgewerkt en gepubliceerd.' : 'Bijgewerkt.'
        ),
      ],
    };
    items[idx] = updated;
    return Promise.resolve(clone(updated));
  }
  return patch<AdminDossier>(`/pa/dossiers/${id}`, patchBody);
}

export function archiveDossier(
  id: string,
  meta: Pick<DossierArchief, 'classificatie' | 'bewaartermijn' | 'reden'>
): Promise<AdminDossier> {
  if (isDossiersMock()) {
    const items = store();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return Promise.reject(new Error('not found'));
    const prev = items[idx];
    const nextVersie = prev.versie + 1;
    const updated: AdminDossier = {
      ...prev,
      status: 'gearchiveerd',
      gepubliceerd: false,
      archief: { ...meta, at: todayLabel(), by: `${prev.eigenaar} (Beheerder)` },
      versie: nextVersie,
      bewerkt: 'nu',
      versies: [
        ...prev.versies,
        mockVersion(
          nextVersie,
          prev.eigenaar,
          `Gearchiveerd (Archiefwet) — classificatie ${meta.classificatie}, bewaartermijn ${meta.bewaartermijn}.`
        ),
      ],
    };
    items[idx] = updated;
    return Promise.resolve(clone(updated));
  }
  return post<AdminDossier>(`/pa/dossiers/${id}/archive`, meta);
}

export function unarchiveDossier(
  id: string,
  status: 'actief' | 'sluimerend' = 'actief'
): Promise<AdminDossier> {
  if (isDossiersMock()) {
    const items = store();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return Promise.reject(new Error('not found'));
    const prev = items[idx];
    if (prev.status !== 'gearchiveerd') return Promise.reject(new Error('not archived'));
    const nextVersie = prev.versie + 1;
    const updated: AdminDossier = {
      ...prev,
      status,
      archief: null,
      gepubliceerd: false,
      versie: nextVersie,
      bewerkt: 'nu',
      versies: [
        ...prev.versies,
        mockVersion(
          nextVersie,
          prev.eigenaar,
          `Gedearchiveerd — teruggezet naar concept (${status}).`
        ),
      ],
    };
    items[idx] = updated;
    return Promise.resolve(clone(updated));
  }
  return post<AdminDossier>(`/pa/dossiers/${id}/unarchive`, { status });
}

export function deleteDossier(id: string): Promise<void> {
  if (isDossiersMock()) {
    mockStore = store().filter((i) => i.id !== id);
    return Promise.resolve();
  }
  return del(`/pa/dossiers/${id}`);
}
