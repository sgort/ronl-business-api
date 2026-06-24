/**
 * Tweede Kamer agenda client — OData v5 /Activiteit.
 * Fetches plenaire, vragenuur and commissie sessions for the PA-Cockpit Agenda tab.
 * Reuses the same OData quirks as tk.client.ts: $-params must NOT be
 * percent-encoded; 15s AbortController timeout; fail-soft Redis cache.
 *
 * Soort values verified against /Activiteit OData v5 $metadata (June 2026).
 * dossier/matchTerm are NOT set here — the route handler enriches those
 * by running the tenant's saved-search taxonomy over the titel field.
 */

import { createHash } from 'crypto';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { cacheGet, cacheSet } from '../pa-cache';
import type { PlenaryItem } from '@ronl/shared';

const logger = createLogger('agenda-client');
const HTTP_TIMEOUT_MS = 15_000;

// ── Soort sets (real v5 values, verified June 2026) ─────────────────────────

const PLENAIR_SOORTEN = [
  'Plenair debat (debat)',
  'Plenair debat (wetgeving)',
  'Plenair debat (tweeminutendebat)',
  'Stemmingen',
  'Regeling van werkzaamheden',
  'Hamerstukken',
] as const;

const VRAGENUUR_SOORTEN = ['Mondelinge vragen'] as const;

const COMMISSIE_SOORTEN = [
  'Commissiedebat',
  'Wetgevingsoverleg',
  'Notaoverleg',
  'Rondetafelgesprek',
  'Technische briefing',
  'Procedurevergadering',
] as const;

const SOORT_PLENAIR = new Set<string>(PLENAIR_SOORTEN);
const SOORT_VRAGENUUR = new Set<string>(VRAGENUUR_SOORTEN);
const SOORT_COMMISSIE = new Set<string>(COMMISSIE_SOORTEN);
const ALL_SOORTEN = [...PLENAIR_SOORTEN, ...VRAGENUUR_SOORTEN, ...COMMISSIE_SOORTEN];

// Human-readable label overrides where the raw Soort is too verbose
const SOORT_LABEL: Partial<Record<string, string>> = {
  'Plenair debat (debat)': 'Plenair debat',
  'Plenair debat (wetgeving)': 'Plenair debat',
  'Plenair debat (tweeminutendebat)': 'Tweeminutendebat',
};

// ── Normalisation helpers ────────────────────────────────────────────────────

function normaliseSoort(soort: string): { kind: PlenaryItem['soort']; label: string } | null {
  if (SOORT_VRAGENUUR.has(soort)) return { kind: 'vragenuur', label: soort };
  if (SOORT_COMMISSIE.has(soort)) return { kind: 'commissie', label: soort };
  if (SOORT_PLENAIR.has(soort)) return { kind: 'plenair', label: SOORT_LABEL[soort] ?? soort };
  return null;
}

function normaliseStatus(s: unknown): PlenaryItem['status'] {
  const l = String(s ?? '').toLowerCase();
  if (l === 'uitgevoerd') return 'uitgevoerd';
  if (l === 'geannuleerd') return 'geannuleerd';
  return 'gepland';
}

function extractDate(dt: unknown): string {
  // "2026-06-22T10:00:00+02:00" → "2026-06-22"
  return String(dt ?? '').substring(0, 10);
}

function extractTime(dt: unknown): string | null {
  if (!dt) return null;
  const s = String(dt);
  // Grab HH:MM from the local-time part (already in CET/CEST from TK)
  return s.length >= 16 ? s.substring(11, 16) : null;
}

function buildItemUrl(nummer: string, kind: PlenaryItem['soort']): string {
  if (kind === 'commissie') {
    return `https://www.tweedekamer.nl/debat_en_vergadering/commissievergaderingen/details?id=${nummer}`;
  }
  return `https://www.tweedekamer.nl/debat_en_vergadering/plenaire_vergaderingen/details/activiteit?id=${nummer}`;
}

function normalise(rawItems: Record<string, unknown>[]): PlenaryItem[] {
  const result: PlenaryItem[] = [];
  for (const item of rawItems) {
    const soort = item['Soort'] as string;
    const norm = normaliseSoort(soort);
    if (!norm) continue;

    const nummer = (item['Nummer'] as string) ?? '';
    result.push({
      id: (item['Id'] as string) ?? '',
      nummer,
      soort: norm.kind,
      soortLabel: norm.label,
      titel: (item['Onderwerp'] as string) || '(geen onderwerp)',
      iso: extractDate(item['Datum']),
      tijd: extractTime(item['Datum']),
      commissie: (item['VoortouwCommissieNaam'] as string | null) ?? null,
      status: normaliseStatus(item['Status']),
      dossier: null,
      matchTerm: null,
      url: buildItemUrl(nummer, norm.kind),
      // Datum carries the full datetime; Aanvangstijd is not selected
      live: null,
      stream: null,
    });
  }
  return result;
}

// ── OData URL builder ────────────────────────────────────────────────────────

// TK OData API hard-caps $top at 100; requests above that return HTTP 400.
const PAGE_SIZE = 100;
const MAX_ITEMS = 600; // safety cap across pages

function buildPageUrl(dateFrom: string, dateTo: string, skip: number): string {
  const soortClauses = ALL_SOORTEN.map((s) => `Soort eq '${s}'`).join(' or ');
  const filterStr = [
    'Verwijderd eq false',
    `Datum ge ${dateFrom}T00:00:00Z`,
    `Datum le ${dateTo}T23:59:59Z`,
    `(${soortClauses})`,
  ].join(' and ');

  // Encode but restore OData-safe chars (mirrors tk.client.ts quirk)
  const encodedFilter = encodeURIComponent(filterStr)
    .replace(/%28/g, '(')
    .replace(/%29/g, ')')
    .replace(/%20/g, ' ')
    .replace(/%3D/g, '=')
    .replace(/%27/g, "'")
    .replace(/%2C/g, ',')
    .replace(/%3A/g, ':'); // colons in ISO date literals

  return (
    `${config.pa.tkApiBase}/Activiteit` +
    `?$orderby=Datum asc` +
    `&$top=${PAGE_SIZE}` +
    `&$skip=${skip}` +
    `&$select=Id,Soort,Nummer,Onderwerp,Datum,Status,VoortouwCommissieNaam` +
    `&$filter=${encodedFilter}`
  );
}

function cacheKey(dateFrom: string, dateTo: string): string {
  const raw = `agenda|${dateFrom}|${dateTo}`;
  return 'agenda:' + createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function fetchAgenda(dateFrom: string, dateTo: string): Promise<PlenaryItem[]> {
  const key = cacheKey(dateFrom, dateTo);
  const cached = await cacheGet<PlenaryItem[]>(key);
  if (cached) return cached;

  logger.info('Agenda fetch', { dateFrom, dateTo });

  // Paginate: TK API caps at 100 per page; loop until a short page signals end.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  const raw: Record<string, unknown>[] = [];
  try {
    let skip = 0;
    while (raw.length < MAX_ITEMS) {
      const url = buildPageUrl(dateFrom, dateTo, skip);
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`TK Agenda API ${res.status} (skip=${skip})`);
      const page = ((await res.json()) as Record<string, unknown>)['value'] as Record<
        string,
        unknown
      >[];
      raw.push(...(page ?? []));
      if ((page?.length ?? 0) < PAGE_SIZE) break; // last page
      skip += PAGE_SIZE;
    }
    clearTimeout(timer);
  } catch (err) {
    clearTimeout(timer);
    logger.error('Agenda API error', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  const items = normalise(raw);
  await cacheSet(key, items, config.pa.cacheTtlAgenda);
  return items;
}
