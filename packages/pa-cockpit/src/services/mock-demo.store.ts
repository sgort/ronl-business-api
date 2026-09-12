/**
 * Persisted demo state for mock mode — signals and saved searches.
 *
 * Mock mode used to read the fixtures directly, so nothing you did in it stuck:
 * confirming a signal returned a new object that nobody stored, and every
 * saved-search write was a plain `return;`. The next read re-derived from the
 * unchanged fixture, so rail badges sprang back and Zoekcriteria was read-only.
 * This module is the missing store — seeded from the fixtures, mutated by the
 * same actions live uses, and persisted so a demo survives navigation and
 * reloads.
 *
 * It never touches the backend. Mock data is entirely frontend-side, which is
 * what makes "reset demo data" safe to offer: the reset cannot reach the
 * database, because this code path has no way to.
 *
 * Persisted state is stamped with the build's version and discarded when that
 * changes. Reset means "back to the defaults of the deployed version", so a
 * deployment carrying new fixtures must win over a browser holding a copy of the
 * previous ones — otherwise a demo machine would quietly keep serving whatever
 * it first cached.
 */

import type { Signal } from '@ronl/shared';
// Type-only, so this does not create a runtime cycle with pa.api (which imports
// the values below).
import type { SavedSearch } from './pa.api';

const KEY = 'paV2.mock.demo';

interface Persisted {
  /** The build that seeded this state; a different one invalidates it. */
  v: string;
  signals?: Signal[];
  searches?: SavedSearch[];
  /** Notification ids already acknowledged; the notifications themselves are
   *  derived from signals + searches rather than stored. */
  seenNotifications?: string[];
}

/** Vite injects this from packages/frontend/package.json; absent under tests. */
function buildVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

let loaded = false;
let persisted: Persisted = { v: buildVersion() };
let signalsCache: Signal[] | null = null;
let searchesCache: SavedSearch[] | null = null;
let seenCache: string[] | null = null;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Persisted;
    // A stamp from an older build means the fixtures may have moved on.
    if (parsed.v !== buildVersion()) return;
    if (Array.isArray(parsed.signals)) persisted.signals = parsed.signals;
    if (Array.isArray(parsed.searches)) persisted.searches = parsed.searches;
    if (Array.isArray(parsed.seenNotifications))
      persisted.seenNotifications = parsed.seenNotifications;
  } catch {
    // Unavailable or corrupt storage is not an error here — reseed from fixtures.
  }
}

/**
 * Write both slices back.
 *
 * A slice that has been neither seeded nor loaded is left out of the payload
 * rather than written as an empty array — persisting `[]` would look like "the
 * demo has no searches" on the next load instead of "seed them from fixtures".
 */
function persist(): void {
  const payload: Persisted = { v: buildVersion() };
  const signals = signalsCache ?? persisted.signals;
  const searches = searchesCache ?? persisted.searches;
  const seen = seenCache ?? persisted.seenNotifications;
  if (signals) payload.signals = signals;
  if (searches) payload.searches = searches;
  if (seen) payload.seenNotifications = seen;
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable — the in-memory cache still carries the session */
  }
}

/**
 * The demo's signals, seeded on first use.
 *
 * `seed` is passed in rather than imported so this module stays independent of
 * pa.api, which owns the fixtures and already imports from here.
 */
export function mockSignals(seed: () => Signal[]): Signal[] {
  load();
  if (!signalsCache) signalsCache = persisted.signals ?? seed();
  return signalsCache;
}

/** Persist a mutated set — call after any change to what mockSignals returned. */
export function saveMockSignals(next: Signal[]): void {
  signalsCache = next;
  persist();
}

/** The demo's saved searches, seeded on first use. */
export function mockSearches(seed: () => SavedSearch[]): SavedSearch[] {
  load();
  if (!searchesCache) searchesCache = persisted.searches ?? seed();
  return searchesCache;
}

/** Persist a mutated set — call after any change to what mockSearches returned. */
export function saveMockSearches(next: SavedSearch[]): void {
  searchesCache = next;
  persist();
}

/** Notification ids the demo has acknowledged. */
export function seenNotificationIds(): string[] {
  load();
  return seenCache ?? persisted.seenNotifications ?? [];
}

export function saveSeenNotificationIds(next: string[]): void {
  seenCache = next;
  persist();
}

/**
 * Drop everything and fall back to the fixtures of the running build.
 *
 * Exposed in the Dossierbeheer banner, in mock mode only. Callers are expected
 * to reset the dossier store too — see resetMockDossiers in dossierbeheer.api.
 */
export function resetMockDemoData(): void {
  loaded = false;
  persisted = { v: buildVersion() };
  signalsCache = null;
  searchesCache = null;
  seenCache = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing persisted to clear */
  }
}
