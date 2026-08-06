# Public Search Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, unauthenticated search site (`packages/public-site`) that surfaces the six caseworker "Zoeken" sections (Berichten, Nieuws, Producten & Diensten, Regelcatalogus, Procesbibliotheek, Gegevenswoordenboek) via new anonymous `/v1/public/*` backend endpoints, with federated search, prerendered detail pages, WCAG 2.1 AA accessibility, and no auth/telemetry code in the bundle.

**Architecture:** New package `packages/public-site` (Vite + React 18 + TS + react-router-dom, no Tailwind/Keycloak/MSAL) consumes new/extended `/v1/public/*` routes on the existing `packages/backend`. A server-side federated index (`search.service.ts`) aggregates the five real content sources (berichten, nieuws, producten-diensten, regelcatalogus services, LDE process bundles) into one cached, searchable in-memory index — replacing the prototype's browser-side `pubSearch`. The rule catalogue and its Concepts tab are served straight from the existing `/v1/public/regelcatalogus` response (no separate begrippen endpoint). The data dictionary is a pure Skosmos iframe embed with no backend involvement.

**Tech Stack:** Express (existing `packages/backend`) + axios; Vite, React 18, TypeScript, react-router-dom, Vitest + Testing Library, Playwright + `@axe-core/playwright`.

## Global Constraints

- UI copy is Dutch with an English toggle; code/comments/docs are English (per `publiek-handoff/CLAUDE-CODE-PROMPT.md` header note).
- `packages/public-site` runs with `npm run dev -w public-site` on port **5175**.
- No `@azure/msal`, no `keycloak-js`, no Tailwind in `public-site`. Plain CSS only (`src/styles/pub.css`), ported from `publiek-handoff/pub.css`.
- All content is fetched from `/v1/public/*` at request time (dev/runtime) or build time (prerender) — **no mock data** in the shipped build.
- Query state (`q`, `soort`, `bron`, `doelgroep`, `sort`) lives in the URL, never only in component state.
- Facet counts are computed on the query **before** the facet's own filter is applied (matches `base` in the prototype).
- Highlighting uses `<mark>` via split-into-React-nodes, never `dangerouslySetInnerHTML`.
- `/v1/public/*` read endpoints are `GET`-only and require no auth header; the existing write endpoints (`use-case`, `upload-file`, `feedback`, `altcha/challenge`) are the sole, intentional exceptions and are out of scope for this plan.
- Rijkshuisstijl tokens (`--ro-blue #154273`, `--ro-link #01689b`, `--ro-focus #f9e11e`, etc.) are defined once in `pub.css` — don't hardcode hex values in components.
- Backend path aliases: `@utils/*`, `@services/*`, `@routes/*` (see `packages/backend/tsconfig.json` / `jest.config.js`). Frontend has no path aliases — relative imports only, matching `packages/frontend`.
- **Deviation from `publiek-handoff/CLAUDE-CODE-PROMPT.md` §7:** the DoD's `search.test.ts` (empty query returns everything, facet counts correct, two-type filter adds up, regex metacharacters don't crash) is implemented and tested against `packages/backend/src/services/search.service.ts`, not in `public-site/src`. The federated index and its search/facet logic are server-side by design (ARCHITECTURE.md: "the federated search index belongs server-side... that does not scale past a few hundred items [client-side]"), so the pure, testable search function lives where the index lives. `public-site/src/lib/search.test.tsx` instead covers the frontend's own logic: URL query-state parsing/building and highlight-node splitting.
- **Scope reduction, documented:** the prototype's `begrip` (concept) type is **not** a first-class searchable/detail type in production. `ARCHITECTURE.md`'s "Decided" section treats the data dictionary as embed-only and explicitly excludes it from the sitemap ("Skosmos indexes itself"); the Regelcatalogus **Concepts** tab already gets its data straight from `/v1/public/regelcatalogus`'s `concepts` array, with every row linking out to Skosmos — there is no local concept detail page, matching the prototype's own `PubBegrippenTab` (no `go({view:'detail'...})` call for concepts). `PUB_TYPES` in production is `['bericht', 'nieuws', 'product', 'regel', 'proces']` — five, not six.
- Process-library visibility: only `ProcessBundle`s with `status === 'active'` and `boardOwner` unset or `'caseworker'` are exposed publicly (excludes internal `infra-board`/`public-affairs` deployments and non-active drafts/examples). This is a product decision baked into `lde.service.ts` as an explicit allow-list (`PUBLIC_PROCESS_BOARDS`) — flag for sign-off before this goes to production, it does not block building or testing it.

---

## Phase 1 — Backend: `/v1/public/*` additions

### Task 1: Slug utility

**Files:**

- Create: `packages/backend/src/utils/slug.ts`
- Test: `packages/backend/src/utils/slug.test.ts`

**Interfaces:**

- Produces: `slugify(input: string): string` — used by Task 3 (`search.service.ts`) to derive stable, URL-safe identifiers for rule-catalogue services (which have no natural short id).

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/utils/slug.test.ts
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Zorgtoeslag')).toBe('zorgtoeslag');
    expect(slugify('Investeringssubsidie duurzame energie')).toBe(
      'investeringssubsidie-duurzame-energie'
    );
  });

  it('strips non-alphanumerics and collapses runs of separators', () => {
    expect(slugify('Regeling bekostiging vo-scholen (2026)')).toBe(
      'regeling-bekostiging-vo-scholen-2026'
    );
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  -- Tree felling? --  ')).toBe('tree-felling');
  });

  it('caps length at 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long)).toHaveLength(64);
  });

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/backend -- slug.test.ts`
Expected: FAIL with "Cannot find module './slug'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/utils/slug.ts

/**
 * URL-safe slug for public detail routes. Deterministic and pure — used
 * both when building the federated search index and when resolving a
 * `:slug` route param back to an item, so the two must never drift.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, ''); // slice() can leave a trailing hyphen
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/backend -- slug.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/utils/slug.ts packages/backend/src/utils/slug.test.ts
git commit -m "feat(backend): add slugify util for public detail routes"
```

### Task 2: LDE process-library proxy (`lde.service.ts`)

**Files:**

- Create: `packages/backend/src/services/lde.service.ts`
- Test: `packages/backend/src/services/lde.service.test.ts`
- Modify: `packages/backend/src/utils/config.ts` — add `lde: { apiUrl: string }`

**Interfaces:**

- Consumes: none beyond `axios`, `@utils/config`, `@utils/logger`.
- Produces: `PublicProcess` type and `getPublicProcesses(forceRefresh?: boolean): Promise<PublicProcess[]>`, `getPublicProcessByKey(key: string, forceRefresh?: boolean): Promise<PublicProcess | null>` — consumed by Task 4 (routes) and Task 3 (federated index).

- [ ] **Step 1: Add LDE config**

In `packages/backend/src/utils/config.ts`, add to the `Config` interface (near the `gitlab` block, e.g. after line 119's closing `};`):

```ts
lde: {
  apiUrl: string;
}
```

And to the `config` object (near the `gitlab: {...}` block, e.g. after its closing `},`):

```ts
  lde: {
    apiUrl: process.env.LDE_API_URL || 'https://acc.backend.linkeddata.open-regels.nl/v1',
  },
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/backend/src/services/lde.service.test.ts
/**
 * Unit tests for lde.service — proxies LDE's public process-bundle list,
 * filters to publicly-visible bundles, maps to the PublicProcess shape,
 * and caches for 5 minutes. axios is mocked; the module is re-required per
 * test to reset its module-level cache.
 */

const mockAxios = { get: jest.fn() };
jest.mock('axios', () => ({ __esModule: true, default: mockAxios }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('@utils/config', () => ({
  config: { lde: { apiUrl: 'https://lde.test/v1' } },
}));

type Mod = typeof import('./lde.service');

function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./lde.service');
  });
  return mod;
}

const activeCaseworkerBundle = {
  id: 'b1',
  bpmnProcessId: 'zorgtoeslag-process',
  name: 'Zorgtoeslag',
  description: 'Aanvraag zorgtoeslag',
  processRole: 'main',
  status: 'active',
  boardOwner: 'caseworker',
  deployedAt: '2026-06-01T00:00:00.000Z',
  operatonUrl: 'https://operaton.test',
  operatonDeploymentId: 'dep-1',
  linkedDmnTemplates: ['dmn-1'],
  deployedForms: [{ id: 'f1', name: 'Aanvraagformulier' }],
  deployedDocuments: [{ id: 'd1', name: 'Beschikking' }],
  subprocesses: [],
};
const activeUntaggedBundle = {
  ...activeCaseworkerBundle,
  id: 'b2',
  bpmnProcessId: 'untagged',
  boardOwner: undefined,
};
const activeInfraBundle = {
  ...activeCaseworkerBundle,
  id: 'b3',
  bpmnProcessId: 'infra-x',
  boardOwner: 'infra-board',
};
const draftBundle = {
  ...activeCaseworkerBundle,
  id: 'b4',
  bpmnProcessId: 'draft-x',
  status: 'draft',
};

let getPublicProcesses: Mod['getPublicProcesses'];
let getPublicProcessByKey: Mod['getPublicProcessByKey'];
beforeEach(() => {
  jest.clearAllMocks();
  ({ getPublicProcesses, getPublicProcessByKey } = freshModule());
});

describe('getPublicProcesses', () => {
  it('fetches, filters to active + caseworker/untagged, and maps fields', async () => {
    mockAxios.get.mockResolvedValue({
      data: {
        success: true,
        data: [activeCaseworkerBundle, activeUntaggedBundle, activeInfraBundle, draftBundle],
      },
    });
    const items = await getPublicProcesses();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.key).sort()).toEqual(['untagged', 'zorgtoeslag-process']);
    expect(items[0]).toMatchObject({
      key: 'zorgtoeslag-process',
      naam: 'Zorgtoeslag',
      beschrijving: 'Aanvraag zorgtoeslag',
      gepubliceerd: '2026-06-01T00:00:00.000Z',
      status: 'active',
    });
    expect(items[0].forms).toEqual([{ id: 'f1', name: 'Aanvraagformulier' }]);
  });

  it('caches for 5 minutes', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [activeCaseworkerBundle] } });
    await getPublicProcesses();
    await getPublicProcesses();
    expect(mockAxios.get).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh bypasses the cache', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [activeCaseworkerBundle] } });
    await getPublicProcesses();
    await getPublicProcesses(true);
    expect(mockAxios.get).toHaveBeenCalledTimes(2);
  });

  it('returns stale cache on fetch failure, or empty array if never cached', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('down'));
    expect(await getPublicProcesses()).toEqual([]);

    mockAxios.get.mockResolvedValueOnce({
      data: { success: true, data: [activeCaseworkerBundle] },
    });
    await getPublicProcesses();
    mockAxios.get.mockRejectedValueOnce(new Error('down again'));
    const stale = await getPublicProcesses(true);
    expect(stale).toHaveLength(1);
  });
});

describe('getPublicProcessByKey', () => {
  it('finds a publicly-visible bundle by its bpmnProcessId', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [activeCaseworkerBundle] } });
    const item = await getPublicProcessByKey('zorgtoeslag-process');
    expect(item?.naam).toBe('Zorgtoeslag');
  });

  it('returns null when not found or not publicly visible', async () => {
    mockAxios.get.mockResolvedValue({ data: { success: true, data: [activeInfraBundle] } });
    expect(await getPublicProcessByKey('infra-x')).toBeNull();
    expect(await getPublicProcessByKey('nope')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/backend -- lde.service.test.ts`
Expected: FAIL with "Cannot find module './lde.service'"

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/backend/src/services/lde.service.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/backend -- lde.service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/services/lde.service.ts packages/backend/src/services/lde.service.test.ts packages/backend/src/utils/config.ts
git commit -m "feat(backend): add lde.service proxy for public process bundles"
```

### Task 3: Federated search index (`search.service.ts`)

**Files:**

- Create: `packages/backend/src/services/search.service.ts`
- Test: `packages/backend/src/services/search.service.test.ts`

**Interfaces:**

- Consumes: `getNieuwsItems` (`@services/nieuws.service`), `getBerichtenItems` (`@services/berichten.service`), `getProductenDienstenItems` (`@services/productenDiensten.service`), `getRegelcatalogusData` (`@services/regelcatalogus.service`), `getPublicProcesses` (`@services/lde.service`, Task 2), `slugify` (`@utils/slug`, Task 1).
- Produces: `PublicItemType`, `PublicIndexItem` types; `getPublicIndex(forceRefresh?: boolean): Promise<PublicIndexItem[]>`; `searchPublicIndex(index: PublicIndexItem[], q: string, filters: PublicSearchFilters): PublicIndexItem[]`; `facetCounts(index: PublicIndexItem[], getter: (item: PublicIndexItem) => string | string[] | null | undefined): [string, number][]`; `getPublicItemBySlug(index: PublicIndexItem[], type: PublicItemType, slug: string): PublicIndexItem | undefined`. Consumed by Task 5 (routes).

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/services/search.service.test.ts
/**
 * Unit tests for search.service — federates the five public content sources
 * into one cached index, and provides the pure search/facet/lookup functions
 * the /v1/public/zoeken and per-type detail routes are built on.
 *
 * Every source service is mocked; the module is re-required per test to
 * reset its module-level cache.
 */

jest.mock('@services/nieuws.service', () => ({ getNieuwsItems: jest.fn() }));
jest.mock('@services/berichten.service', () => ({ getBerichtenItems: jest.fn() }));
jest.mock('@services/productenDiensten.service', () => ({ getProductenDienstenItems: jest.fn() }));
jest.mock('@services/regelcatalogus.service', () => ({ getRegelcatalogusData: jest.fn() }));
jest.mock('@services/lde.service', () => ({ getPublicProcesses: jest.fn() }));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import { getNieuwsItems } from '@services/nieuws.service';
import { getBerichtenItems } from '@services/berichten.service';
import { getProductenDienstenItems } from '@services/productenDiensten.service';
import { getRegelcatalogusData } from '@services/regelcatalogus.service';
import { getPublicProcesses } from '@services/lde.service';

type Mod = typeof import('./search.service');
function freshModule(): Mod {
  let mod!: Mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./search.service');
  });
  return mod;
}

const m = {
  nieuws: getNieuwsItems as jest.Mock,
  berichten: getBerichtenItems as jest.Mock,
  producten: getProductenDienstenItems as jest.Mock,
  regels: getRegelcatalogusData as jest.Mock,
  processen: getPublicProcesses as jest.Mock,
};

function mockAllEmpty() {
  m.nieuws.mockResolvedValue({ items: [], total: 0 });
  m.berichten.mockResolvedValue({ items: [], total: 0 });
  m.producten.mockResolvedValue({ items: [], total: 0 });
  m.regels.mockResolvedValue({ services: [], organizations: [], concepts: [], rules: [] });
  m.processen.mockResolvedValue([]);
}

let search: Mod;
beforeEach(() => {
  jest.clearAllMocks();
  mockAllEmpty();
  search = freshModule();
});

describe('getPublicIndex', () => {
  it('maps berichten, nieuws and producten into PublicIndexItem', async () => {
    m.berichten.mockResolvedValue({
      items: [
        {
          id: 'b1',
          subject: 'Wegwerkzaamheden N23',
          preview: 'De weg is dicht.',
          content: null,
          type: 'announcement',
          status: 'published',
          audience: 'all',
          sender: { id: 'flevoland', name: 'Provincie Flevoland' },
          publishedAt: '2026-07-01T00:00:00.000Z',
          expiresAt: null,
          priority: 'normal',
          isRead: false,
          action: null,
        },
      ],
      total: 1,
    });
    m.nieuws.mockResolvedValue({
      items: [
        {
          id: 'n1',
          title: 'Kabinet stelt regels bij',
          summary: 'Nieuwe regels per 2027.',
          category: 'beleid',
          publishedAt: '2026-07-02T00:00:00.000Z',
          url: 'https://rijksoverheid.nl/n1',
          source: { id: 'government', name: 'Rijksoverheid' },
        },
      ],
      total: 1,
    });
    m.producten.mockResolvedValue({
      items: [
        {
          id: 'p1',
          title: 'Omgevingsvergunning kappen',
          description: 'Vergunning voor het kappen van bomen.',
          url: 'https://flevoland.nl/p1',
          audience: ['particulier'],
          onlineAanvragen: true,
          modified: '2026-06-15T00:00:00.000Z',
          soort: 'vergunning',
        },
      ],
      total: 1,
    });

    const index = await search.getPublicIndex();
    expect(index).toHaveLength(3);

    const bericht = index.find((i) => i.type === 'bericht')!;
    expect(bericht).toMatchObject({
      slug: 'b1',
      title: 'Wegwerkzaamheden N23',
      org: 'Provincie Flevoland',
    });

    const nieuws = index.find((i) => i.type === 'nieuws')!;
    expect(nieuws).toMatchObject({
      slug: 'n1',
      title: 'Kabinet stelt regels bij',
      org: 'Rijksoverheid',
    });

    const product = index.find((i) => i.type === 'product')!;
    expect(product).toMatchObject({
      slug: 'p1',
      title: 'Omgevingsvergunning kappen',
      audience: ['Inwoner'],
    });
  });

  it('maps regelcatalogus services into regel items, joining org/rules/concepts by title', async () => {
    m.regels.mockResolvedValue({
      services: [{ uri: 'svc:1', title: 'Zorgtoeslag', description: 'Zorgtoeslag aanvragen' }],
      organizations: [
        {
          uri: 'org:1',
          identifier: '1',
          name: 'Belastingdienst',
          homepage: 'https://belastingdienst.nl',
          logo: null,
          services: [{ uri: 'svc:1', title: 'Zorgtoeslag' }],
        },
      ],
      concepts: [
        {
          uri: 'c:1',
          prefLabel: 'Toetsingsinkomen',
          exactMatch: null,
          serviceUri: 'svc:1',
          serviceTitle: 'Zorgtoeslag',
        },
      ],
      rules: [
        {
          serviceTitle: 'Zorgtoeslag',
          ruleTitle: 'Recht op zorgtoeslag',
          validFrom: '2026-01-01',
          confidence: 'high',
          description: null,
        },
      ],
    });

    const index = await search.getPublicIndex();
    const regel = index.find((i) => i.type === 'regel')!;
    expect(regel.slug).toBe('zorgtoeslag');
    expect(regel.org).toBe('Belastingdienst');
    expect(regel.ruleCount).toBe(1);
    expect(regel.rules).toEqual([{ naam: 'Recht op zorgtoeslag', geldig: '2026-01-01' }]);
    expect(regel.begrippen).toEqual(['Toetsingsinkomen']);
  });

  it('a service with zero rules still appears (empty rules array, ruleCount 0)', async () => {
    m.regels.mockResolvedValue({
      services: [{ uri: 'svc:2', title: 'Geen regels', description: '' }],
      organizations: [],
      concepts: [],
      rules: [],
    });
    const index = await search.getPublicIndex();
    const regel = index.find((i) => i.type === 'regel')!;
    expect(regel.ruleCount).toBe(0);
    expect(regel.rules).toEqual([]);
  });

  it('maps public processes into proces items', async () => {
    m.processen.mockResolvedValue([
      {
        key: 'zorgtoeslag-process',
        naam: 'Zorgtoeslag',
        beschrijving: 'Aanvraagproces',
        gepubliceerd: '2026-06-01T00:00:00.000Z',
        status: 'active',
        forms: [{ id: 'f1', name: 'Formulier' }],
        documents: [],
        subprocesses: [],
      },
    ]);
    const index = await search.getPublicIndex();
    const proces = index.find((i) => i.type === 'proces')!;
    expect(proces.slug).toBe('zorgtoeslag-process');
    expect(proces.forms).toEqual([{ id: 'f1', name: 'Formulier' }]);
  });

  it('caches for 5 minutes and forceRefresh bypasses it', async () => {
    await search.getPublicIndex();
    await search.getPublicIndex();
    expect(m.nieuws).toHaveBeenCalledTimes(1);
    await search.getPublicIndex(true);
    expect(m.nieuws).toHaveBeenCalledTimes(2);
  });
});

describe('searchPublicIndex', () => {
  const index = [
    {
      id: 'a',
      slug: 'a',
      type: 'regel',
      title: 'Zorgtoeslag',
      summary: 'Toeslag voor zorgkosten',
      org: 'Belastingdienst',
      date: null,
      audience: ['Inwoner'],
      external: null,
      facts: [],
      tech: [],
    },
    {
      id: 'b',
      slug: 'b',
      type: 'product',
      title: 'Kapvergunning',
      summary: 'Bomen kappen',
      org: 'Provincie Flevoland',
      date: null,
      audience: ['Inwoner', 'Ondernemer'],
      external: null,
      facts: [],
      tech: [],
    },
    {
      id: 'c',
      slug: 'c',
      type: 'nieuws',
      title: 'Kabinet nieuws',
      summary: 'Landelijk beleid',
      org: 'Rijksoverheid',
      date: '2026-01-01',
      audience: ['Inwoner'],
      external: null,
      facts: [],
      tech: [],
    },
  ] as import('./search.service').PublicIndexItem[];

  it('an empty query returns everything', () => {
    expect(search.searchPublicIndex(index, '', {})).toHaveLength(3);
  });

  it('matches by title and summary, case-insensitively', () => {
    const hits = search.searchPublicIndex(index, 'zorgtoeslag', {});
    expect(hits.map((h) => h.id)).toEqual(['a']);
  });

  it('filtering on two types adds up to their combined count', () => {
    const hits = search.searchPublicIndex(index, '', { types: ['regel', 'product'] });
    expect(hits).toHaveLength(2);
  });

  it('filters by org and audience', () => {
    expect(search.searchPublicIndex(index, '', { orgs: ['Rijksoverheid'] })).toHaveLength(1);
    expect(search.searchPublicIndex(index, '', { audience: ['Ondernemer'] })).toHaveLength(1);
  });

  it('regex metacharacters in the query do not crash', () => {
    expect(() => search.searchPublicIndex(index, '.*+?^${}()|[]\\', {})).not.toThrow();
    expect(search.searchPublicIndex(index, '.*+?^${}()|[]\\', {})).toEqual([]);
  });

  it('sorts by az, date, or relevance', () => {
    const az = search.searchPublicIndex(index, '', { sort: 'az' });
    expect(az.map((h) => h.id)).toEqual(['b', 'c', 'a']); // Kapvergunning, Kabinet nieuws, Zorgtoeslag
    const byDate = search.searchPublicIndex(index, '', { sort: 'date' });
    expect(byDate[0].id).toBe('c'); // only item with a date sorts first
  });
});

describe('facetCounts', () => {
  it('counts occurrences and sorts descending', () => {
    const index = [
      { org: 'A' },
      { org: 'A' },
      { org: 'B' },
    ] as unknown as import('./search.service').PublicIndexItem[];
    expect(search.facetCounts(index, (i) => i.org)).toEqual([
      ['A', 2],
      ['B', 1],
    ]);
  });

  it('flattens array-valued getters (e.g. audience)', () => {
    const index = [
      { audience: ['Inwoner', 'Ondernemer'] },
      { audience: ['Inwoner'] },
    ] as unknown as import('./search.service').PublicIndexItem[];
    expect(search.facetCounts(index, (i) => i.audience)).toEqual([
      ['Inwoner', 2],
      ['Ondernemer', 1],
    ]);
  });
});

describe('getPublicItemBySlug', () => {
  it('finds an item by type + slug', async () => {
    m.regels.mockResolvedValue({
      services: [{ uri: 'svc:1', title: 'Zorgtoeslag', description: '' }],
      organizations: [],
      concepts: [],
      rules: [],
    });
    const index = await search.getPublicIndex();
    expect(search.getPublicItemBySlug(index, 'regel', 'zorgtoeslag')?.title).toBe('Zorgtoeslag');
    expect(search.getPublicItemBySlug(index, 'regel', 'nope')).toBeUndefined();
    expect(search.getPublicItemBySlug(index, 'product', 'zorgtoeslag')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/backend -- search.service.test.ts`
Expected: FAIL with "Cannot find module './search.service'"

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/backend/src/services/search.service.ts
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
  else if (filters.sort === 'date') rows.sort((a, b) => (b.it.date ? 1 : 0) - (a.it.date ? 1 : 0));
  else rows.sort((a, b) => b.score - a.score);

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/backend -- search.service.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/search.service.ts packages/backend/src/services/search.service.test.ts
git commit -m "feat(backend): add federated public search index (search.service)"
```

### Task 4: New routes — `/processen`, `/zoeken`, per-type `:slug` detail routes

**Files:**

- Modify: `packages/backend/src/routes/public.routes.ts`
- Modify: `packages/backend/src/routes/public.routes.test.ts`

**Interfaces:**

- Consumes: `getPublicProcesses`, `getPublicProcessByKey` (Task 2), `getPublicIndex`, `searchPublicIndex`, `facetCounts`, `getPublicItemBySlug` (Task 3).
- Produces: `GET /v1/public/processen`, `GET /v1/public/processen/:key`, `GET /v1/public/zoeken`, `GET /v1/public/nieuws/:slug`, `GET /v1/public/producten/:slug`, `GET /v1/public/regels/:slug` — consumed by `public-site`'s `lib/api.ts` (Phase 2, Task 10).

- [ ] **Step 1: Write the failing tests**

Add to `packages/backend/src/routes/public.routes.test.ts`, alongside the existing mocks at the top of the file:

```ts
jest.mock('@services/lde.service', () => ({
  getPublicProcesses: jest.fn(),
  getPublicProcessByKey: jest.fn(),
}));
jest.mock('@services/search.service', () => ({
  getPublicIndex: jest.fn(),
  searchPublicIndex: jest.fn(),
  facetCounts: jest.fn(),
  getPublicItemBySlug: jest.fn(),
}));
```

and to the `m` object:

```ts
import { getPublicProcesses, getPublicProcessByKey } from '@services/lde.service';
import {
  getPublicIndex,
  searchPublicIndex,
  facetCounts,
  getPublicItemBySlug,
} from '@services/search.service';

// ...inside the existing `const m = { ... }` object, add:
  processenList: getPublicProcesses as jest.Mock,
  processByKey: getPublicProcessByKey as jest.Mock,
  index: getPublicIndex as jest.Mock,
  doSearch: searchPublicIndex as jest.Mock,
  facets: facetCounts as jest.Mock,
  bySlug: getPublicItemBySlug as jest.Mock,
```

Then append new `describe` blocks at the end of the file, before the final closing:

```ts
describe('GET /processen', () => {
  it('returns the public process list', async () => {
    m.processenList.mockResolvedValue([{ key: 'zorgtoeslag-process', naam: 'Zorgtoeslag' }]);
    const res = await request(app).get('/v1/public/processen');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ key: 'zorgtoeslag-process', naam: 'Zorgtoeslag' }]);
  });

  it('500 on failure', async () => {
    m.processenList.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/processen')).status).toBe(500);
  });
});

describe('GET /processen/:key', () => {
  it('returns a process or 404', async () => {
    m.processByKey.mockResolvedValueOnce({ key: 'zorgtoeslag-process', naam: 'Zorgtoeslag' });
    expect((await request(app).get('/v1/public/processen/zorgtoeslag-process')).status).toBe(200);
    m.processByKey.mockResolvedValueOnce(null);
    const res = await request(app).get('/v1/public/processen/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROCES_NOT_FOUND');
  });
});

describe('GET /zoeken', () => {
  it('returns hits + facets computed on the base (pre-facet-filter) query', async () => {
    const indexed = [{ id: 'a', type: 'regel', org: 'X', audience: ['Inwoner'] }];
    m.index.mockResolvedValue(indexed);
    m.doSearch.mockReturnValue(indexed);
    m.facets.mockReturnValue([['X', 1]]);

    const res = await request(app).get('/v1/public/zoeken?q=zorg&soort=regel');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual(indexed);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.facets).toHaveProperty('soort');
    expect(res.body.data.facets).toHaveProperty('bron');
    expect(res.body.data.facets).toHaveProperty('doelgroep');
    // facets are computed on the query WITHOUT the facet filters (base), called twice:
    // once for hits (with filters) and once for facets (sort-only)
    expect(m.doSearch).toHaveBeenCalledWith(indexed, 'zorg', { sort: undefined });
    expect(m.doSearch).toHaveBeenCalledWith(indexed, 'zorg', {
      types: ['regel'],
      orgs: undefined,
      audience: undefined,
      sort: undefined,
    });
  });

  it('500 on failure', async () => {
    m.index.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/zoeken')).status).toBe(500);
  });
});

describe('GET /nieuws/:slug, /producten/:slug, /regels/:slug', () => {
  it('returns the item when found', async () => {
    m.index.mockResolvedValue([]);
    m.bySlug.mockReturnValue({ id: 'nieuws-n1', slug: 'n1', type: 'nieuws', title: 'X' });
    const res = await request(app).get('/v1/public/nieuws/n1');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('X');
  });

  it('404 when not found', async () => {
    m.index.mockResolvedValue([]);
    m.bySlug.mockReturnValue(undefined);
    const res = await request(app).get('/v1/public/regels/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ITEM_NOT_FOUND');
  });

  it('500 on failure', async () => {
    m.index.mockRejectedValue(new Error('down'));
    expect((await request(app).get('/v1/public/producten/x')).status).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=@ronl/backend -- public.routes.test.ts`
Expected: FAIL — new routes don't exist yet (404s / undefined body)

- [ ] **Step 3: Add the routes**

In `packages/backend/src/routes/public.routes.ts`, add imports near the top (alongside the existing service imports):

```ts
import { getPublicProcesses, getPublicProcessByKey } from '@services/lde.service';
import {
  getPublicIndex,
  searchPublicIndex,
  facetCounts,
  getPublicItemBySlug,
  PublicItemType,
} from '@services/search.service';
```

Add the new route handlers after the existing `/regelcatalogus` route (before the `/use-case` POST route):

```ts
/**
 * GET /v1/public/processen
 * Publicly-visible deployed BPMN processes (Camunda deployment index via LDE).
 * No authentication required. Cached 5 minutes server-side.
 */
router.get('/processen', async (_req: Request, res: Response) => {
  try {
    const items = await getPublicProcesses();
    res.json({ success: true, data: items, meta: meta() });
  } catch (error) {
    logger.error('Failed to serve processen', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'PROCESSEN_FETCH_FAILED', message: 'Processen konden niet worden opgehaald.' },
    });
  }
});

/**
 * GET /v1/public/processen/:key
 */
router.get('/processen/:key', async (req: Request, res: Response) => {
  try {
    const item = await getPublicProcessByKey(req.params.key);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: { code: 'PROCES_NOT_FOUND', message: 'Proces niet gevonden.' },
      });
    }
    res.json({ success: true, data: item, meta: meta() });
  } catch (error) {
    logger.error('Failed to serve proces detail', {
      key: req.params.key,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'PROCES_FETCH_FAILED', message: 'Proces kon niet worden opgehaald.' },
    });
  }
});

/**
 * GET /v1/public/zoeken?q=&soort=&bron=&doelgroep=&sort=
 * Federated search across berichten, nieuws, producten, regels and processen.
 * Facet counts reflect the query WITHOUT that facet's own filter applied,
 * so checking a box never makes its own count disappear.
 */
router.get('/zoeken', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '');
  const csv = (v: unknown) => (typeof v === 'string' && v ? v.split(',') : undefined);
  const types = csv(req.query.soort);
  const orgs = csv(req.query.bron);
  const audience = csv(req.query.doelgroep);
  const sort = (req.query.sort as 'rel' | 'date' | 'az' | undefined) ?? undefined;

  try {
    const index = await getPublicIndex();
    const base = searchPublicIndex(index, q, { sort });
    const hits = searchPublicIndex(index, q, { types, orgs, audience, sort });

    res.json({
      success: true,
      data: {
        items: hits.slice(0, 50),
        total: hits.length,
        facets: {
          soort: facetCounts(base, (i) => i.type),
          bron: facetCounts(base, (i) => i.org),
          doelgroep: facetCounts(base, (i) => i.audience),
        },
      },
      meta: meta(),
    });
  } catch (error) {
    logger.error('Failed to serve zoeken', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: { code: 'ZOEKEN_FAILED', message: 'Zoeken is mislukt.' },
    });
  }
});

/**
 * Shared handler for the per-type `:slug` detail routes below — every
 * detail item is resolved through the same federated index so the count and
 * the list it came from can never drift apart.
 */
function detailBySlug(type: PublicItemType) {
  return async (req: Request, res: Response) => {
    try {
      const index = await getPublicIndex();
      const item = getPublicItemBySlug(index, type, req.params.slug);
      if (!item) {
        return res.status(404).json({
          success: false,
          error: { code: 'ITEM_NOT_FOUND', message: 'Item niet gevonden.' },
        });
      }
      res.json({ success: true, data: item, meta: meta() });
    } catch (error) {
      logger.error('Failed to serve item detail', {
        type,
        slug: req.params.slug,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: { code: 'ITEM_FETCH_FAILED', message: 'Item kon niet worden opgehaald.' },
      });
    }
  };
}

/** GET /v1/public/nieuws/:slug */
router.get('/nieuws/:slug', detailBySlug('nieuws'));
/** GET /v1/public/producten/:slug */
router.get('/producten/:slug', detailBySlug('product'));
/** GET /v1/public/regels/:slug */
router.get('/regels/:slug', detailBySlug('regel'));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=@ronl/backend -- public.routes.test.ts`
Expected: PASS (all tests, existing + new)

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/public.routes.ts packages/backend/src/routes/public.routes.test.ts
git commit -m "feat(backend): add /processen, /zoeken and per-type :slug detail routes"
```

### Task 5: Security regression test — GET-only, no auth

**Files:**

- Create: `packages/backend/src/routes/public.routes.security.test.ts`

**Interfaces:**

- Consumes: the `default` export of `public.routes.ts` (Express `Router`), inspected via its `.stack` — no mocking needed beyond the same service/config mocks other `public.routes` tests use, since this test only introspects route registration, it never executes a handler.

This is the DoD's explicit requirement: _"Add a test that fails as soon as `/v1/public/_` accepts a non-`GET`method or requires an auth header."* It walks the real router (not a fake one), so it will fail the moment someone adds a new mutating verb to a content route or wires`requireAuth` into this file.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/routes/public.routes.security.test.ts
/**
 * Structural guard: every /v1/public/* route is GET-only and carries no
 * auth middleware, EXCEPT the small, explicit allow-list of write endpoints
 * that exist for the IOU use-case/feedback forms. If a future change adds a
 * write verb or an auth check to a content route, this test fails — it
 * inspects the real Express router, not a mock.
 */

jest.mock('@utils/altcha', () => ({ createChallenge: jest.fn(), verifySolution: jest.fn() }));
jest.mock('@services/nieuws.service', () => ({ getNieuwsItems: jest.fn() }));
jest.mock('@services/berichten.service', () => ({
  getBerichtenItems: jest.fn(),
  getBerichtById: jest.fn(),
}));
jest.mock('@services/productenDiensten.service', () => ({ getProductenDienstenItems: jest.fn() }));
jest.mock('@services/regelcatalogus.service', () => ({
  getRegelcatalogusData: jest.fn(),
  getRegelcatalogusCacheInfo: jest.fn(),
}));
jest.mock('@services/lde.service', () => ({
  getPublicProcesses: jest.fn(),
  getPublicProcessByKey: jest.fn(),
}));
jest.mock('@services/search.service', () => ({
  getPublicIndex: jest.fn(),
  searchPublicIndex: jest.fn(),
  facetCounts: jest.fn(),
  getPublicItemBySlug: jest.fn(),
}));
jest.mock('@utils/config', () => ({
  config: {
    altcha: { hmacKey: '' },
    gitlab: { token: '', baseUrl: '', projectPath: '', ucLabel: '' },
  },
}));
jest.mock('@utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

import publicRouter from './public.routes';

// Paths that are intentionally NOT GET-only: the IOU use-case/feedback
// write forms. Everything else on this router must be a content read.
const WRITE_ALLOWLIST = new Set(['/use-case', '/upload-file', '/feedback']);

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ name: string }>;
  };
}

function routeLayers(): NonNullable<RouteLayer['route']>[] {
  const stack = (publicRouter as unknown as { stack: RouteLayer[] }).stack;
  return stack.map((l) => l.route).filter((r): r is NonNullable<RouteLayer['route']> => !!r);
}

describe('public.routes — GET-only, no-auth guard', () => {
  const routes = routeLayers();

  it('found at least the expected read routes (guards against an empty/broken router)', () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/nieuws',
        '/berichten',
        '/producten-diensten',
        '/regelcatalogus',
        '/processen',
        '/zoeken',
      ])
    );
  });

  it.each(routes.map((r) => [r.path, r] as const))(
    '%s: content routes are GET-only, write routes are on the allow-list',
    (path, route) => {
      const methods = Object.keys(route.methods).filter((m) => route.methods[m]);
      if (WRITE_ALLOWLIST.has(path)) {
        expect(methods).toContain('post');
      } else if (path === '/altcha/challenge' || path === '/use-cases') {
        expect(methods).toEqual(['get']);
      } else {
        expect(methods).toEqual(['get']);
      }
    }
  );

  it('no route layer references auth-style middleware by name', () => {
    const forbiddenNamePattern = /requireAuth|verifyToken|checkJwt|authenticate/i;
    for (const route of routes) {
      for (const layer of route.stack) {
        expect(layer.name).not.toMatch(forbiddenNamePattern);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes against the current router**

Run: `npm run test --workspace=@ronl/backend -- public.routes.security.test.ts`
Expected: PASS — this test requires no new production code; it's a regression guard over the routes built in Task 4. If it fails, Task 4's route wiring has a bug (a non-GET content route, or an unlisted path) — fix `public.routes.ts`, not the test.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/public.routes.security.test.ts
git commit -m "test(backend): guard /v1/public/* against non-GET or auth-gated content routes"
```

---

## Phase 2 — `public-site` package: scaffold, chrome, Home

### Task 6: Package scaffold

**Files:**

- Create: `packages/public-site/package.json`
- Create: `packages/public-site/vite.config.ts`
- Create: `packages/public-site/tsconfig.json`
- Create: `packages/public-site/tsconfig.node.json`
- Create: `packages/public-site/.eslintrc.cjs`
- Create: `packages/public-site/index.html`
- Create: `packages/public-site/.env.development`, `.env.acceptance`, `.env.production`, `.env.test`
- Create: `packages/public-site/src/vite-env.d.ts`
- Create: `packages/public-site/src/test/setup.ts`
- Modify: `package.json` (root) — add `dev:public-site`, `build:public-site`, `build:public-site:acc` scripts

**Interfaces:**

- Produces: the package skeleton every later task in Phase 2/3/4 writes into. `VITE_API_URL` and `VITE_STAFF_APP_URL` env vars, typed in `vite-env.d.ts`, are consumed by `lib/api.ts` (Task 9) and `TopBar` (Task 11).

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@ronl/public-site",
  "version": "2026.07.0",
  "description": "Public, unauthenticated search site for Open Regels Nederland — publiek.open-regels.nl",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build --mode production && tsx scripts/prerender.ts --mode production && node scripts/check-bundle.mjs",
    "build:acc": "tsc && vite build --mode acceptance && tsx scripts/prerender.ts --mode acceptance && node scripts/check-bundle.mjs",
    "build:prod": "tsc && vite build --mode production && tsx scripts/prerender.ts --mode production && node scripts/check-bundle.mjs",
    "preview": "vite preview --port 5175",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist",
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "test:e2e": "playwright test --config=e2e/playwright.config.ts",
    "test:e2e:ui": "playwright test --config=e2e/playwright.config.ts --ui"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@axe-core/playwright": "^4.10.1",
    "@playwright/test": "^1.61.1",
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@typescript-eslint/eslint-plugin": "^6.21.0",
    "@typescript-eslint/parser": "^6.21.0",
    "@vitejs/plugin-react": "^5.2.0",
    "@vitest/coverage-v8": "^4.1.9",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "jsdom": "^29.1.1",
    "postcss": "^8.4.32",
    "tsx": "^4.19.2",
    "typescript": "^5.2.2",
    "vite": "^5.0.8",
    "vitest": "^4.1.9"
  }
}
```

Note: no `@ronl/shared`, no `keycloak-js`, no `@azure/msal`, no `tailwindcss` — deliberately, per Global Constraints. `postcss`/`autoprefixer` are kept only so a `postcss.config.js` with `autoprefixer` alone can run vendor-prefixing on plain CSS; there is no `tailwindcss` plugin in it. `tsx` runs the prerender script (Task 19) directly against its TypeScript source, sharing `lib/api.ts` and `lib/sections.ts` with the app instead of duplicating fetch/mapping logic in plain JS.

- [ ] **Step 2: `vite.config.ts`**

```ts
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    host: '0.0.0.0',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
    },
  },
});
```

- [ ] **Step 3: `tsconfig.json` and `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: `.eslintrc.cjs`** (identical to `packages/frontend`'s, minus nothing — same rule set)

```js
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
};
```

- [ ] **Step 5: `index.html`**

```html
<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Doorzoek de openbare regels, producten, processen en berichten van Provincie Flevoland — zonder inloggen."
    />
    <title>Open Regels Nederland — publieke kennisbank</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`<html lang>` starts as `"nl"` here; Task 12 (`App.tsx`) sets it dynamically from the language switch (`document.documentElement.lang = lang`), satisfying the DoD's "`<html lang>` follows the choice".

- [ ] **Step 6: env files**

```
# packages/public-site/.env.development
VITE_API_URL=http://localhost:3002/v1
VITE_STAFF_APP_URL=http://localhost:5173
```

```
# packages/public-site/.env.acceptance
VITE_API_URL=https://acc.api.open-regels.nl/v1
VITE_STAFF_APP_URL=https://acc.mijn.open-regels.nl
```

```
# packages/public-site/.env.production
VITE_API_URL=https://api.open-regels.nl/v1
VITE_STAFF_APP_URL=https://mijn.open-regels.nl
```

```
# packages/public-site/.env.test
VITE_API_URL=http://localhost:3002/v1
VITE_STAFF_APP_URL=http://localhost:5173
```

- [ ] **Step 7: `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_STAFF_APP_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 8: `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 9: register workspace scripts**

In root `package.json`, add alongside the existing `dev:backend`/`dev:frontend`/`build:backend`/`build:frontend` scripts:

```json
    "dev:public-site": "npm run dev --workspace=@ronl/public-site",
    "build:public-site": "npm run build --workspace=@ronl/public-site",
```

`packages/*` is already a workspace glob, so `@ronl/public-site` is picked up automatically once `package.json` exists — no other root change is required. Root `npm run build`/`npm run test`/`npm run lint` (all `--workspaces --if-present`) now cover it too.

- [ ] **Step 10: Install and verify the empty shell builds**

Run: `npm install` (from repo root)
Expected: `packages/public-site` resolves as a workspace, `node_modules` links `@ronl/public-site`

Run: `npm run type-check --workspace=@ronl/public-site`
Expected: fails — `src/main.tsx` doesn't exist yet. That's expected; Task 7 creates it. This step only confirms the workspace is wired up (no "workspace not found" error).

- [ ] **Step 11: Commit**

```bash
git add packages/public-site/package.json packages/public-site/vite.config.ts \
  packages/public-site/tsconfig.json packages/public-site/tsconfig.node.json \
  packages/public-site/.eslintrc.cjs packages/public-site/index.html \
  packages/public-site/.env.development packages/public-site/.env.acceptance \
  packages/public-site/.env.production packages/public-site/.env.test \
  packages/public-site/src/vite-env.d.ts packages/public-site/src/test/setup.ts \
  package.json package-lock.json
git commit -m "feat(public-site): scaffold new package (Vite + React + TS, no auth deps)"
```

---

### Task 7: `pub.css` port (responsive-by-media-query) + `main.tsx`

**Files:**

- Create: `packages/public-site/src/styles/pub.css`
- Create: `packages/public-site/src/main.tsx`
- Create: `packages/public-site/postcss.config.js`

**Interfaces:**

- Produces: every CSS class referenced by Task 11 (chrome) and Task 12+ (pages). `main.tsx` mounts `<App />` (Task 12) inside `<BrowserRouter>`.

Three deliberate changes from `publiek-handoff/pub.css`, each because the source file was written for the **interactive design-review prototype**, not the production build (per Global Constraints and `publiek-handoff/README.md`'s "Tweaks: … desktop/mobile/both … WCAG annotations"):

1. **Mobile is media-query-only.** The prototype toggled `.pub-mobile` on a wrapper element so a reviewer could see desktop and mobile side by side. Production has exactly one viewport per visit, so every `.pub-mobile X` rule below is folded into the existing `@media(max-width:860px)` block and the `.pub-mobile` class is deleted — this is spec section 6's explicit instruction ("convert that to media queries on the same selectors").
2. **The WCAG-annotation overlay (`.pub-a11y*`) is dropped.** It drew dashed red boxes and tooltips for a _human reviewing the prototype_, not a feature of the site itself — `README.md` lists it under the prototype's own "Tweaks". The DoD's real accessibility bar (axe-core, keyboard walkthrough, `/toegankelijkheid`) is Task 19/18, not this overlay.
3. **`.pub-feed` (Home variant C's news-first layout) and `.pub-hero`/`.pub-hero-stats` (variant A's search-first hero band) are dropped.** Only variant B ships (CLAUDE-CODE-PROMPT.md §"Home page": "do not build them, not even as a feature flag"), and variant B never uses either class — it's a grey band + card grid (see Task 12).

- [ ] **Step 1: Write `src/styles/pub.css`**

```css
/* Open Regels — public search site. Rijkshuisstijl / NL Design System tokens.
   Fira Sans stands in for RO Sans (not redistributable); swap in production. */
:root {
  --ro-blue: #154273;
  --ro-link: #01689b;
  --ro-link-hover: #007bc7;
  --ro-link-visited: #42145f;
  --ro-lint: #c8102e;
  --ro-focus: #f9e11e;
  --ro-ink: #000;
  --ro-ink-2: #535353;
  --ro-ink-3: #696969;
  --ro-rule: #b4b4b4;
  --ro-rule-2: #e6e6e6;
  --ro-bg: #f3f3f3;
  --ro-paper: #fff;
  --ro-green: #39870c;
  --ro-violet: #42145f;
  --ro-mint: #75b8b5;
  --ro-mustard: #ffb612;
  --pub-max: 69rem;
  --pub-font: 'Fira Sans', 'RO Sans', Verdana, sans-serif;
  --pub-mono: 'JetBrains Mono', ui-monospace, monospace;
}
*,
*::before,
*::after {
  box-sizing: border-box;
}
.pub {
  font-family: var(--pub-font);
  color: var(--ro-ink);
  background: var(--ro-paper);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.pub h1,
.pub h2,
.pub h3,
.pub h4 {
  font-weight: 700;
  line-height: 1.2;
  margin: 0;
  text-wrap: balance;
}
.pub p {
  margin: 0;
  text-wrap: pretty;
}
.pub a {
  color: var(--ro-link);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pub a:hover {
  color: var(--ro-link-hover);
  text-decoration-thickness: 2px;
}
.pub a:visited {
  color: var(--ro-link-visited);
}
.pub :focus-visible {
  outline: 2px solid var(--ro-ink);
  outline-offset: 0;
  background: var(--ro-focus);
  color: var(--ro-ink);
  box-shadow: 0 0 0 2px var(--ro-focus);
}
.pub button:focus-visible,
.pub a:focus-visible {
  border-radius: 0;
}
.pub input:focus-visible,
.pub select:focus-visible {
  outline: 2px solid var(--ro-ink);
  box-shadow: 0 0 0 4px var(--ro-focus);
  background: var(--ro-paper);
}
.pub-wrap {
  max-width: var(--pub-max);
  margin: 0 auto;
  padding: 0 24px;
  width: 100%;
}
.pub-skip {
  position: absolute;
  left: 16px;
  top: -60px;
  z-index: 60;
  background: var(--ro-focus);
  color: #000;
  padding: 10px 16px;
  font-weight: 700;
  text-decoration: none;
  border: 2px solid #000;
  transition: top 0.12s;
}
.pub-skip:focus {
  top: 12px;
}
/* Visually-hidden but screen-reader-visible labels — the clip technique, never display:none. */
.pub-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ── Chrome ─────────────────────────────────────────────── */
.pub-topbar {
  background: var(--ro-blue);
  color: #fff;
}
.pub-topbar .pub-wrap {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 64px;
  flex-wrap: wrap;
}
.pub .pub-wordmark {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #fff;
  text-decoration: none;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.pub .pub-wordmark:hover,
.pub .pub-wordmark:visited {
  color: #fff;
  text-decoration: none;
}
.pub-wordmark .pub-mark {
  width: 6px;
  align-self: stretch;
  min-height: 34px;
  background: var(--ro-mustard);
}
.pub-wordmark b {
  display: block;
  font-size: 17px;
  line-height: 1.1;
}
.pub-wordmark span {
  display: block;
  font-size: 12.5px;
  font-weight: 400;
  opacity: 0.82;
  line-height: 1.3;
}
.pub-topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pub-lang {
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.45);
}
.pub-lang button {
  background: none;
  border: none;
  color: #fff;
  font: 600 13px/1 var(--pub-font);
  padding: 7px 11px;
  cursor: pointer;
}
.pub-lang button[aria-pressed='true'] {
  background: #fff;
  color: var(--ro-blue);
}
.pub .pub-login {
  color: #fff;
  font-size: 13.5px;
  text-decoration: underline;
}
.pub .pub-login:visited,
.pub .pub-login:hover {
  color: #fff;
}
.pub-nav {
  background: var(--ro-paper);
  border-bottom: 1px solid var(--ro-rule-2);
}
.pub-nav ul {
  display: flex;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  flex-wrap: wrap;
}
.pub-nav button,
.pub-nav a {
  background: none;
  border: none;
  border-bottom: 4px solid transparent;
  padding: 14px 16px;
  font: 500 14.5px/1.2 var(--pub-font);
  color: var(--ro-ink);
  cursor: pointer;
  white-space: nowrap;
  text-decoration: none;
  display: inline-block;
}
.pub-nav button:hover,
.pub-nav a:hover {
  color: var(--ro-link-hover);
  border-bottom-color: var(--ro-rule);
}
.pub-nav button[aria-current='page'],
.pub-nav a[aria-current='page'] {
  font-weight: 700;
  border-bottom-color: var(--ro-link);
}

/* ── Search ─────────────────────────────────────────────── */
.pub-searchform {
  display: flex;
  width: 100%;
}
.pub-searchform input {
  flex: 1;
  min-width: 0;
  height: 52px;
  border: 2px solid var(--ro-ink);
  border-right: none;
  padding: 0 16px;
  font: 400 17px/1 var(--pub-font);
  background: #fff;
  color: #000;
}
.pub-searchform input::placeholder {
  color: var(--ro-ink-3);
}
.pub-searchform button {
  height: 52px;
  border: 2px solid var(--ro-ink);
  background: var(--ro-link);
  color: #fff;
  font: 700 16px/1 var(--pub-font);
  padding: 0 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pub-searchform button:hover {
  background: var(--ro-link-hover);
}

/* ── Layout blocks ──────────────────────────────────────── */
.pub-main {
  padding: 36px 0 72px;
  min-height: 50vh;
}
.pub-crumbs {
  font-size: 13.5px;
  color: var(--ro-ink-2);
  margin-bottom: 18px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pub-crumbs a {
  color: var(--ro-link);
}
.pub-section-h {
  font-size: 26px;
  margin-bottom: 6px;
}
.pub-lede-2 {
  color: var(--ro-ink-2);
  font-size: 16px;
  max-width: 70ch;
  margin-bottom: 24px;
}
.pub-cards {
  display: grid;
  gap: 2px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  background: var(--ro-rule-2);
  border: 1px solid var(--ro-rule-2);
}
.pub-card {
  background: var(--ro-paper);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  border: none;
  font-family: inherit;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
.pub-card:hover {
  background: #f6f9fc;
}
.pub-card h3 {
  font-size: 18px;
  color: var(--ro-link);
}
.pub-card:hover h3 {
  color: var(--ro-link-hover);
  text-decoration: underline;
}
.pub-card p {
  font-size: 14px;
  color: var(--ro-ink-2);
}
.pub-card .pub-count {
  font: 500 12.5px/1 var(--pub-mono);
  color: var(--ro-ink-3);
  margin-top: auto;
  padding-top: 8px;
}

/* ── Results ────────────────────────────────────────────── */
.pub-results {
  display: grid;
  grid-template-columns: 15.5rem 1fr;
  gap: 40px;
  align-items: start;
}
.pub-facets {
  border-top: 3px solid var(--ro-blue);
  padding-top: 14px;
}
.pub-facets h2 {
  font-size: 18px;
  margin-bottom: 12px;
}
.pub-facet {
  border-bottom: 1px solid var(--ro-rule-2);
  padding: 12px 0;
}
.pub-facet legend {
  font-weight: 700;
  font-size: 14px;
  padding: 0;
  margin-bottom: 8px;
}
.pub-facet label {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 14px;
  padding: 4px 0;
  cursor: pointer;
  min-height: 44px;
}
.pub-facet input {
  width: 18px;
  height: 18px;
  accent-color: var(--ro-link);
  flex: none;
  margin: 0;
}
.pub-facet .pub-fc {
  margin-left: auto;
  font: 500 12px/1 var(--pub-mono);
  color: var(--ro-ink-3);
}
.pub-facet label:hover {
  color: var(--ro-link-hover);
}
.pub-clear {
  background: none;
  border: none;
  color: var(--ro-link);
  font: 500 14px/1 var(--pub-font);
  text-decoration: underline;
  cursor: pointer;
  padding: 12px 0 0;
}
.pub-resulthead {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--ro-rule-2);
  padding-bottom: 12px;
  margin-bottom: 6px;
}
.pub-resulthead p {
  font-size: 14.5px;
  color: var(--ro-ink-2);
}
.pub-sort {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.pub-sort select {
  font: 400 14px/1 var(--pub-font);
  padding: 7px 8px;
  border: 1px solid var(--ro-rule);
  background: #fff;
}
.pub-hit {
  border-bottom: 1px solid var(--ro-rule-2);
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.pub-hit h3 {
  font-size: 19px;
}
.pub-hit h3 a {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--ro-link);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  text-align: left;
}
.pub-hit h3 a:hover {
  color: var(--ro-link-hover);
}
.pub-hit p {
  font-size: 14.5px;
  color: var(--ro-ink-2);
}
.pub-hit mark {
  background: #fff4c2;
  color: inherit;
  padding: 0 1px;
}
.pub-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
  font-size: 13px;
  color: var(--ro-ink-3);
}
.pub-meta .pub-sep {
  color: var(--ro-rule);
}
.pub-type {
  display: inline-block;
  font: 700 11px/1 var(--pub-font);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 4px 8px;
  border: 1px solid;
  white-space: nowrap;
}
.t-bericht {
  color: #0b4f9e;
  border-color: #0b4f9e;
  background: #eef4fc;
}
.t-nieuws {
  color: #7a2a00;
  border-color: #7a2a00;
  background: #fdf2ea;
}
.t-product {
  color: #2c5c17;
  border-color: #2c5c17;
  background: #eff6ea;
}
.t-regel {
  color: var(--ro-violet);
  border-color: var(--ro-violet);
  background: #f5eefa;
}
.t-proces {
  color: #00566b;
  border-color: #00566b;
  background: #e9f4f7;
}
.pub-empty {
  padding: 40px 0;
  max-width: 60ch;
}
.pub-empty h3 {
  font-size: 20px;
  margin-bottom: 10px;
}

/* ── Detail ─────────────────────────────────────────────── */
.pub-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 17rem;
  gap: 48px;
  align-items: start;
}
.pub-detail-body {
  max-width: 70ch;
}
.pub-detail h1 {
  font-size: 34px;
  margin-bottom: 12px;
}
.pub-detail .pub-standfirst {
  font-size: 19px;
  color: var(--ro-ink-2);
  margin-bottom: 22px;
}
.pub-detail-body h2 {
  font-size: 22px;
  margin: 32px 0 10px;
}
.pub-detail-body p {
  margin-bottom: 12px;
}
.pub-detail-body ul {
  margin: 0 0 16px;
  padding-left: 22px;
}
.pub-detail-body li {
  margin-bottom: 6px;
}
.pub-aside {
  border-top: 3px solid var(--ro-blue);
  padding-top: 14px;
  font-size: 14px;
}
.pub-aside h2 {
  font-size: 16px;
  margin-bottom: 10px;
}
.pub-aside dl {
  margin: 0;
}
.pub-aside dt {
  font-weight: 700;
  font-size: 12.5px;
  color: var(--ro-ink-2);
  margin-top: 12px;
}
.pub-aside dd {
  margin: 2px 0 0;
}
.pub-aside dd.mono {
  font-family: var(--pub-mono);
  font-size: 12.5px;
  word-break: break-all;
}
.pub-tech {
  border: 1px solid var(--ro-rule);
  margin: 26px 0;
}
.pub-tech > summary {
  cursor: pointer;
  padding: 13px 16px;
  font-weight: 700;
  font-size: 15px;
  background: var(--ro-bg);
  list-style: none;
  display: flex;
  align-items: center;
  gap: 10px;
}
.pub-tech > summary::-webkit-details-marker {
  display: none;
}
.pub-tech > summary::before {
  content: '▸';
  color: var(--ro-link);
}
.pub-tech[open] > summary::before {
  content: '▾';
}
.pub-tech-in {
  padding: 16px;
  border-top: 1px solid var(--ro-rule);
}
.pub-kv {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.pub-kv th {
  text-align: left;
  font-weight: 700;
  padding: 8px 12px 8px 0;
  vertical-align: top;
  width: 15rem;
  border-bottom: 1px solid var(--ro-rule-2);
}
.pub-kv td {
  padding: 8px 0;
  border-bottom: 1px solid var(--ro-rule-2);
  font-family: var(--pub-mono);
  font-size: 13px;
}
.pub-callout {
  border-left: 5px solid var(--ro-mint);
  background: #f2f9f9;
  padding: 16px 18px;
  margin: 20px 0;
  font-size: 14.5px;
}
.pub-callout b {
  display: block;
  margin-bottom: 4px;
}

/* ── Footer ─────────────────────────────────────────────── */
.pub-footer {
  background: var(--ro-bg);
  border-top: 5px solid var(--ro-blue);
  padding: 40px 0 48px;
  font-size: 14px;
}
.pub-footer-cols {
  display: grid;
  gap: 32px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}
.pub-footer h2 {
  font-size: 15px;
  margin-bottom: 10px;
}
.pub-footer ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.pub-footer-bottom {
  margin-top: 32px;
  padding-top: 18px;
  border-top: 1px solid var(--ro-rule);
  color: var(--ro-ink-2);
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: space-between;
}

/* ── Tabs (rule catalogue) ──────────────────────────────── */
.pub-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--ro-rule);
  margin-bottom: 22px;
  flex-wrap: wrap;
}
.pub-tabs button {
  background: none;
  border: none;
  border-bottom: 4px solid transparent;
  padding: 11px 16px;
  font: 500 15px/1.2 var(--pub-font);
  color: var(--ro-ink);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: -1px;
}
.pub-tabs button:hover {
  color: var(--ro-link-hover);
}
.pub-tabs button[aria-selected='true'] {
  font-weight: 700;
  border-bottom-color: var(--ro-link);
}
.pub-tabs .pub-tc {
  font: 500 12px/1 var(--pub-mono);
  background: var(--ro-bg);
  border: 1px solid var(--ro-rule-2);
  padding: 2px 7px;
  color: var(--ro-ink-2);
}
.pub-orgcards {
  display: grid;
  gap: 2px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  background: var(--ro-rule-2);
  border: 1px solid var(--ro-rule-2);
}
.pub-orgcard {
  background: #fff;
  padding: 18px 20px;
}
.pub-orgcard h3 {
  font-size: 16px;
  margin-bottom: 3px;
}
.pub-orgcard .pub-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.pub-chip {
  font-size: 12.5px;
  border: 1px solid var(--ro-rule);
  background: var(--ro-bg);
  padding: 3px 9px;
}
.pub-acc {
  border: 1px solid var(--ro-rule-2);
  margin-bottom: 8px;
  background: #fff;
}
.pub-acc > summary {
  cursor: pointer;
  padding: 13px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  list-style: none;
}
.pub-acc > summary::-webkit-details-marker {
  display: none;
}
.pub-acc > summary::before {
  content: '▸';
  color: var(--ro-link);
  font-size: 13px;
}
.pub-acc[open] > summary {
  background: var(--ro-bg);
  border-bottom: 1px solid var(--ro-rule-2);
}
.pub-acc[open] > summary::before {
  content: '▾';
}
.pub-acc summary b {
  font-weight: 700;
}
.pub-acc .pub-tc {
  margin-left: auto;
  font: 500 12px/1 var(--pub-mono);
  color: var(--ro-ink-2);
}
.pub-acc-in {
  padding: 6px 16px 14px;
}
.pub-filterbar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  align-items: flex-end;
}
.pub-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13.5px;
}
.pub-field label {
  font-weight: 600;
}
.pub-field input,
.pub-field select {
  height: 40px;
  border: 1px solid var(--ro-ink);
  padding: 0 10px;
  font: 400 15px/1 var(--pub-font);
  background: #fff;
  min-width: 16rem;
}
.pub-embed-bar {
  display: flex;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
  border: 1px solid var(--ro-rule);
  border-bottom: none;
  background: var(--ro-bg);
  padding: 12px 16px;
  font-size: 13.5px;
}
.pub-embed {
  border: 1px solid var(--ro-rule);
  height: 74vh;
  min-height: 520px;
  background: #fff;
}
.pub-embed iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

/* ── Mobile (media query, not a preview-toggle class) ───── */
@media (max-width: 860px) {
  .pub-wrap {
    padding: 0 16px;
  }
  .pub-results,
  .pub-detail {
    grid-template-columns: 1fr;
    gap: 26px;
  }
  .pub-cards {
    grid-template-columns: 1fr;
  }
  .pub-nav ul {
    flex-wrap: nowrap;
    overflow-x: auto;
  }
  .pub-nav button,
  .pub-nav a {
    padding: 12px;
    font-size: 14px;
  }
  .pub-searchform input {
    height: 48px;
    font-size: 16px;
  }
  .pub-searchform button {
    padding: 0 14px;
    height: 48px;
  }
  .pub-detail h1 {
    font-size: 26px;
  }
  .pub-topbar .pub-wrap {
    min-height: 56px;
    gap: 10px;
  }
  .pub-embed {
    height: 60vh;
    min-height: 380px;
  }
  .pub-field input,
  .pub-field select {
    min-width: 0;
    width: 100%;
  }
}
```

- [ ] **Step 2: `postcss.config.js`** (autoprefixer only — no Tailwind)

```js
export default {
  plugins: {
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/pub.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
```

`App` doesn't exist yet — that's Task 12. This task only needs to typecheck in isolation, which it won't until Task 12 lands; that's expected and matches how Task 6 Step 10 already left `type-check` red.

- [ ] **Step 4: Commit**

```bash
git add packages/public-site/src/styles/pub.css packages/public-site/src/main.tsx packages/public-site/postcss.config.js
git commit -m "feat(public-site): port pub.css (media-query responsive, no a11y-overlay/variant-C dead code) + main.tsx"
```

---

### Task 8: i18n + section metadata

**Files:**

- Create: `packages/public-site/src/i18n/nl.ts`
- Create: `packages/public-site/src/i18n/en.ts`
- Create: `packages/public-site/src/i18n/index.ts`
- Create: `packages/public-site/src/i18n/i18n.test.ts`
- Create: `packages/public-site/src/lib/sections.ts`

**Interfaces:**

- Produces: `Translations` type, `translations: Record<Lang, Translations>`, `Lang = 'nl' | 'en'` — consumed by every component/page from Task 11 onward. `PUB_SECTIONS`, `PUB_TYPE_LABEL`, `PUB_TYPES` from `lib/sections.ts` — consumed the same way. `stats` (hardcoded demo numbers in the prototype) is deliberately **not** ported: Home (Task 12) computes real counts from fetched data instead of copy.

- [ ] **Step 1: Write the failing test**

```ts
// packages/public-site/src/i18n/i18n.test.ts
import { describe, it, expect } from 'vitest';
import { translations } from './index';

describe('i18n', () => {
  it('nl and en declare exactly the same keys', () => {
    const nlKeys = Object.keys(translations.nl).sort();
    const enKeys = Object.keys(translations.en).sort();
    expect(enKeys).toEqual(nlKeys);
  });

  it('footerLinks has the same number of entries in both languages', () => {
    expect(translations.en.footerLinks).toHaveLength(translations.nl.footerLinks.length);
  });

  it('no string value is empty', () => {
    for (const lang of ['nl', 'en'] as const) {
      for (const [key, value] of Object.entries(translations[lang])) {
        if (typeof value === 'string') {
          expect(value.trim(), `${lang}.${key}`).not.toBe('');
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/public-site -- i18n.test.ts`
Expected: FAIL — `./index` doesn't exist

- [ ] **Step 3: Write `nl.ts`, `en.ts`, `index.ts`**

```ts
// packages/public-site/src/i18n/nl.ts

/** Shape shared by nl.ts and en.ts — enforced structurally by i18n.test.ts. */
export interface Translations {
  org: string;
  orgSub: string;
  login: string;
  skip: string;
  navHome: string;
  navAll: string;
  search: string;
  searchLabel: string;
  placeholder: string;
  heroTitle: string;
  heroLede: string;
  results: string;
  resultsFor: string;
  allResults: string;
  filters: string;
  clear: string;
  sort: string;
  sortRel: string;
  sortDate: string;
  sortAz: string;
  type: string;
  source: string;
  audience: string;
  noResults: string;
  noResultsBody: string;
  back: string;
  tech: string;
  techLede: string;
  aside: string;
  readMore: string;
  updated: string;
  publisher: string;
  identifier: string;
  api: string;
  apiBody: string;
  footerAbout: string;
  footerBrowse: string;
  footerLegal: string;
  footerLinks: [string][];
  footerNote: string;
  tabOrg: string;
  tabDienst: string;
  tabRegel: string;
  tabBegrip: string;
  filterDienst: string;
  allDiensten: string;
  concept: string;
  dienst: string;
  rulesIn: string;
  conceptsIn: string;
  validFrom: string;
  filterRule: string;
  filterConcept: string;
  embedNote: string;
  embedOpen: string;
}

export const nl: Translations = {
  org: 'Open Regels Nederland',
  orgSub: 'Publieke kennisbank · Provincie Flevoland',
  login: 'Inloggen voor medewerkers',
  skip: 'Direct naar de inhoud',
  navHome: 'Home',
  navAll: 'Alles doorzoeken',
  search: 'Zoeken',
  searchLabel: 'Zoek in de publieke kennisbank',
  placeholder: 'Zoek een product, regel, proces of begrip…',
  heroTitle: 'Zoek in de regels, producten en processen van de overheid',
  heroLede:
    'Alles wat een ambtenaar in Flevoland ziet aan openbare informatie — regelgeving, producten, processen en begrippen — staat hier ook. Zonder inloggen, zonder account.',
  results: 'Zoekresultaten',
  resultsFor: 'resultaten voor',
  allResults: 'items in de kennisbank',
  filters: 'Verfijn',
  clear: 'Alle filters wissen',
  sort: 'Sorteer op',
  sortRel: 'Relevantie',
  sortDate: 'Datum',
  sortAz: 'A–Z',
  type: 'Soort',
  source: 'Bron',
  audience: 'Voor wie',
  noResults: 'Geen resultaten',
  noResultsBody:
    'Controleer de spelling, gebruik minder woorden, of zoek op een breder begrip. U kunt ook per onderdeel bladeren.',
  back: 'Terug naar resultaten',
  tech: 'Technische details',
  techLede: 'Voor ontwikkelaars en informatie-analisten.',
  aside: 'Over dit item',
  readMore: 'Lees verder bij de bron',
  updated: 'Bijgewerkt',
  publisher: 'Uitvoeringsorganisatie',
  identifier: 'Identificatie',
  api: 'Open data',
  apiBody: 'Dit item is ook machineleesbaar op te vragen via de open, anonieme API.',
  footerAbout: 'Over deze site',
  footerBrowse: 'Bladeren',
  footerLegal: 'Verantwoording',
  footerLinks: [['Toegankelijkheidsverklaring (WCAG 2.1 AA)'], ['Open data & API']],
  footerNote:
    'Deze site toont uitsluitend openbare informatie. Er worden geen persoonsgegevens verwerkt en er is geen inlog nodig.',
  tabOrg: 'Organisaties',
  tabDienst: 'Diensten',
  tabRegel: 'Regels',
  tabBegrip: 'Begrippen',
  filterDienst: 'Filter op dienst',
  allDiensten: 'Alle diensten',
  concept: 'Begrip',
  dienst: 'Dienst',
  rulesIn: 'Regels in deze dienst',
  conceptsIn: 'Begrippen in deze dienst',
  validFrom: 'Geldig vanaf',
  filterRule: 'Zoek op regelnaam…',
  filterConcept: 'Zoek op begrip…',
  embedNote: 'Deze pagina toont de RONL-thesaurus rechtstreeks vanaf skosmos.open-regels.nl.',
  embedOpen: 'Openen in een nieuw tabblad',
};
```

```ts
// packages/public-site/src/i18n/en.ts
import type { Translations } from './nl';

export const en: Translations = {
  org: 'Open Regels Nederland',
  orgSub: 'Public knowledge base · Province of Flevoland',
  login: 'Staff login',
  skip: 'Skip to main content',
  navHome: 'Home',
  navAll: 'Search everything',
  search: 'Search',
  searchLabel: 'Search the public knowledge base',
  placeholder: 'Search a product, rule, process or concept…',
  heroTitle: 'Search the rules, products and processes of Dutch government',
  heroLede:
    'Every piece of public information a Flevoland civil servant sees — regulations, products, processes and concepts — is published here too. No login, no account.',
  results: 'Search results',
  resultsFor: 'results for',
  allResults: 'items in the knowledge base',
  filters: 'Refine',
  clear: 'Clear all filters',
  sort: 'Sort by',
  sortRel: 'Relevance',
  sortDate: 'Date',
  sortAz: 'A–Z',
  type: 'Type',
  source: 'Source',
  audience: 'Audience',
  noResults: 'No results',
  noResultsBody:
    'Check the spelling, use fewer words, or try a broader term. You can also browse per section.',
  back: 'Back to results',
  tech: 'Technical details',
  techLede: 'For developers and information analysts.',
  aside: 'About this item',
  readMore: 'Read more at the source',
  updated: 'Updated',
  publisher: 'Implementing body',
  identifier: 'Identifier',
  api: 'Open data',
  apiBody: 'This item is also machine-readable through the open, anonymous API.',
  footerAbout: 'About this site',
  footerBrowse: 'Browse',
  footerLegal: 'Accountability',
  footerLinks: [['Accessibility statement (WCAG 2.1 AA)'], ['Open data & API']],
  footerNote:
    'This site publishes public information only. No personal data is processed and no login is required.',
  tabOrg: 'Organisations',
  tabDienst: 'Services',
  tabRegel: 'Rules',
  tabBegrip: 'Concepts',
  filterDienst: 'Filter by service',
  allDiensten: 'All services',
  concept: 'Concept',
  dienst: 'Service',
  rulesIn: 'Rules in this service',
  conceptsIn: 'Concepts in this service',
  validFrom: 'Valid from',
  filterRule: 'Search rule names…',
  filterConcept: 'Search concepts…',
  embedNote: 'This page embeds the RONL thesaurus directly from skosmos.open-regels.nl.',
  embedOpen: 'Open in a new tab',
};
```

```ts
// packages/public-site/src/i18n/index.ts
import { nl, type Translations } from './nl';
import { en } from './en';

export type Lang = 'nl' | 'en';
export type { Translations };
export const translations: Record<Lang, Translations> = { nl, en };
```

Note: `footerLinks` intentionally has 2 rows, not the prototype's 4 ("Privacyverklaring" and "Contact" pointed nowhere in the prototype — `href="#"` with `preventDefault()` — and are not part of this DoD; only the accessibility statement (`/toegankelijkheid`, Task 18) and open data page (`/open-data`, Task 18) are real routes this plan builds).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/public-site -- i18n.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `lib/sections.ts`** (no test — static data, exercised transitively by every page test from Task 12 on)

```ts
// packages/public-site/src/lib/sections.ts
import type { Lang } from '../i18n';

export const PUB_TYPES = ['bericht', 'nieuws', 'product', 'regel', 'proces'] as const;
export type PubType = (typeof PUB_TYPES)[number];

export interface PubSection {
  id: string;
  type: PubType;
  path: string;
  nl: string;
  en: string;
  nlSub: string;
  enSub: string;
}

export const PUB_SECTIONS: PubSection[] = [
  {
    id: 'berichten',
    type: 'bericht',
    path: '/berichten',
    nl: 'Berichten',
    en: 'Announcements',
    nlSub: 'Officiële berichten van Provincie Flevoland.',
    enSub: 'Official announcements from the Province of Flevoland.',
  },
  {
    id: 'nieuws',
    type: 'nieuws',
    path: '/nieuws',
    nl: 'Nieuws',
    en: 'News',
    nlSub: 'Landelijk nieuws van de Rijksoverheid.',
    enSub: 'National news from the Dutch central government.',
  },
  {
    id: 'producten',
    type: 'product',
    path: '/producten',
    nl: 'Producten & Diensten',
    en: 'Products & Services',
    nlSub:
      'Vergunningen, meldingen en subsidies waar u als inwoner of ondernemer mee te maken krijgt.',
    enSub: 'Permits, notifications and grants for residents and businesses.',
  },
  {
    id: 'regels',
    type: 'regel',
    path: '/regels',
    nl: 'Regelcatalogus',
    en: 'Rule catalogue',
    nlSub:
      'Publieke diensten en de regels waarmee de overheid ze uitvoert — inclusief geldigheidsdatum en bron.',
    enSub:
      'Public services and the rules used to execute them — including validity dates and source.',
  },
  {
    id: 'processen',
    type: 'proces',
    path: '/processen',
    nl: 'Procesbibliotheek',
    en: 'Process library',
    nlSub: 'Hoe een aanvraag stap voor stap door de organisatie loopt.',
    enSub: 'How an application moves through the organisation, step by step.',
  },
];

/** Woordenboek is deliberately not in PUB_SECTIONS: it has no type, no detail
 * route, and is excluded from search/sitemap per ARCHITECTURE.md's "Decided"
 * section. MainNav (Task 11) adds its link separately, statically. */
export const WOORDENBOEK_PATH = '/woordenboek';

export const PUB_TYPE_LABEL: Record<PubType, { nl: string; en: string }> = {
  bericht: { nl: 'Bericht', en: 'Announcement' },
  nieuws: { nl: 'Nieuws', en: 'News' },
  product: { nl: 'Product', en: 'Product' },
  regel: { nl: 'Regel', en: 'Rule' },
  proces: { nl: 'Proces', en: 'Process' },
};

export function sectionForType(type: PubType): PubSection {
  return PUB_SECTIONS.find((s) => s.type === type)!;
}

export function sectionLabel(section: PubSection, lang: Lang): string {
  return lang === 'nl' ? section.nl : section.en;
}

export function sectionSub(section: PubSection, lang: Lang): string {
  return lang === 'nl' ? section.nlSub : section.enSub;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/public-site/src/i18n packages/public-site/src/lib/sections.ts
git commit -m "feat(public-site): i18n (nl/en) and section metadata"
```

---

### Task 9: `lib/api.ts` — typed client for `/v1/public/*`

**Files:**

- Create: `packages/public-site/src/lib/api.ts`
- Create: `packages/public-site/src/lib/api.test.ts`

**Interfaces:**

- Consumes: the backend response shapes built in Phase 1 (Tasks 2–4).
- Produces: `PublicHit`, `SearchResponse`, `NieuwsItem`, `BerichtItem`, `ProductItem`, `RegelcatalogusData`, `PublicProcess` types; `searchPublic()`, `getBerichten()`, `getBerichtBySlug()`, `getNieuws()`, `getNieuwsBySlug()`, `getProducten()`, `getProductBySlug()`, `getRegelcatalogus()`, `getRegelBySlug()`, `getProcessen()`, `getProcesByKey()`. Consumed by every page from Task 12 onward, and by the prerender script (Task 20), which is why base-URL resolution supports both a Vite browser build (`import.meta.env.VITE_API_URL`) and a plain Node script (`process.env.PUBLIC_API_BASE_URL`).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/public-site/src/lib/api.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalFetch = global.fetch;

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe('lib/api', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3002/v1');
  });

  it('searchPublic() builds the right query string and returns data', async () => {
    mockFetchOnce(200, {
      success: true,
      data: { items: [], total: 0, facets: { soort: [], bron: [], doelgroep: [] } },
    });
    const { searchPublic } = await import('./api');
    await searchPublic({ q: 'zorg', soort: ['regel', 'product'], sort: 'az' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/public/zoeken?q=zorg&soort=regel%2Cproduct&sort=az')
    );
  });

  it('throws when the HTTP response is not ok', async () => {
    mockFetchOnce(500, { success: false, error: { code: 'X', message: 'boom' } });
    const { getNieuws } = await import('./api');
    await expect(getNieuws()).rejects.toThrow(/HTTP 500/);
  });

  it('throws when success:false even on HTTP 200', async () => {
    mockFetchOnce(200, { success: false, error: { code: 'X', message: 'business error' } });
    const { getBerichten } = await import('./api');
    await expect(getBerichten()).rejects.toThrow('business error');
  });

  it('getRegelBySlug returns null on 404 instead of throwing', async () => {
    mockFetchOnce(404, {
      success: false,
      error: { code: 'ITEM_NOT_FOUND', message: 'Item niet gevonden.' },
    });
    const { getRegelBySlug } = await import('./api');
    expect(await getRegelBySlug('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=@ronl/public-site -- api.test.ts`
Expected: FAIL — `./api` doesn't exist

- [ ] **Step 3: Write `lib/api.ts`**

```ts
// packages/public-site/src/lib/api.ts

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=@ronl/public-site -- api.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/public-site/src/lib/api.ts packages/public-site/src/lib/api.test.ts
git commit -m "feat(public-site): typed client for /v1/public/*"
```

---

### Task 10: `lib/slug.ts` (URL builder) + `lib/useQueryState.ts`

**Files:**

- Create: `packages/public-site/src/lib/slug.ts`
- Create: `packages/public-site/src/lib/slug.test.ts`
- Create: `packages/public-site/src/lib/useQueryState.ts`
- Create: `packages/public-site/src/lib/useQueryState.test.tsx`

**Interfaces:**

- Consumes: `PubType`, `sectionForType` (`lib/sections.ts`, Task 8); `PublicHit` (`lib/api.ts`, Task 9).
- Produces: `hrefFor(item: { type: PublicItemType | PubType; slug: string }): string` — consumed by `Hit`/chrome (Task 11) and every list page. `useQueryState(): [ResultsQuery, (next: Partial<ResultsQuery>) => void]` — consumed by the Results page (Task 14).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/public-site/src/lib/slug.test.ts
import { describe, it, expect } from 'vitest';
import { hrefFor } from './slug';

describe('hrefFor', () => {
  it('builds the per-type detail path', () => {
    expect(hrefFor({ type: 'bericht', slug: 'b1' })).toBe('/berichten/b1');
    expect(hrefFor({ type: 'nieuws', slug: 'n1' })).toBe('/nieuws/n1');
    expect(hrefFor({ type: 'product', slug: 'p1' })).toBe('/producten/p1');
    expect(hrefFor({ type: 'regel', slug: 'zorgtoeslag' })).toBe('/regels/zorgtoeslag');
    expect(hrefFor({ type: 'proces', slug: 'zorgtoeslag-process' })).toBe(
      '/processen/zorgtoeslag-process'
    );
  });
});
```

```ts
// packages/public-site/src/lib/useQueryState.test.tsx
import type { ReactNode } from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQueryState } from './useQueryState';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/zoeken?q=zorg&soort=regel%2Cproduct&sort=az']}>{children}</MemoryRouter>;
}

describe('useQueryState', () => {
  it('parses q, csv facets and sort from the URL', () => {
    const { result } = renderHook(() => useQueryState(), { wrapper });
    expect(result.current[0]).toEqual({
      q: 'zorg',
      soort: ['regel', 'product'],
      bron: [],
      doelgroep: [],
      sort: 'az',
    });
  });

  it('defaults to an empty query when no params are present', () => {
    const { result } = renderHook(() => useQueryState(), {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/zoeken']}>{children}</MemoryRouter>,
    });
    expect(result.current[0]).toEqual({ q: '', soort: [], bron: [], doelgroep: [], sort: 'rel' });
  });

  it('setQuery merges and re-serialises into the URL', () => {
    const { result } = renderHook(() => useQueryState(), { wrapper });
    act(() => result.current[1]({ soort: ['proces'] }));
    expect(result.current[0].soort).toEqual(['proces']);
    expect(result.current[0].q).toBe('zorg'); // untouched fields survive the merge
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=@ronl/public-site -- slug.test.ts useQueryState.test.tsx`
Expected: FAIL — neither module exists

- [ ] **Step 3: Write `lib/slug.ts`**

```ts
// packages/public-site/src/lib/slug.ts
import { sectionForType, type PubType } from './sections';

/** Builds the permanent detail URL for any federated search item. */
export function hrefFor(item: { type: PubType; slug: string }): string {
  const section = sectionForType(item.type);
  return `${section.path}/${item.slug}`;
}
```

- [ ] **Step 4: Write `lib/useQueryState.ts`**

```ts
// packages/public-site/src/lib/useQueryState.ts
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface ResultsQuery {
  q: string;
  soort: string[];
  bron: string[];
  doelgroep: string[];
  sort: 'rel' | 'date' | 'az';
}

function csv(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

/**
 * Reads/writes the Results page's filter state as URL search params, so a
 * filtered result set is always a shareable, bookmarkable link — never only
 * component state.
 */
export function useQueryState(): [ResultsQuery, (next: Partial<ResultsQuery>) => void] {
  const [params, setParams] = useSearchParams();

  const query = useMemo<ResultsQuery>(
    () => ({
      q: params.get('q') ?? '',
      soort: csv(params.get('soort')),
      bron: csv(params.get('bron')),
      doelgroep: csv(params.get('doelgroep')),
      sort: (params.get('sort') as ResultsQuery['sort']) ?? 'rel',
    }),
    [params]
  );

  const setQuery = useCallback(
    (next: Partial<ResultsQuery>) => {
      const merged: ResultsQuery = { ...query, ...next };
      const nextParams = new URLSearchParams();
      if (merged.q) nextParams.set('q', merged.q);
      if (merged.soort.length) nextParams.set('soort', merged.soort.join(','));
      if (merged.bron.length) nextParams.set('bron', merged.bron.join(','));
      if (merged.doelgroep.length) nextParams.set('doelgroep', merged.doelgroep.join(','));
      if (merged.sort !== 'rel') nextParams.set('sort', merged.sort);
      setParams(nextParams, { replace: true });
    },
    [query, setParams]
  );

  return [query, setQuery];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=@ronl/public-site -- slug.test.ts useQueryState.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/public-site/src/lib/slug.ts packages/public-site/src/lib/slug.test.ts \
  packages/public-site/src/lib/useQueryState.ts packages/public-site/src/lib/useQueryState.test.tsx
git commit -m "feat(public-site): detail-URL builder and URL-backed query state"
```

---

### Task 11: `lib/search.ts` (highlight) + chrome components

**Files:**

- Create: `packages/public-site/src/lib/search.ts`
- Create: `packages/public-site/src/lib/search.test.tsx`
- Create: `packages/public-site/src/components/SkipLink.tsx`
- Create: `packages/public-site/src/components/TopBar.tsx`
- Create: `packages/public-site/src/components/MainNav.tsx`
- Create: `packages/public-site/src/components/SearchForm.tsx`
- Create: `packages/public-site/src/components/TypeTag.tsx`
- Create: `packages/public-site/src/components/Hit.tsx`
- Create: `packages/public-site/src/components/Facet.tsx`
- Create: `packages/public-site/src/components/Crumbs.tsx`
- Create: `packages/public-site/src/components/Callout.tsx`
- Create: `packages/public-site/src/components/TechDetails.tsx`
- Create: `packages/public-site/src/components/Tabs.tsx`
- Create: `packages/public-site/src/components/Footer.tsx`
- Create: `packages/public-site/src/components/chrome.test.tsx`

**Interfaces:**

- Consumes: `Translations`/`Lang` (Task 8), `PUB_SECTIONS`/`PubType`/`PUB_TYPE_LABEL`/`sectionLabel`/`WOORDENBOEK_PATH` (Task 8), `hrefFor` (Task 10), `PublicHit` (Task 9).
- Produces: `highlight(text: string, q: string): React.ReactNode`, `truncate(text: string, max: number): string` (`lib/search.ts`) and all twelve chrome components — consumed by every page from Task 12 onward.

This is the DoD's **`search.test.ts`** file (client side): it covers highlighting, not the search algorithm itself (that's `search.service.test.ts` in Phase 1 — see the "Deviation" note in Global Constraints).

- [ ] **Step 1: Write the failing test for `lib/search.ts`**

```ts
// packages/public-site/src/lib/search.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { highlight, truncate } from './search';

describe('highlight', () => {
  it('wraps matching terms (3+ chars) in <mark>, case-insensitively', () => {
    const { container } = render(<>{highlight('Zorgtoeslag aanvragen', 'zorg')}</>);
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('Zorg');
  });

  it('ignores terms shorter than 3 characters (matches the prototype)', () => {
    const { container } = render(<>{highlight('De aanvraag', 'de')}</>);
    expect(container.querySelector('mark')).toBeNull();
  });

  it('returns the plain text unchanged when the query is empty', () => {
    const { container } = render(<>{highlight('Plain text', '')}</>);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('Plain text');
  });

  it('never throws on regex metacharacters and never renders them as regex', () => {
    expect(() => render(<>{highlight('Cost: $100 (approx.)', '$100 (approx.)')}</>)).not.toThrow();
  });

  it('handles an empty/null text gracefully', () => {
    const { container } = render(<>{highlight('', 'zorg')}</>);
    expect(container.textContent).toBe('');
  });
});

describe('truncate', () => {
  it('leaves short text untouched', () => {
    expect(truncate('short', 210)).toBe('short');
  });

  it('cuts long text and appends an ellipsis', () => {
    const long = 'a'.repeat(300);
    const result = truncate(long, 210);
    expect(result).toHaveLength(211); // 210 chars + …
    expect(result.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/public-site -- lib/search.test.tsx`
Expected: FAIL — `./search` doesn't exist

- [ ] **Step 3: Write `lib/search.ts`**

```tsx
// packages/public-site/src/lib/search.ts
import { Fragment, type ReactNode } from 'react';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits text into React nodes, wrapping query-term matches in <mark>.
 * Never uses dangerouslySetInnerHTML — matches only terms of 3+ characters,
 * same as the prototype, so short/common words don't light up the whole page.
 */
export function highlight(text: string, q: string): ReactNode {
  if (!text) return '';
  const terms = q
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .map(escapeRegExp);
  if (!terms.length) return text;

  const re = new RegExp(`(${terms.join('|')})`, 'ig');
  return text
    .split(re)
    .map((chunk, i) =>
      re.test(chunk) && i % 2 === 1 ? (
        <mark key={i}>{chunk}</mark>
      ) : (
        <Fragment key={i}>{chunk}</Fragment>
      )
    );
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/public-site -- lib/search.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the chrome components**

```tsx
// packages/public-site/src/components/SkipLink.tsx
export default function SkipLink({ label }: { label: string }) {
  return (
    <a className="pub-skip" href="#pub-main">
      {label}
    </a>
  );
}
```

```tsx
// packages/public-site/src/components/TopBar.tsx
import { Link } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';

interface Props {
  t: Translations;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}

export default function TopBar({ t, lang, onLangChange }: Props) {
  return (
    <div className="pub-topbar">
      <div className="pub-wrap">
        <Link className="pub-wordmark" to="/">
          <span className="pub-mark" aria-hidden="true" />
          <span>
            <b>{t.org}</b>
            <span>{t.orgSub}</span>
          </span>
        </Link>
        <div className="pub-topbar-right">
          <div className="pub-lang" role="group" aria-label="Taal / Language">
            <button
              type="button"
              aria-pressed={lang === 'nl'}
              onClick={() => onLangChange('nl')}
              lang="nl"
            >
              NL
            </button>
            <button
              type="button"
              aria-pressed={lang === 'en'}
              onClick={() => onLangChange('en')}
              lang="en"
            >
              EN
            </button>
          </div>
          <a className="pub-login" href={import.meta.env.VITE_STAFF_APP_URL}>
            {t.login} →
          </a>
        </div>
      </div>
    </div>
  );
}
```

```tsx
// packages/public-site/src/components/MainNav.tsx
import { NavLink } from 'react-router-dom';
import type { Lang } from '../i18n';
import { PUB_SECTIONS, WOORDENBOEK_PATH, sectionLabel } from '../lib/sections';

export default function MainNav({ lang }: { lang: Lang }) {
  return (
    <nav className="pub-nav" aria-label={lang === 'nl' ? 'Hoofdnavigatie' : 'Main navigation'}>
      <div className="pub-wrap">
        <ul>
          <li>
            <NavLink to="/" end>
              {lang === 'nl' ? 'Home' : 'Home'}
            </NavLink>
          </li>
          {PUB_SECTIONS.map((s) => (
            <li key={s.id}>
              <NavLink to={s.path}>{sectionLabel(s, lang)}</NavLink>
            </li>
          ))}
          <li>
            <NavLink to={WOORDENBOEK_PATH}>
              {lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary'}
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
}
```

React Router's `NavLink` sets `aria-current="page"` on the active link automatically, matching `.pub-nav a[aria-current=page]` in `pub.css` — no manual `aria-current` wiring needed here (unlike the prototype's hand-rolled `PubNav`, which had to do it itself because it wasn't using a router).

```tsx
// packages/public-site/src/components/SearchForm.tsx
import { useEffect, useState, type FormEvent } from 'react';
import type { Translations } from '../i18n';

interface Props {
  t: Translations;
  value: string;
  onSubmit: (q: string) => void;
  id?: string;
}

export default function SearchForm({ t, value, onSubmit, id = 'pub-q' }: Props) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(v.trim());
  }

  return (
    <form className="pub-searchform" role="search" onSubmit={handleSubmit}>
      <label htmlFor={id} className="pub-sr-only">
        {t.searchLabel}
      </label>
      <input
        id={id}
        type="search"
        value={v}
        placeholder={t.placeholder}
        autoComplete="off"
        onChange={(e) => setV(e.target.value)}
      />
      <button type="submit">
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="2.2" />
          <path
            d="M13.5 13.5 18 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        {t.search}
      </button>
    </form>
  );
}
```

```tsx
// packages/public-site/src/components/TypeTag.tsx
import type { Lang } from '../i18n';
import { PUB_TYPE_LABEL, type PubType } from '../lib/sections';

export default function TypeTag({ type, lang }: { type: PubType; lang: Lang }) {
  return <span className={`pub-type t-${type}`}>{PUB_TYPE_LABEL[type][lang]}</span>;
}
```

```tsx
// packages/public-site/src/components/Hit.tsx
import { Link } from 'react-router-dom';
import type { Lang } from '../i18n';
import type { PublicHit } from '../lib/api';
import { hrefFor } from '../lib/slug';
import { highlight, truncate } from '../lib/search';
import TypeTag from './TypeTag';

export default function Hit({ item, q, lang }: { item: PublicHit; q: string; lang: Lang }) {
  return (
    <article className="pub-hit">
      <div className="pub-meta">
        <TypeTag type={item.type} lang={lang} />
        <span>{item.org}</span>
        {item.date && (
          <>
            <span className="pub-sep">·</span>
            <span>{item.date}</span>
          </>
        )}
      </div>
      <h3>
        <Link to={hrefFor(item)}>{highlight(item.title, q)}</Link>
      </h3>
      <p>{highlight(truncate(item.summary || '', 210), q)}</p>
    </article>
  );
}
```

```tsx
// packages/public-site/src/components/Facet.tsx
export interface FacetOption {
  value: string;
  count: number;
  label?: string;
}

interface Props {
  legend: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
}

export default function Facet({ legend, options, selected, onToggle }: Props) {
  return (
    <fieldset className="pub-facet">
      <legend>{legend}</legend>
      {options.map((opt) => (
        <label key={opt.value}>
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => onToggle(opt.value)}
          />
          <span>{opt.label ?? opt.value}</span>
          <span className="pub-fc">{opt.count}</span>
        </label>
      ))}
    </fieldset>
  );
}
```

```tsx
// packages/public-site/src/components/Crumbs.tsx
import { Link } from 'react-router-dom';
import type { Lang } from '../i18n';

export interface Crumb {
  label: string;
  to?: string;
}

export default function Crumbs({ lang, trail }: { lang: Lang; trail: Crumb[] }) {
  return (
    <nav className="pub-crumbs" aria-label={lang === 'nl' ? 'kruimelpad' : 'breadcrumb'}>
      {trail.map((c, i) => (
        <span key={i}>
          {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
          {i < trail.length - 1 && <span aria-hidden="true"> › </span>}
        </span>
      ))}
    </nav>
  );
}
```

```tsx
// packages/public-site/src/components/Callout.tsx
import type { ReactNode } from 'react';

export default function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pub-callout">
      <b>{title}</b>
      {children}
    </div>
  );
}
```

```tsx
// packages/public-site/src/components/TechDetails.tsx
import type { Translations } from '../i18n';

export default function TechDetails({ t, rows }: { t: Translations; rows: [string, string][] }) {
  return (
    <details className="pub-tech">
      <summary>{t.tech}</summary>
      <div className="pub-tech-in">
        <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginBottom: 12 }}>{t.techLede}</p>
        <table className="pub-kv">
          <tbody>
            {rows.map(([k, v], i) => (
              <tr key={i}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
```

`<details>` is collapsed by default (no `open` attribute) and expands on click/Enter/Space natively — this is what satisfies the DoD's `Detail.test.tsx` requirement ("technical details are collapsed and expandable"), tested against the page that uses it in Task 17.

```tsx
// packages/public-site/src/components/Tabs.tsx
export interface TabItem {
  id: string;
  label: string;
  count: number;
}

interface Props {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export default function Tabs({ tabs, active, onChange }: Props) {
  return (
    <div className="pub-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          <span className="pub-tc">{tab.count}</span>
        </button>
      ))}
    </div>
  );
}
```

```tsx
// packages/public-site/src/components/Footer.tsx
import { Link } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';
import { PUB_SECTIONS, WOORDENBOEK_PATH, sectionLabel } from '../lib/sections';

export default function Footer({ t, lang }: { t: Translations; lang: Lang }) {
  return (
    <footer className="pub-footer">
      <div className="pub-wrap">
        <div className="pub-footer-cols">
          <div>
            <h2>{t.footerAbout}</h2>
            <p style={{ color: 'var(--ro-ink-2)', maxWidth: '40ch' }}>{t.footerNote}</p>
          </div>
          <div>
            <h2>{t.footerBrowse}</h2>
            <ul>
              {PUB_SECTIONS.map((s) => (
                <li key={s.id}>
                  <Link to={s.path}>{sectionLabel(s, lang)}</Link>
                </li>
              ))}
              <li>
                <Link to={WOORDENBOEK_PATH}>
                  {lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary'}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>{t.footerLegal}</h2>
            <ul>
              <li>
                <Link to="/toegankelijkheid">{t.footerLinks[0][0]}</Link>
              </li>
              <li>
                <Link to="/open-data">{t.footerLinks[1][0]}</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="pub-footer-bottom">
          <span>Open Regels Nederland · Provincie Flevoland</span>
          <span style={{ fontFamily: 'var(--pub-mono)', fontSize: 12.5 }}>
            publiek.open-regels.nl
          </span>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 6: Write `components/chrome.test.tsx`** (one file covering the interactive pieces of all twelve — the rest are pure markup, exercised indirectly by every page test from Task 12 on)

```tsx
// packages/public-site/src/components/chrome.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SkipLink from './SkipLink';
import TopBar from './TopBar';
import SearchForm from './SearchForm';
import Facet from './Facet';
import Tabs from './Tabs';
import TechDetails from './TechDetails';
import { translations } from '../i18n';

const t = translations.nl;

describe('SkipLink', () => {
  it('links to #pub-main', () => {
    render(<SkipLink label="Direct naar de inhoud" />);
    expect(screen.getByText('Direct naar de inhoud')).toHaveAttribute('href', '#pub-main');
  });
});

describe('TopBar', () => {
  it('calls onLangChange with the clicked language', () => {
    const onLangChange = vi.fn();
    render(
      <MemoryRouter>
        <TopBar t={t} lang="nl" onLangChange={onLangChange} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(onLangChange).toHaveBeenCalledWith('en');
  });

  it('marks the active language with aria-pressed', () => {
    render(
      <MemoryRouter>
        <TopBar t={t} lang="nl" onLangChange={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'NL' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('SearchForm', () => {
  it('submits the trimmed value', () => {
    const onSubmit = vi.fn();
    render(<SearchForm t={t} value="" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(t.searchLabel), {
      target: { value: '  zorgtoeslag  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.search) }));
    expect(onSubmit).toHaveBeenCalledWith('zorgtoeslag');
  });
});

describe('Facet', () => {
  it('reports the toggled value and reflects checked state', () => {
    const onToggle = vi.fn();
    render(
      <Facet
        legend="Soort"
        options={[{ value: 'regel', count: 3 }]}
        selected={['regel']}
        onToggle={onToggle}
      />
    );
    const checkbox = screen.getByRole('checkbox', { name: /regel/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('regel');
  });
});

describe('Tabs', () => {
  it('marks the active tab via aria-selected and reports clicks', () => {
    const onChange = vi.fn();
    render(
      <Tabs
        tabs={[
          { id: 'a', label: 'A', count: 1 },
          { id: 'b', label: 'B', count: 2 },
        ]}
        active="a"
        onChange={onChange}
      />
    );
    expect(screen.getByRole('tab', { name: /^A/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /^B/ }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('TechDetails', () => {
  it('is collapsed by default and expands on click', () => {
    render(<TechDetails t={t} rows={[['key', 'value']]} />);
    const details = screen.getByText(t.tech).closest('details')!;
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText(t.tech));
    expect(details).toHaveAttribute('open');
  });
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test --workspace=@ronl/public-site -- chrome.test.tsx lib/search.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 8: Commit**

```bash
git add packages/public-site/src/lib/search.ts packages/public-site/src/lib/search.test.tsx \
  packages/public-site/src/components
git commit -m "feat(public-site): highlight util + chrome components (nav, search, hit, facet, tabs, footer)"
```

---

### Task 12: `App.tsx` routing shell + Home (variant B) + NotFound

**Files:**

- Create: `packages/public-site/src/App.tsx`
- Create: `packages/public-site/src/App.test.tsx`
- Create: `packages/public-site/src/pages/Home.tsx`
- Create: `packages/public-site/src/pages/NotFound.tsx`

**Interfaces:**

- Consumes: everything from Tasks 8–11. Placeholder imports for pages not yet built (Results, SectionIndex, Regelcatalogus, Woordenboek, Detail, Toegankelijkheid, OpenData) are added as stubs in this task and filled in by Tasks 14–18 — `App.tsx` is the one file every later page task touches to register its route, so it's written once here with real stub components rather than left as a dangling TODO.
- Produces: the `lang`/`setLang` state (lifted to `App`, persisted nowhere — resets to `nl` per DoD's "NL/EN switch" with no persistence requirement) and `document.documentElement.lang` sync, consumed implicitly by every page via the `lang`/`t` props `App` passes down.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/public-site/src/App.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

describe('App', () => {
  it('renders the skip link as the first focusable element', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText('Direct naar de inhoud')).toHaveAttribute('href', '#pub-main');
  });

  it('renders Home by default with the six/five section cards', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /Regelcatalogus/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Procesbibliotheek/ })).toBeInTheDocument();
  });

  it('switching language updates document.documentElement.lang and visible copy', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('link', { name: /Rule catalogue/ })).toBeInTheDocument();
  });

  it('renders NotFound for an unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: /niet gevonden|not found/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/public-site -- App.test.tsx`
Expected: FAIL — `./App` doesn't exist

- [ ] **Step 3: Write `pages/NotFound.tsx`**

```tsx
// packages/public-site/src/pages/NotFound.tsx
import { Link } from 'react-router-dom';
import type { Lang } from '../i18n';

export default function NotFound({ lang }: { lang: Lang }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <h1 className="pub-section-h">
          {lang === 'nl' ? 'Pagina niet gevonden' : 'Page not found'}
        </h1>
        <p className="pub-lede-2">
          {lang === 'nl'
            ? 'Deze pagina bestaat niet (meer). Ga terug naar de homepage of zoek opnieuw.'
            : 'This page does not (or no longer) exist. Go back to the homepage or search again.'}
        </p>
        <p>
          <Link to="/">{lang === 'nl' ? '← Terug naar home' : '← Back to home'}</Link>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Write `pages/Home.tsx`**

```tsx
// packages/public-site/src/pages/Home.tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';
import { PUB_SECTIONS, sectionLabel, sectionSub, type PubType } from '../lib/sections';
import { getBerichten, getNieuws, getProducten, getRegelcatalogus, getProcessen } from '../lib/api';
import SearchForm from '../components/SearchForm';
import TypeTag from '../components/TypeTag';

export default function Home({ t, lang }: { t: Translations; lang: Lang }) {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Partial<Record<PubType, number>>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      getBerichten(1),
      getNieuws(1),
      getProducten(1),
      getRegelcatalogus(),
      getProcessen(),
    ]).then(([b, n, p, r, proc]) => {
      if (cancelled) return;
      setCounts({
        bericht: b.status === 'fulfilled' ? b.value.total : 0,
        nieuws: n.status === 'fulfilled' ? n.value.total : 0,
        product: p.status === 'fulfilled' ? p.value.total : 0,
        regel: r.status === 'fulfilled' ? r.value.services.length : 0,
        proces: proc.status === 'fulfilled' ? proc.value.length : 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSearch(q: string) {
    navigate(q ? `/zoeken?q=${encodeURIComponent(q)}` : '/zoeken');
  }

  return (
    <>
      <div
        style={{
          background: 'var(--ro-bg)',
          borderBottom: '1px solid var(--ro-rule-2)',
          padding: '26px 0',
        }}
      >
        <div
          className="pub-wrap"
          style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 22rem', minWidth: 0 }}>
            <SearchForm t={t} value="" onSubmit={handleSearch} id="pub-q-bar" />
          </div>
          <p style={{ fontSize: 14, color: 'var(--ro-ink-2)', flex: '0 1 20rem' }}>
            {lang === 'nl'
              ? 'Doorzoekt alle vijf bronnen tegelijk — berichten, nieuws, producten, regels en processen.'
              : 'Searches all five sources at once — announcements, news, products, rules and processes.'}
          </p>
        </div>
      </div>
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">
          <h1 className="pub-section-h" style={{ fontSize: 30 }}>
            {t.heroTitle}
          </h1>
          <p className="pub-lede-2" style={{ fontSize: 17 }}>
            {t.heroLede}
          </p>
          <div className="pub-cards" style={{ marginTop: 8 }}>
            {PUB_SECTIONS.map((s) => (
              <Link key={s.id} to={s.path} className="pub-card" style={{ minHeight: 168 }}>
                <span style={{ alignSelf: 'flex-start' }}>
                  <TypeTag type={s.type} lang={lang} />
                </span>
                <h3 style={{ fontSize: 20, marginTop: 4 }}>{sectionLabel(s, lang)}</h3>
                <p>{sectionSub(s, lang)}</p>
                <span className="pub-count">
                  {counts[s.type] ?? '…'} {lang === 'nl' ? 'items' : 'items'} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 5: Write `App.tsx`, with stub pages for Tasks 14–18**

```tsx
// packages/public-site/src/App.tsx
import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { translations, type Lang } from './i18n';
import SkipLink from './components/SkipLink';
import TopBar from './components/TopBar';
import MainNav from './components/MainNav';
import Footer from './components/Footer';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Results from './pages/Results';
import SectionIndex from './pages/SectionIndex';
import Regelcatalogus from './pages/Regelcatalogus';
import Woordenboek from './pages/Woordenboek';
import Detail from './pages/Detail';
import Toegankelijkheid from './pages/Toegankelijkheid';
import OpenData from './pages/OpenData';

export default function App() {
  const [lang, setLang] = useState<Lang>('nl');
  const t = translations[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="pub">
      <SkipLink label={t.skip} />
      <TopBar t={t} lang={lang} onLangChange={setLang} />
      <MainNav lang={lang} />
      <Routes>
        <Route path="/" element={<Home t={t} lang={lang} />} />
        <Route path="/zoeken" element={<Results t={t} lang={lang} />} />
        <Route path="/berichten" element={<SectionIndex t={t} lang={lang} type="bericht" />} />
        <Route path="/berichten/:slug" element={<Detail t={t} lang={lang} type="bericht" />} />
        <Route path="/nieuws" element={<SectionIndex t={t} lang={lang} type="nieuws" />} />
        <Route path="/nieuws/:slug" element={<Detail t={t} lang={lang} type="nieuws" />} />
        <Route path="/producten" element={<SectionIndex t={t} lang={lang} type="product" />} />
        <Route path="/producten/:slug" element={<Detail t={t} lang={lang} type="product" />} />
        <Route path="/regels" element={<Regelcatalogus t={t} lang={lang} />} />
        <Route path="/regels/:slug" element={<Detail t={t} lang={lang} type="regel" />} />
        <Route path="/processen" element={<SectionIndex t={t} lang={lang} type="proces" />} />
        <Route path="/processen/:slug" element={<Detail t={t} lang={lang} type="proces" />} />
        <Route path="/woordenboek" element={<Woordenboek lang={lang} />} />
        <Route path="/toegankelijkheid" element={<Toegankelijkheid lang={lang} />} />
        <Route path="/open-data" element={<OpenData lang={lang} />} />
        <Route path="*" element={<NotFound lang={lang} />} />
      </Routes>
      <Footer t={t} lang={lang} />
    </div>
  );
}
```

- [ ] **Step 6: Write stub pages so `App.tsx` typechecks (Tasks 14–18 replace these bodies)**

```tsx
// packages/public-site/src/pages/Results.tsx
import type { Translations, Lang } from '../i18n';
export default function Results(_props: { t: Translations; lang: Lang }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap" />
    </main>
  );
}
```

```tsx
// packages/public-site/src/pages/SectionIndex.tsx
import type { Translations, Lang } from '../i18n';
import type { PubType } from '../lib/sections';
export default function SectionIndex(_props: { t: Translations; lang: Lang; type: PubType }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap" />
    </main>
  );
}
```

```tsx
// packages/public-site/src/pages/Regelcatalogus.tsx
import type { Translations, Lang } from '../i18n';
export default function Regelcatalogus(_props: { t: Translations; lang: Lang }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap" />
    </main>
  );
}
```

```tsx
// packages/public-site/src/pages/Woordenboek.tsx
import type { Lang } from '../i18n';
export default function Woordenboek(_props: { lang: Lang }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap" />
    </main>
  );
}
```

```tsx
// packages/public-site/src/pages/Detail.tsx
import type { Translations, Lang } from '../i18n';
import type { PubType } from '../lib/sections';
export default function Detail(_props: { t: Translations; lang: Lang; type: PubType }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap" />
    </main>
  );
}
```

```tsx
// packages/public-site/src/pages/Toegankelijkheid.tsx
import type { Lang } from '../i18n';
export default function Toegankelijkheid(_props: { lang: Lang }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap" />
    </main>
  );
}
```

```tsx
// packages/public-site/src/pages/OpenData.tsx
import type { Lang } from '../i18n';
export default function OpenData(_props: { lang: Lang }) {
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap" />
    </main>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/public-site -- App.test.tsx`
Expected: PASS (4 tests). The Home-related assertions will pass even though `Home` fetches data the test doesn't mock — `getBerichten` etc. reject (no `fetch` in that test's scope isn't stubbed), `Promise.allSettled` swallows the rejections, and `counts` stays `{}`, which only affects the `… items →` text, not the section links/labels the test checks.

Run: `npm run type-check --workspace=@ronl/public-site`
Expected: PASS — every import in `App.tsx` now resolves.

- [ ] **Step 8: Commit**

```bash
git add packages/public-site/src/App.tsx packages/public-site/src/App.test.tsx \
  packages/public-site/src/pages/Home.tsx packages/public-site/src/pages/NotFound.tsx \
  packages/public-site/src/pages/Results.tsx packages/public-site/src/pages/SectionIndex.tsx \
  packages/public-site/src/pages/Regelcatalogus.tsx packages/public-site/src/pages/Woordenboek.tsx \
  packages/public-site/src/pages/Detail.tsx packages/public-site/src/pages/Toegankelijkheid.tsx \
  packages/public-site/src/pages/OpenData.tsx
git commit -m "feat(public-site): routing shell, Home (variant B), NotFound, page stubs"
```

---

## Phase 3 — Search results, section browsing, rule catalogue, detail pages

### Task 13: Results page (federated search)

**Files:**

- Modify: `packages/public-site/src/pages/Results.tsx` (replace the Task 12 stub)
- Create: `packages/public-site/src/pages/Results.test.tsx`

**Interfaces:**

- Consumes: `useQueryState`/`ResultsQuery` (Task 10), `searchPublic`/`SearchResponse` (Task 9), `SearchForm`/`Facet`/`Hit`/`Crumbs` (Task 11), `PUB_TYPE_LABEL`/`PubType` (Task 8).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/public-site/src/pages/Results.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Results from './Results';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, searchPublic: vi.fn() };
});

const t = translations.nl;

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Results t={t} lang="nl" />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Results', () => {
  it('shows a result count and hits once loaded', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [
        {
          id: 'a',
          slug: 'a',
          type: 'regel',
          title: 'Zorgtoeslag',
          summary: 'Toeslag',
          org: 'X',
          date: null,
          audience: [],
          external: null,
          facts: [],
          tech: [],
        },
      ],
      total: 1,
      facets: { soort: [['regel', 1]], bron: [['X', 1]], doelgroep: [] },
    });
    renderAt('/zoeken?q=zorg');
    await waitFor(() => expect(screen.getByText(/1 resultaten voor/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Zorgtoeslag/ })).toBeInTheDocument();
  });

  it('shows the empty state with a real suggestion when there are no hits', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [],
      total: 0,
      facets: { soort: [], bron: [], doelgroep: [] },
    });
    renderAt('/zoeken?q=xyzxyz');
    await waitFor(() => expect(screen.getByText(t.noResults)).toBeInTheDocument());
    expect(screen.getByText(t.noResultsBody)).toBeInTheDocument();
  });

  it('checking a type facet adds it to the URL and re-queries', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [],
      total: 0,
      facets: { soort: [['regel', 2]], bron: [], doelgroep: [] },
    });
    renderAt('/zoeken');
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Regel/ })).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Regel/ }));
    await waitFor(() =>
      expect(api.searchPublic).toHaveBeenLastCalledWith(
        expect.objectContaining({ soort: ['regel'] })
      )
    );
  });

  it('the result counter lives in an aria-live=polite region', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [],
      total: 0,
      facets: { soort: [], bron: [], doelgroep: [] },
    });
    renderAt('/zoeken');
    await waitFor(() => {
      const region = screen.getByText(/items in de kennisbank/).closest('[aria-live]');
      expect(region).toHaveAttribute('aria-live', 'polite');
    });
  });

  it('"clear filters" resets soort/bron/doelgroep but keeps q', async () => {
    vi.mocked(api.searchPublic).mockResolvedValue({
      items: [],
      total: 0,
      facets: { soort: [['regel', 1]], bron: [], doelgroep: [] },
    });
    renderAt('/zoeken?q=zorg&soort=regel');
    await waitFor(() => expect(screen.getByText(/Alle filters wissen/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Alle filters wissen/));
    await waitFor(() =>
      expect(api.searchPublic).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'zorg', soort: [], bron: [], doelgroep: [] })
      )
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/public-site -- pages/Results.test.tsx`
Expected: FAIL — the Task 12 stub renders none of this

- [ ] **Step 3: Write `pages/Results.tsx`**

```tsx
// packages/public-site/src/pages/Results.tsx
import { useEffect, useState } from 'react';
import type { Translations, Lang } from '../i18n';
import { PUB_TYPE_LABEL, type PubType } from '../lib/sections';
import { searchPublic, type SearchResponse } from '../lib/api';
import { useQueryState, type ResultsQuery } from '../lib/useQueryState';
import SearchForm from '../components/SearchForm';
import Facet, { type FacetOption } from '../components/Facet';
import Hit from '../components/Hit';
import Crumbs from '../components/Crumbs';

function labelledOptions(
  pairs: [string, number][],
  labelFor?: (v: string) => string
): FacetOption[] {
  return pairs.map(([value, count]) => ({ value, count, label: labelFor?.(value) }));
}

export default function Results({ t, lang }: { t: Translations; lang: Lang }) {
  const [query, setQuery] = useQueryState();
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const facetKey = `${query.q}|${query.soort.join(',')}|${query.bron.join(',')}|${query.doelgroep.join(',')}|${query.sort}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchPublic(query)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(lang === 'nl' ? 'Zoeken is mislukt.' : 'Search failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetKey]);

  function toggle(key: 'soort' | 'bron' | 'doelgroep', value: string) {
    const current = query[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setQuery({ [key]: next } as Partial<ResultsQuery>);
  }

  const activeCount = query.soort.length + query.bron.length + query.doelgroep.length;

  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <Crumbs lang={lang} trail={[{ label: t.navHome, to: '/' }, { label: t.results }]} />
        <div style={{ maxWidth: '44rem', marginBottom: 26 }}>
          <SearchForm t={t} value={query.q} onSubmit={(q) => setQuery({ q })} id="pub-q-results" />
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="pub-results">
          <div className="pub-facets" role="region" aria-label={t.filters}>
            <h2>{t.filters}</h2>
            <Facet
              legend={t.type}
              options={labelledOptions(
                data?.facets.soort ?? [],
                (v) => PUB_TYPE_LABEL[v as PubType]?.[lang] ?? v
              )}
              selected={query.soort}
              onToggle={(v) => toggle('soort', v)}
            />
            <Facet
              legend={t.source}
              options={labelledOptions(data?.facets.bron ?? [])}
              selected={query.bron}
              onToggle={(v) => toggle('bron', v)}
            />
            <Facet
              legend={t.audience}
              options={labelledOptions(data?.facets.doelgroep ?? [])}
              selected={query.doelgroep}
              onToggle={(v) => toggle('doelgroep', v)}
            />
            {activeCount > 0 && (
              <button
                type="button"
                className="pub-clear"
                onClick={() => setQuery({ soort: [], bron: [], doelgroep: [] })}
              >
                {t.clear} ({activeCount})
              </button>
            )}
          </div>
          <div>
            <div className="pub-resulthead">
              <div>
                <h1 style={{ fontSize: 24 }}>{query.q ? `“${query.q}”` : t.results}</h1>
                <p aria-live="polite" style={{ marginTop: 4 }}>
                  {loading
                    ? lang === 'nl'
                      ? 'Zoeken…'
                      : 'Searching…'
                    : `${data?.total ?? 0} ${query.q ? `${t.resultsFor} “${query.q}”` : t.allResults}`}
                </p>
              </div>
              <div className="pub-sort">
                <label htmlFor="pub-sort">{t.sort}</label>
                <select
                  id="pub-sort"
                  value={query.sort}
                  onChange={(e) => setQuery({ sort: e.target.value as ResultsQuery['sort'] })}
                >
                  <option value="rel">{t.sortRel}</option>
                  <option value="date">{t.sortDate}</option>
                  <option value="az">{t.sortAz}</option>
                </select>
              </div>
            </div>
            {!loading && data && data.items.length === 0 ? (
              <div className="pub-empty">
                <h3>{t.noResults}</h3>
                <p style={{ color: 'var(--ro-ink-2)' }}>{t.noResultsBody}</p>
              </div>
            ) : (
              (data?.items ?? []).map((item) => (
                <Hit key={item.id} item={item} q={query.q} lang={lang} />
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/public-site -- pages/Results.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/public-site/src/pages/Results.tsx packages/public-site/src/pages/Results.test.tsx
git commit -m "feat(public-site): Results page — federated search with URL-backed facets"
```

---

### Task 14: SectionIndex page (Berichten, Nieuws, Producten, Processen)

**Files:**

- Modify: `packages/public-site/src/pages/SectionIndex.tsx` (replace the Task 12 stub)
- Create: `packages/public-site/src/pages/SectionIndex.test.tsx`

**Interfaces:**

- Consumes: `getBerichten`, `getNieuws`, `getProducten`, `getProcessen` (Task 9), `Hit`/`SearchForm`/`Crumbs` (Task 11), `sectionForType`/`sectionLabel`/`sectionSub` (Task 8).
- Not used for `type="regel"` — `/regels` routes to the dedicated `Regelcatalogus` page (Task 15) instead, which is why `App.tsx` (Task 12) never mounts `<SectionIndex type="regel" />`.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/public-site/src/pages/SectionIndex.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SectionIndex from './SectionIndex';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getBerichten: vi.fn() };
});

const t = translations.nl;
beforeEach(() => vi.clearAllMocks());

describe('SectionIndex (berichten)', () => {
  it('lists fetched items and shows a live item count', async () => {
    vi.mocked(api.getBerichten).mockResolvedValue({
      items: [
        {
          id: 'b1',
          subject: 'Wegwerkzaamheden',
          preview: 'De N23 is dicht.',
          content: null,
          publishedAt: '2026-07-01',
          sender: { id: 'x', name: 'Provincie Flevoland' },
        },
        {
          id: 'b2',
          subject: 'Subsidieronde open',
          preview: 'Vraag nu aan.',
          content: null,
          publishedAt: '2026-07-02',
          sender: { id: 'x', name: 'Provincie Flevoland' },
        },
      ],
      total: 2,
    });
    render(
      <MemoryRouter initialEntries={['/berichten']}>
        <SectionIndex t={t} lang="nl" type="bericht" />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Wegwerkzaamheden/ })).toBeInTheDocument()
    );
    expect(screen.getByText('2 items')).toHaveAttribute('aria-live', 'polite');
  });

  it('a local filter narrows the visible items by title', async () => {
    vi.mocked(api.getBerichten).mockResolvedValue({
      items: [
        {
          id: 'b1',
          subject: 'Wegwerkzaamheden',
          preview: '',
          content: null,
          publishedAt: null,
          sender: { id: 'x', name: 'X' },
        },
        {
          id: 'b2',
          subject: 'Subsidieronde open',
          preview: '',
          content: null,
          publishedAt: null,
          sender: { id: 'x', name: 'X' },
        },
      ],
      total: 2,
    });
    render(
      <MemoryRouter initialEntries={['/berichten']}>
        <SectionIndex t={t} lang="nl" type="bericht" />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Wegwerkzaamheden/ })).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(t.searchLabel), { target: { value: 'subsidie' } });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Wegwerkzaamheden/ })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: /Subsidieronde/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/public-site -- pages/SectionIndex.test.tsx`
Expected: FAIL — the Task 12 stub renders none of this

- [ ] **Step 3: Write `pages/SectionIndex.tsx`**

```tsx
// packages/public-site/src/pages/SectionIndex.tsx
import { useEffect, useMemo, useState } from 'react';
import type { Translations, Lang } from '../i18n';
import { sectionForType, sectionLabel, sectionSub, type PubType } from '../lib/sections';
import { getBerichten, getNieuws, getProducten, getProcessen, type PublicHit } from '../lib/api';
import SearchForm from '../components/SearchForm';
import Hit from '../components/Hit';
import Crumbs from '../components/Crumbs';

async function loadItems(type: PubType): Promise<PublicHit[]> {
  switch (type) {
    case 'bericht': {
      const { items } = await getBerichten(200);
      return items.map((b) => ({
        id: b.id,
        slug: b.id,
        type: 'bericht' as const,
        title: b.subject,
        summary: b.preview,
        org: b.sender.name,
        date: b.publishedAt,
        audience: [],
        external: null,
        facts: [],
        tech: [],
      }));
    }
    case 'nieuws': {
      const { items } = await getNieuws(200);
      return items.map((n) => ({
        id: n.id,
        slug: n.id,
        type: 'nieuws' as const,
        title: n.title,
        summary: n.summary,
        org: n.source.name,
        date: n.publishedAt,
        audience: [],
        external: null,
        facts: [],
        tech: [],
      }));
    }
    case 'product': {
      const { items } = await getProducten(200);
      return items.map((p) => ({
        id: p.id,
        slug: p.id,
        type: 'product' as const,
        title: p.title,
        summary: p.description,
        org: 'Provincie Flevoland',
        date: p.modified,
        audience: p.audience,
        external: null,
        facts: [],
        tech: [],
      }));
    }
    case 'proces': {
      const items = await getProcessen();
      return items.map((p) => ({
        id: p.key,
        slug: p.key,
        type: 'proces' as const,
        title: p.naam,
        summary: p.beschrijving ?? '',
        org: 'Provincie Flevoland',
        date: p.gepubliceerd,
        audience: [],
        external: null,
        facts: [],
        tech: [],
      }));
    }
    case 'regel':
      return []; // Regelcatalogus (Task 15) owns this type
  }
}

export default function SectionIndex({
  t,
  lang,
  type,
}: {
  t: Translations;
  lang: Lang;
  type: PubType;
}) {
  const section = sectionForType(type);
  const [all, setAll] = useState<PublicHit[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadItems(type).then((items) => {
      if (!cancelled) {
        setAll(items);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (item) =>
        item.title.toLowerCase().includes(needle) || item.summary.toLowerCase().includes(needle)
    );
  }, [all, q]);

  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <Crumbs
          lang={lang}
          trail={[{ label: t.navHome, to: '/' }, { label: sectionLabel(section, lang) }]}
        />
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>
          {sectionLabel(section, lang)}
        </h1>
        <p className="pub-lede-2">{sectionSub(section, lang)}</p>
        <div style={{ maxWidth: '34rem', marginBottom: 20 }}>
          <SearchForm t={t} value={q} onSubmit={setQ} id={`pub-q-${section.id}`} />
        </div>
        <p
          aria-live="polite"
          style={{
            fontSize: 14,
            color: 'var(--ro-ink-2)',
            borderBottom: '1px solid var(--ro-rule-2)',
            paddingBottom: 10,
          }}
        >
          {loading ? (lang === 'nl' ? 'Laden…' : 'Loading…') : `${filtered.length} items`}
        </p>
        {!loading && filtered.map((item) => <Hit key={item.id} item={item} q={q} lang={lang} />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/public-site -- pages/SectionIndex.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/public-site/src/pages/SectionIndex.tsx packages/public-site/src/pages/SectionIndex.test.tsx
git commit -m "feat(public-site): SectionIndex page for berichten/nieuws/producten/processen"
```

---

### Task 15: Regelcatalogus page (4 tabs — Organisations / Services / Rules / Concepts)

**Files:**

- Modify: `packages/public-site/src/lib/slug.ts` — add `slugify` (mirrors `packages/backend/src/utils/slug.ts` exactly, so a service card's link and the backend's `/regels/:slug` lookup always agree)
- Modify: `packages/public-site/src/lib/slug.test.ts` — add `slugify` cases
- Modify: `packages/public-site/src/pages/Regelcatalogus.tsx` (replace the Task 12 stub)
- Create: `packages/public-site/src/pages/Regelcatalogus.test.tsx`

**Interfaces:**

- Consumes: `getRegelcatalogus`/`RegelcatalogusData`/`CatalogService` (Task 9), `Tabs`/`Crumbs` (Task 11), `hrefFor` (Task 10).
- Produces: `slugify(input: string): string` added to `lib/slug.ts`, used by `DienstenTab`/`RegelsTab` below to link to `/regels/:slug`.

This is the DoD's explicit **`Regelcatalogus.test.tsx`**: _"every service with `count > 0` renders exactly `count` rule rows; services with 0 rules are absent from the Rules tab."_

- [ ] **Step 1: Add `slugify` to `lib/slug.ts` — write the failing test first**

Change the existing `import { hrefFor } from './slug';` line to also pull in `slugify`:

```ts
import { hrefFor, slugify } from './slug';
```

Then append below the existing `describe('hrefFor', ...)` block:

```ts
describe('slugify', () => {
  it('matches the backend algorithm exactly (lowercase, hyphenated, 64-char cap)', () => {
    expect(slugify('Zorgtoeslag')).toBe('zorgtoeslag');
    expect(slugify('Regeling bekostiging vo-scholen (2026)')).toBe(
      'regeling-bekostiging-vo-scholen-2026'
    );
    expect(slugify('a'.repeat(100))).toHaveLength(64);
  });
});
```

Run: `npm run test --workspace=@ronl/public-site -- lib/slug.test.ts`
Expected: FAIL — `slugify` isn't exported yet

Add to `lib/slug.ts` (same file as `hrefFor`, Task 10):

```ts
/** Kept byte-for-byte identical to packages/backend/src/utils/slug.ts's
 * slugify — a link built here and a lookup resolved there must agree. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}
```

Run: `npm run test --workspace=@ronl/public-site -- lib/slug.test.ts`
Expected: PASS

- [ ] **Step 2: Write the failing test for the page**

```tsx
// packages/public-site/src/pages/Regelcatalogus.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Regelcatalogus from './Regelcatalogus';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getRegelcatalogus: vi.fn() };
});

const t = translations.nl;
const DATA: Awaited<ReturnType<typeof api.getRegelcatalogus>> = {
  services: [
    { uri: 's1', title: 'Zorgtoeslag', description: 'Toeslag' },
    { uri: 's2', title: 'Geen regels dienst', description: 'Leeg' },
  ],
  organizations: [
    {
      uri: 'o1',
      identifier: '1',
      name: 'Belastingdienst',
      homepage: null,
      logo: null,
      services: [{ uri: 's1', title: 'Zorgtoeslag' }],
    },
  ],
  concepts: [
    {
      uri: 'c1',
      prefLabel: 'Toetsingsinkomen',
      exactMatch: null,
      serviceUri: 's1',
      serviceTitle: 'Zorgtoeslag',
    },
  ],
  rules: [
    {
      serviceTitle: 'Zorgtoeslag',
      ruleTitle: 'Recht op zorgtoeslag',
      validFrom: '2026-01-01',
      confidence: 'high',
      description: null,
    },
    {
      serviceTitle: 'Zorgtoeslag',
      ruleTitle: 'Leeftijdseis 18 jaar',
      validFrom: '2026-01-01',
      confidence: 'high',
      description: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getRegelcatalogus).mockResolvedValue(DATA);
});

function renderPage() {
  return render(
    <MemoryRouter>
      <Regelcatalogus t={t} lang="nl" />
    </MemoryRouter>
  );
}

describe('Regelcatalogus', () => {
  it('tab counts match the fetched data', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Organisaties/ })).toBeInTheDocument()
    );
    expect(screen.getByRole('tab', { name: /Organisaties/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: /Diensten/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Regels/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /Begrippen/ })).toHaveTextContent('1');
  });

  it('Rules tab: a service with count > 0 renders exactly that many rows, and 0-rule services are absent', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Regels/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Regels/ }));

    // Zorgtoeslag has 2 rules — both rendered
    expect(await screen.findByText('Recht op zorgtoeslag')).toBeInTheDocument();
    expect(screen.getByText('Leeftijdseis 18 jaar')).toBeInTheDocument();
    expect(screen.getByText('Zorgtoeslag').closest('details')).toHaveTextContent('2 / 2');

    // "Geen regels dienst" has 0 rules — no accordion for it at all
    expect(screen.queryByText('Geen regels dienst')).not.toBeInTheDocument();
  });

  it('Concepts tab: every row links out to Skosmos', async () => {
    renderPage();
    await waitFor(() => screen.getByRole('tab', { name: /Begrippen/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Begrippen/ }));
    const link = await screen.findByRole('link', { name: 'Toetsingsinkomen' });
    expect(link).toHaveAttribute('href', expect.stringContaining('skosmos.open-regels.nl'));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/public-site -- pages/Regelcatalogus.test.tsx`
Expected: FAIL — the Task 12 stub renders none of this

- [ ] **Step 4: Write `pages/Regelcatalogus.tsx`**

```tsx
// packages/public-site/src/pages/Regelcatalogus.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';
import { sectionForType, sectionLabel, sectionSub } from '../lib/sections';
import { getRegelcatalogus, type RegelcatalogusData, type CatalogService } from '../lib/api';
import { slugify, hrefFor } from '../lib/slug';
import Crumbs from '../components/Crumbs';
import Tabs from '../components/Tabs';

type Tab = 'organisaties' | 'diensten' | 'regels' | 'begrippen';

export default function Regelcatalogus({ t, lang }: { t: Translations; lang: Lang }) {
  const section = sectionForType('regel');
  const [data, setData] = useState<RegelcatalogusData | null>(null);
  const [tab, setTab] = useState<Tab>('organisaties');

  useEffect(() => {
    getRegelcatalogus().then(setData);
  }, []);

  if (!data) {
    return (
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">{lang === 'nl' ? 'Laden…' : 'Loading…'}</div>
      </main>
    );
  }

  const servicesWithRules = data.services.filter((s) =>
    data.rules.some((r) => r.serviceTitle === s.title)
  );

  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <Crumbs
          lang={lang}
          trail={[{ label: t.navHome, to: '/' }, { label: sectionLabel(section, lang) }]}
        />
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>
          {sectionLabel(section, lang)}
        </h1>
        <p className="pub-lede-2">{sectionSub(section, lang)}</p>
        <Tabs
          tabs={[
            { id: 'organisaties', label: t.tabOrg, count: data.organizations.length },
            { id: 'diensten', label: t.tabDienst, count: data.services.length },
            { id: 'regels', label: t.tabRegel, count: data.rules.length },
            { id: 'begrippen', label: t.tabBegrip, count: data.concepts.length },
          ]}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
        />
        {tab === 'organisaties' && <OrganisatiesTab organizations={data.organizations} />}
        {tab === 'diensten' && <DienstenTab services={data.services} />}
        {tab === 'regels' && (
          <RegelsTab t={t} lang={lang} services={servicesWithRules} rules={data.rules} />
        )}
        {tab === 'begrippen' && <BegrippenTab t={t} lang={lang} concepts={data.concepts} />}
      </div>
    </main>
  );
}

function OrganisatiesTab({
  organizations,
}: {
  organizations: RegelcatalogusData['organizations'];
}) {
  return (
    <div className="pub-orgcards">
      {organizations.map((o) => (
        <div key={o.uri} className="pub-orgcard">
          <h3>{o.name}</h3>
          {o.homepage && (
            <a
              href={o.homepage}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, wordBreak: 'break-all' }}
            >
              {o.homepage}
            </a>
          )}
          <div className="pub-chips">
            {o.services.map((s) => (
              <span key={s.uri} className="pub-chip">
                {s.title}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DienstenTab({ services }: { services: CatalogService[] }) {
  return (
    <div>
      {services.map((s) => (
        <article key={s.uri} className="pub-hit">
          <h3>
            <Link to={hrefFor({ type: 'regel', slug: slugify(s.title) })}>{s.title}</Link>
          </h3>
          <p>{s.description}</p>
        </article>
      ))}
    </div>
  );
}

function RegelsTab({
  t,
  lang,
  services,
  rules,
}: {
  t: Translations;
  lang: Lang;
  services: CatalogService[];
  rules: RegelcatalogusData['rules'];
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(services[0]?.uri ?? null);
  const needle = q.trim().toLowerCase();

  return (
    <div>
      <div className="pub-filterbar">
        <div className="pub-field">
          <label htmlFor="pub-rule-q">{t.filterRule}</label>
          <input
            id="pub-rule-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.filterRule}
          />
        </div>
      </div>
      {services.map((service) => {
        const serviceRules = rules.filter((r) => r.serviceTitle === service.title);
        const visible = needle
          ? serviceRules.filter((r) => r.ruleTitle.toLowerCase().includes(needle))
          : serviceRules;
        if (needle && visible.length === 0) return null;
        const isOpen = needle ? true : open === service.uri;
        return (
          <details
            key={service.uri}
            className="pub-acc"
            open={isOpen}
            onToggle={(e) => {
              if (!needle) setOpen(e.currentTarget.open ? service.uri : null);
            }}
          >
            <summary>
              <b>{service.title}</b>
              <span className="pub-tc">
                {visible.length} / {serviceRules.length}
              </span>
            </summary>
            <div className="pub-acc-in">
              <table className="pub-kv">
                <thead>
                  <tr>
                    <th>{t.tabRegel}</th>
                    <th style={{ width: '9rem' }}>{t.validFrom}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={i}>
                      <th style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14 }}>
                        {r.ruleTitle}
                      </th>
                      <td>{r.validFrom ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ marginTop: 12 }}>
                <Link to={hrefFor({ type: 'regel', slug: slugify(service.title) })}>
                  {lang === 'nl' ? 'Naar de dienst' : 'Go to the service'} →
                </Link>
              </p>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function BegrippenTab({
  t,
  lang,
  concepts,
}: {
  t: Translations;
  lang: Lang;
  concepts: RegelcatalogusData['concepts'];
}) {
  const services = useMemo(() => [...new Set(concepts.map((c) => c.serviceTitle))], [concepts]);
  const [service, setService] = useState('');
  const [q, setQ] = useState('');
  const rows = concepts.filter(
    (c) =>
      (!service || c.serviceTitle === service) &&
      (!q.trim() || c.prefLabel.toLowerCase().includes(q.trim().toLowerCase()))
  );

  return (
    <div>
      <div className="pub-filterbar">
        <div className="pub-field">
          <label htmlFor="pub-bg-q">{t.filterConcept}</label>
          <input
            id="pub-bg-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.filterConcept}
          />
        </div>
        <div className="pub-field">
          <label htmlFor="pub-bg-d">{t.filterDienst}</label>
          <select id="pub-bg-d" value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">{t.allDiensten}</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginBottom: 10 }} aria-live="polite">
        {rows.length}{' '}
        {lang === 'nl' ? `van ${concepts.length} begrippen` : `of ${concepts.length} concepts`} ·{' '}
        {lang === 'nl'
          ? 'de volledige thesaurus staat in het '
          : 'the full thesaurus lives in the '}
        <Link to="/woordenboek">{lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary'}</Link>
      </p>
      <table className="pub-kv">
        <thead>
          <tr>
            <th>{t.concept}</th>
            <th>{t.dienst}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i}>
              <th style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14.5 }}>
                <a
                  href={`https://skosmos.open-regels.nl/ronl/${lang}/search?clang=${lang}&q=${encodeURIComponent(c.prefLabel)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.prefLabel}
                </a>
              </th>
              <td style={{ fontFamily: 'var(--pub-font)', fontSize: 13.5 }}>{c.serviceTitle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/public-site -- pages/Regelcatalogus.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/public-site/src/lib/slug.ts packages/public-site/src/lib/slug.test.ts \
  packages/public-site/src/pages/Regelcatalogus.tsx packages/public-site/src/pages/Regelcatalogus.test.tsx
git commit -m "feat(public-site): Regelcatalogus page — Organisations/Services/Rules/Concepts tabs"
```

---

### Task 16: Woordenboek (Skosmos embed) + Detail page

**Files:**

- Modify: `packages/public-site/src/App.tsx` — pass `t` to `<Woordenboek>` (the Task 12 stub only took `lang`; the real page needs `t.embedOpen`/`t.embedNote`)
- Modify: `packages/public-site/src/pages/Woordenboek.tsx` (replace the Task 12 stub)
- Create: `packages/public-site/src/pages/Woordenboek.test.tsx`
- Modify: `packages/public-site/src/pages/Detail.tsx` (replace the Task 12 stub)
- Create: `packages/public-site/src/pages/Detail.test.tsx`

**Interfaces:**

- Consumes: `getBerichtBySlug`, `getNieuwsBySlug`, `getProductBySlug`, `getRegelBySlug`, `getProcesByKey` (Task 9), `TypeTag`/`Crumbs`/`Callout`/`TechDetails` (Task 11), `sectionForType`/`sectionLabel` (Task 8).

This is the DoD's explicit **`Detail.test.tsx`**: _"technical details are collapsed and expandable."_

- [ ] **Step 1: Update `App.tsx`'s Woordenboek route**

```tsx
<Route path="/woordenboek" element={<Woordenboek t={t} lang={lang} />} />
```

(Replaces the Task 12 line `<Route path="/woordenboek" element={<Woordenboek lang={lang} />} />`.)

- [ ] **Step 2: Write the failing test for Woordenboek**

```tsx
// packages/public-site/src/pages/Woordenboek.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Woordenboek from './Woordenboek';
import { translations } from '../i18n';

function renderAt(lang: 'nl' | 'en') {
  return render(
    <MemoryRouter>
      <Woordenboek t={translations[lang]} lang={lang} />
    </MemoryRouter>
  );
}

describe('Woordenboek', () => {
  it('embeds Skosmos with a screen-reader title and the current language in the URL', () => {
    renderAt('nl');
    const iframe = screen.getByTitle(/Gegevenswoordenboek.*Skosmos/);
    expect(iframe).toHaveAttribute('src', expect.stringContaining('/ronl/nl/'));
  });

  it('follows the language switch', () => {
    renderAt('en');
    expect(screen.getByTitle(/Data dictionary.*Skosmos/)).toHaveAttribute(
      'src',
      expect.stringContaining('/ronl/en/')
    );
  });

  it('keeps a visible "open in a new tab" fallback link outside the iframe', () => {
    renderAt('nl');
    const link = screen.getByRole('link', { name: /Openen in een nieuw tabblad/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('href', expect.stringContaining('skosmos.open-regels.nl'));
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then write `pages/Woordenboek.tsx`**

Run: `npm run test --workspace=@ronl/public-site -- pages/Woordenboek.test.tsx` → FAIL (Task 12 stub)

```tsx
// packages/public-site/src/pages/Woordenboek.tsx
import type { Translations, Lang } from '../i18n';
import Crumbs from '../components/Crumbs';

const SKOSMOS_BASE = 'https://skosmos.open-regels.nl/ronl';

export default function Woordenboek({ t, lang }: { t: Translations; lang: Lang }) {
  const label = lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary';
  const sub =
    lang === 'nl'
      ? 'De volledige RONL-thesaurus (Skosmos): alle begrippen, hun definities en onderlinge relaties.'
      : 'The full RONL thesaurus (Skosmos): every concept, its definition and its relations.';
  const src = `${SKOSMOS_BASE}/${lang}/`;

  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <Crumbs lang={lang} trail={[{ label: t.navHome, to: '/' }, { label }]} />
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>
          {label}
        </h1>
        <p className="pub-lede-2">{sub}</p>
        <div className="pub-embed-bar">
          <span>
            {lang === 'nl' ? 'Bron' : 'Source'}:{' '}
            <a href={`${SKOSMOS_BASE}/`} target="_blank" rel="noreferrer">
              Skosmos
            </a>{' '}
            · RONL Concepts
          </span>
          <a href={src} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>
            {t.embedOpen} ↗
          </a>
        </div>
        <div className="pub-embed">
          <iframe src={src} title={`${label} — Skosmos (RONL Concepts)`} loading="lazy" />
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--ro-ink-2)', marginTop: 10, maxWidth: '70ch' }}>
          {t.embedNote}
        </p>
      </div>
    </main>
  );
}
```

Run: `npm run test --workspace=@ronl/public-site -- pages/Woordenboek.test.tsx` → PASS (3 tests)

- [ ] **Step 4: Write the failing test for Detail**

```tsx
// packages/public-site/src/pages/Detail.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Detail from './Detail';
import { translations } from '../i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, getRegelBySlug: vi.fn() };
});

const t = translations.nl;

function renderAt(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/regels/${slug}`]}>
      <Routes>
        <Route path="/regels/:slug" element={<Detail t={t} lang="nl" type="regel" />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Detail (regel)', () => {
  it('technical details are collapsed by default and expand on click', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue({
      id: 'regel-zorgtoeslag',
      slug: 'zorgtoeslag',
      type: 'regel',
      title: 'Zorgtoeslag',
      summary: 'Toeslag',
      org: 'Belastingdienst',
      date: null,
      audience: [],
      external: null,
      facts: [['Uitvoeringsorganisatie', 'Belastingdienst']],
      tech: [
        ['service.uri', 'svc:1'],
        ['api', '/v1/public/regels/zorgtoeslag'],
      ],
      rules: [{ naam: 'Recht op zorgtoeslag', geldig: '2026-01-01' }],
      ruleCount: 1,
      begrippen: [],
    });
    renderAt('zorgtoeslag');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Zorgtoeslag', level: 1 })).toBeInTheDocument()
    );

    const details = screen.getByText(t.tech).closest('details')!;
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText(t.tech));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('svc:1')).toBeInTheDocument();
  });

  it('renders the open-data callout with the GET path', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue({
      id: 'regel-zorgtoeslag',
      slug: 'zorgtoeslag',
      type: 'regel',
      title: 'Zorgtoeslag',
      summary: 'Toeslag',
      org: 'Belastingdienst',
      date: null,
      audience: [],
      external: null,
      facts: [],
      tech: [['api', '/v1/public/regels/zorgtoeslag']],
      rules: [],
      ruleCount: 0,
    });
    renderAt('zorgtoeslag');
    await waitFor(() =>
      expect(screen.getByText('GET /v1/public/regels/zorgtoeslag')).toBeInTheDocument()
    );
  });

  it('shows a not-found message instead of crashing when the slug does not resolve', async () => {
    vi.mocked(api.getRegelBySlug).mockResolvedValue(null);
    renderAt('nope');
    await waitFor(() => expect(screen.getByText(/niet gevonden/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 5: Run test to verify it fails, then write `pages/Detail.tsx`**

Run: `npm run test --workspace=@ronl/public-site -- pages/Detail.test.tsx` → FAIL (Task 12 stub)

```tsx
// packages/public-site/src/pages/Detail.tsx
import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Translations, Lang } from '../i18n';
import { sectionForType, sectionLabel, type PubType } from '../lib/sections';
import {
  getBerichtBySlug,
  getNieuwsBySlug,
  getProductBySlug,
  getRegelBySlug,
  getProcesByKey,
} from '../lib/api';
import TypeTag from '../components/TypeTag';
import Crumbs from '../components/Crumbs';
import Callout from '../components/Callout';
import TechDetails from '../components/TechDetails';

interface DetailItem {
  title: string;
  summary: string;
  org: string;
  date: string | null;
  external: string | null;
  facts: [string, string][];
  tech: [string, string][];
  rules?: { naam: string; geldig: string | null }[];
  ruleCount?: number;
  begrippen?: string[];
  forms?: { id: string; name: string }[];
  documents?: { id: string; name: string }[];
  subprocesses?: { id: string; name: string; bpmnProcessId: string; status: string }[];
  apiPath: string;
}

async function loadDetail(type: PubType, slug: string): Promise<DetailItem | null> {
  if (type === 'bericht') {
    const b = await getBerichtBySlug(slug);
    if (!b) return null;
    return {
      title: b.subject,
      summary: b.preview,
      org: b.sender.name,
      date: b.publishedAt,
      external: 'flevoland.nl',
      facts: [['Afzender', b.sender.name]],
      tech: [
        ['bericht.id', b.id],
        ['api', `/v1/public/berichten/${slug}`],
      ],
      apiPath: `/v1/public/berichten/${slug}`,
    };
  }
  if (type === 'proces') {
    const p = await getProcesByKey(slug);
    if (!p) return null;
    return {
      title: p.naam,
      summary: p.beschrijving ?? '',
      org: 'Provincie Flevoland',
      date: p.gepubliceerd,
      external: null,
      facts: [
        ['Proceskey', p.key],
        ['Gepubliceerd', p.gepubliceerd],
        ['Status', p.status],
      ],
      tech: [
        ['process.key', p.key],
        ['engine', 'Camunda 7 / BPMN 2.0'],
        ['api', `/v1/public/processen/${p.key}`],
      ],
      forms: p.forms,
      documents: p.documents,
      subprocesses: p.subprocesses,
      apiPath: `/v1/public/processen/${p.key}`,
    };
  }
  const fetcher =
    type === 'nieuws' ? getNieuwsBySlug : type === 'product' ? getProductBySlug : getRegelBySlug;
  const item = await fetcher(slug);
  if (!item) return null;
  return {
    title: item.title,
    summary: item.summary,
    org: item.org,
    date: item.date,
    external: item.external,
    facts: item.facts,
    tech: item.tech,
    rules: item.rules,
    ruleCount: item.ruleCount,
    begrippen: item.begrippen,
    apiPath: item.tech.find(([k]) => k === 'api')?.[1] ?? '',
  };
}

export default function Detail({ t, lang, type }: { t: Translations; lang: Lang; type: PubType }) {
  const { slug = '' } = useParams();
  const [item, setItem] = useState<DetailItem | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setItem(undefined);
    loadDetail(type, slug).then((d) => {
      if (!cancelled) setItem(d);
    });
    return () => {
      cancelled = true;
    };
  }, [type, slug]);

  const section = sectionForType(type);

  if (item === undefined) {
    return (
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">{lang === 'nl' ? 'Laden…' : 'Loading…'}</div>
      </main>
    );
  }
  if (item === null) {
    return (
      <main id="pub-main" className="pub-main">
        <div className="pub-wrap">
          <h1 className="pub-section-h">
            {lang === 'nl' ? 'Item niet gevonden' : 'Item not found'}
          </h1>
        </div>
      </main>
    );
  }

  const crumbLabel = item.title.length > 46 ? `${item.title.slice(0, 46)}…` : item.title;

  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap">
        <Crumbs
          lang={lang}
          trail={[
            { label: t.navHome, to: '/' },
            { label: sectionLabel(section, lang), to: section.path },
            { label: crumbLabel },
          ]}
        />
        <div className="pub-detail">
          <div className="pub-detail-body">
            <div className="pub-meta" style={{ marginBottom: 12 }}>
              <TypeTag type={type} lang={lang} />
              <span>{item.org}</span>
              {item.date && (
                <>
                  <span className="pub-sep">·</span>
                  <span>{item.date}</span>
                </>
              )}
            </div>
            <h1>{item.title}</h1>
            <p className="pub-standfirst">{item.summary}</p>

            {type === 'product' && (
              <>
                <h2>{lang === 'nl' ? 'Wat u moet weten' : 'What you need to know'}</h2>
                <ul>
                  <li>
                    {lang === 'nl'
                      ? 'Deze activiteit valt onder de Omgevingswet en wordt beoordeeld door Provincie Flevoland.'
                      : 'This activity falls under the Environment Act and is assessed by the Province of Flevoland.'}
                  </li>
                  <li>
                    {lang === 'nl'
                      ? 'U dient uw aanvraag of melding in via het Omgevingsloket.'
                      : 'You submit your application or notification through the Omgevingsloket.'}
                  </li>
                  <li>
                    {lang === 'nl'
                      ? 'De beslistermijn volgt uit de Algemene wet bestuursrecht (Awb 4:13).'
                      : 'The decision period follows from the General Administrative Law Act (Awb 4:13).'}
                  </li>
                </ul>
              </>
            )}

            {type === 'regel' && (item.ruleCount ?? 0) > 0 && (
              <>
                <h2>
                  {t.rulesIn} ({item.ruleCount})
                </h2>
                {item.rules && item.rules.length > 0 ? (
                  <table className="pub-kv">
                    <thead>
                      <tr>
                        <th>{t.tabRegel}</th>
                        <th style={{ width: '9rem' }}>{t.validFrom}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.rules.map((r, i) => (
                        <tr key={i}>
                          <th
                            style={{ fontWeight: 400, fontFamily: 'var(--pub-font)', fontSize: 14 }}
                          >
                            {r.naam}
                          </th>
                          <td>{r.geldig ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>
                    {lang === 'nl'
                      ? `Deze dienst bevat ${item.ruleCount} gepubliceerde regels.`
                      : `This service holds ${item.ruleCount} published rules.`}
                  </p>
                )}
                {item.begrippen && item.begrippen.length > 0 && (
                  <>
                    <h2>
                      {t.conceptsIn} ({item.begrippen.length})
                    </h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                      {item.begrippen.map((b, i) => (
                        <a
                          key={i}
                          className="pub-chip"
                          href={`https://skosmos.open-regels.nl/ronl/${lang}/search?q=${encodeURIComponent(b)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {b}
                        </a>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {type === 'proces' && (
              <>
                <h2>{lang === 'nl' ? 'Onderdelen van dit proces' : 'Parts of this process'}</h2>
                <ul>
                  <li>
                    {(item.forms ?? []).length} {lang === 'nl' ? 'formulieren' : 'forms'}
                  </li>
                  <li>
                    {(item.documents ?? []).length}{' '}
                    {lang === 'nl' ? 'documentsjablonen' : 'document templates'}
                  </li>
                  <li>
                    {(item.subprocesses ?? []).length}{' '}
                    {lang === 'nl' ? 'subprocessen' : 'subprocesses'}
                  </li>
                </ul>
              </>
            )}

            {(type === 'bericht' || type === 'nieuws') && item.external && (
              <p>
                <a href={`https://${item.external}`} target="_blank" rel="noreferrer">
                  {t.readMore} ({item.external}) →
                </a>
              </p>
            )}

            <Callout title={t.api}>
              <p>{t.apiBody}</p>
              <p
                style={{
                  fontFamily: 'var(--pub-mono)',
                  fontSize: 13,
                  marginTop: 8,
                  wordBreak: 'break-all',
                }}
              >
                GET {item.apiPath}
              </p>
            </Callout>

            {item.tech.length > 0 && <TechDetails t={t} rows={item.tech} />}
          </div>
          <aside className="pub-aside" aria-label={t.aside}>
            <h2>{t.aside}</h2>
            <dl>
              <dt>{t.publisher}</dt>
              <dd>{item.org}</dd>
              {item.date && (
                <>
                  <dt>{t.updated}</dt>
                  <dd>{item.date}</dd>
                </>
              )}
              {item.facts
                .filter(([, v]) => v !== item.org)
                .map(([k, v], i) => (
                  <Fragment key={i}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </Fragment>
                ))}
              <dt>{t.identifier}</dt>
              <dd className="mono">{slug}</dd>
            </dl>
            {item.external && (
              <p style={{ marginTop: 16 }}>
                <a href={`https://${item.external}`} target="_blank" rel="noreferrer">
                  {item.external} →
                </a>
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
```

Run: `npm run test --workspace=@ronl/public-site -- pages/Detail.test.tsx` → PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/public-site/src/App.tsx packages/public-site/src/pages/Woordenboek.tsx \
  packages/public-site/src/pages/Woordenboek.test.tsx packages/public-site/src/pages/Detail.tsx \
  packages/public-site/src/pages/Detail.test.tsx
git commit -m "feat(public-site): Woordenboek (Skosmos embed) and Detail pages"
```

---

## Phase 4 — Accessibility, SEO, tests, CI

### Task 17: Toegankelijkheid + OpenData static pages

**Files:**

- Modify: `packages/public-site/src/pages/Toegankelijkheid.tsx` (replace the Task 12 stub)
- Modify: `packages/public-site/src/pages/OpenData.tsx` (replace the Task 12 stub)
- Create: `packages/public-site/src/pages/static-pages.test.tsx`

**Interfaces:**

- Consumes: nothing beyond `Lang`/`Crumbs`. These are the two footer links Task 11 already wired to `/toegankelijkheid` and `/open-data`.

`/toegankelijkheid` publishes the real accessibility statement the DoD requires ("Publish a real accessibility statement at `/toegankelijkheid` and register it in the DigiToegankelijk register"). The **page content** ships in this task; the **DigiToegankelijk registration itself** is an operational step outside this repo (an account/submission on `www.digitoegankelijk.nl`, not a file this plan can write) — flagged here the same way `[[edocs-live-switch-status]]` and `[[dossierbeheer-feature]]` flag their own operational blockers: code-complete, sign-off/registration pending.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/public-site/src/pages/static-pages.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Toegankelijkheid from './Toegankelijkheid';
import OpenData from './OpenData';

describe('Toegankelijkheid', () => {
  it('states the WCAG 2.1 AA conformance target and a contact path', () => {
    render(
      <MemoryRouter>
        <Toegankelijkheid lang="nl" />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Toegankelijkheid/);
    expect(screen.getByText(/WCAG 2\.1.*AA/)).toBeInTheDocument();
  });

  it('renders in English when lang=en', () => {
    render(
      <MemoryRouter>
        <Toegankelijkheid lang="en" />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Accessibility/);
  });
});

describe('OpenData', () => {
  it('lists at least one real /v1/public/ GET path', () => {
    render(
      <MemoryRouter>
        <OpenData lang="nl" />
      </MemoryRouter>
    );
    expect(screen.getByText(/GET \/v1\/public\/zoeken/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/public-site -- pages/static-pages.test.tsx`
Expected: FAIL — Task 12 stubs render empty `<main>`s

- [ ] **Step 3: Write `pages/Toegankelijkheid.tsx`**

```tsx
// packages/public-site/src/pages/Toegankelijkheid.tsx
import type { Lang } from '../i18n';
import Crumbs from '../components/Crumbs';

export default function Toegankelijkheid({ lang }: { lang: Lang }) {
  const nl = lang === 'nl';
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap pub-detail-body">
        <Crumbs
          lang={lang}
          trail={[
            { label: nl ? 'Home' : 'Home', to: '/' },
            { label: nl ? 'Toegankelijkheid' : 'Accessibility' },
          ]}
        />
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>
          {nl ? 'Toegankelijkheidsverklaring' : 'Accessibility statement'}
        </h1>
        <p className="pub-lede-2">
          {nl
            ? 'Provincie Flevoland streeft naar WCAG 2.1 niveau AA voor deze website.'
            : 'The Province of Flevoland aims for WCAG 2.1 level AA conformance on this website.'}
        </p>
        <h2>{nl ? 'Wat is er al op orde' : "What's already in place"}</h2>
        <ul>
          <li>
            {nl
              ? 'Skiplink naar de hoofdinhoud, zichtbaar bij toetsenbordfocus.'
              : 'A skip link to the main content, visible on keyboard focus.'}
          </li>
          <li>
            {nl
              ? 'Zichtbare focusindicator (2px zwart + geel) op elk interactief element.'
              : 'A visible focus indicator (2px black + yellow) on every interactive element.'}
          </li>
          <li>
            {nl
              ? 'Een label bij elk formulierveld, ook waar het visueel verborgen is.'
              : 'A label on every form field, even where it is visually hidden.'}
          </li>
          <li>
            {nl ? 'Contrast van minimaal 4,5:1 voor tekst.' : 'A minimum text contrast of 4.5:1.'}
          </li>
          <li>
            {nl
              ? 'Landmark-structuur (header/nav/main/aside/footer) en een kruimelpad.'
              : 'Landmark structure (header/nav/main/aside/footer) and a breadcrumb trail.'}
          </li>
        </ul>
        <h2>{nl ? 'Bekend knelpunt' : 'Known limitation'}</h2>
        <p>
          {nl
            ? 'Deze site gebruikt Fira Sans in plaats van RO Sans (Rijksoverheid Sans) in afwachting van een licentiebesluit; dit heeft geen invloed op de toegankelijkheid.'
            : 'This site uses Fira Sans instead of RO Sans (the Dutch central government typeface) pending a licensing decision; this does not affect accessibility.'}
        </p>
        <h2>{nl ? 'Problemen melden' : 'Reporting a problem'}</h2>
        <p>
          {nl
            ? 'Ondervindt u een toegankelijkheidsprobleem op deze site? Neem contact op via Provincie Flevoland.'
            : 'Found an accessibility problem on this site? Get in touch via the Province of Flevoland.'}
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Write `pages/OpenData.tsx`**

```tsx
// packages/public-site/src/pages/OpenData.tsx
import type { Lang } from '../i18n';
import Crumbs from '../components/Crumbs';

const ENDPOINTS: [string, string][] = [
  ['/v1/public/zoeken?q=', 'Federated search across all five sources'],
  ['/v1/public/berichten', 'Announcements — Provincie Flevoland'],
  ['/v1/public/nieuws', 'National news — Rijksoverheid'],
  ['/v1/public/producten-diensten', 'Products & services — Samenwerkende Catalogi (UPL)'],
  ['/v1/public/regelcatalogus', 'Rule catalogue — RONL knowledge graph'],
  ['/v1/public/processen', 'Process library — Camunda deployment index'],
];

export default function OpenData({ lang }: { lang: Lang }) {
  const nl = lang === 'nl';
  return (
    <main id="pub-main" className="pub-main">
      <div className="pub-wrap pub-detail-body">
        <Crumbs
          lang={lang}
          trail={[
            { label: nl ? 'Home' : 'Home', to: '/' },
            { label: nl ? 'Open data' : 'Open data' },
          ]}
        />
        <h1 className="pub-section-h" style={{ fontSize: 30 }}>
          {nl ? 'Open data & API' : 'Open data & API'}
        </h1>
        <p className="pub-lede-2">
          {nl
            ? 'Elk item op deze site is ook machineleesbaar op te vragen via een open, anonieme API. Geen sleutel, geen account.'
            : 'Every item on this site is also machine-readable through an open, anonymous API. No key, no account.'}
        </p>
        <h2>{nl ? 'Endpoints' : 'Endpoints'}</h2>
        <table className="pub-kv">
          <thead>
            <tr>
              <th>{nl ? 'Pad' : 'Path'}</th>
              <th>{nl ? 'Omschrijving' : 'Description'}</th>
            </tr>
          </thead>
          <tbody>
            {ENDPOINTS.map(([path, desc]) => (
              <tr key={path}>
                <th style={{ fontWeight: 400, fontFamily: 'var(--pub-mono)', fontSize: 13 }}>
                  GET {path}
                </th>
                <td style={{ fontFamily: 'var(--pub-font)', fontSize: 13.5 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>{nl ? 'Voorwaarden' : 'Terms'}</h2>
        <p>
          {nl
            ? 'Alle data is publieke overheidsinformatie: vrij te hergebruiken, zonder auteursrechtelijke beperking.'
            : 'All data is public government information: free to reuse, without copyright restriction.'}
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test --workspace=@ronl/public-site -- pages/static-pages.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/public-site/src/pages/Toegankelijkheid.tsx packages/public-site/src/pages/OpenData.tsx \
  packages/public-site/src/pages/static-pages.test.tsx
git commit -m "feat(public-site): accessibility statement and open-data pages"
```

---

### Task 18: e2e — search journey, deep links, keyboard path, axe-core scans

**Files:**

- Create: `packages/public-site/e2e/playwright.config.ts`
- Create: `packages/public-site/e2e/publiek.spec.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks directly — this is a black-box suite driving the built app through the browser. It does depend on `packages/backend` running with real data (TriplyDB/RSS/LDE reachable), same precondition `packages/frontend/e2e` already documents.

Unlike `packages/frontend/e2e` (which requires the whole Keycloak/Operaton stack to already be running, per its `playwright.config.ts` comment), `public-site` has no auth stack — its own dev server can be started by Playwright directly. **The backend must still already be running** on the port `VITE_API_URL` points at (`http://localhost:3002` in dev), because these specs exercise real search results, not mocked ones.

- [ ] **Step 1: Write `e2e/playwright.config.ts`**

```ts
// packages/public-site/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

// Kept separate from src/ so Vitest never picks up these *.spec.ts files
// (same reasoning as packages/frontend/e2e/playwright.config.ts).
//
// public-site has no Keycloak/Operaton dependency, so unlike the frontend
// suite, Playwright starts the dev server itself. The BACKEND must already
// be running on the port VITE_API_URL points at — these specs hit real
// search results, not mocked ones.
export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Write `e2e/publiek.spec.ts`**

```ts
// packages/public-site/e2e/publiek.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Public site — search journey', () => {
  test('search → filter → detail → back preserves the filtered URL', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/Zoek in de publieke kennisbank/).fill('zorg');
    await page.getByRole('button', { name: 'Zoeken' }).click();
    await expect(page).toHaveURL(/\/zoeken\?q=zorg/);

    const regelCheckbox = page.getByRole('checkbox', { name: /Regel/ }).first();
    await regelCheckbox.waitFor({ timeout: 10_000 });
    await regelCheckbox.check();
    await expect(page).toHaveURL(/soort=regel/);

    const firstHit = page.locator('.pub-hit h3 a').first();
    await firstHit.waitFor({ timeout: 10_000 });
    const hitTitle = (await firstHit.textContent())?.trim();
    await firstHit.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(hitTitle ?? '');

    await page.goBack();
    await expect(page).toHaveURL(/soort=regel/);
  });

  test('a deep link with filters pre-applied renders those filters checked', async ({ page }) => {
    await page.goto('/zoeken?q=zorg&soort=regel');
    const regelCheckbox = page.getByRole('checkbox', { name: /Regel/ }).first();
    await regelCheckbox.waitFor({ timeout: 10_000 });
    await expect(regelCheckbox).toBeChecked();
  });

  test('keyboard-only: skip link is the first Tab stop, search is reachable and submits', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('.pub-skip')).toBeFocused();

    await page
      .getByLabel(/Zoek in de publieke kennisbank/)
      .first()
      .focus();
    await page.keyboard.type('bomen');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/zoeken\?q=bomen/);
  });
});

test.describe('Accessibility — axe-core, one scan per page type', () => {
  test('home has no critical/serious violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
    ).toEqual([]);
  });

  test('results page has no critical/serious violations', async ({ page }) => {
    await page.goto('/zoeken?q=zorg');
    await page
      .locator('.pub-hit')
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
    ).toEqual([]);
  });

  test('a detail page has no critical/serious violations', async ({ page }) => {
    await page.goto('/zoeken?q=zorg');
    await page.locator('.pub-hit h3 a').first().click();
    await page.waitForSelector('h1');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      results.violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
    ).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the suite locally (backend already running on :3002)**

Run: `npm run test:e2e --workspace=@ronl/public-site`
Expected: PASS — 6 tests, one Chromium project. If facet/hit selectors time out, the backend isn't returning real search results for "zorg"/"bomen" — check `packages/backend` is up and TriplyDB/RSS sources are reachable before treating this as a public-site bug.

- [ ] **Step 4: Commit**

```bash
git add packages/public-site/e2e
git commit -m "test(public-site): e2e search journey, deep links, keyboard path, axe-core scans"
```

---

### Task 19: Prerendering + `sitemap.xml` + `robots.txt`

**Files:**

- Create: `packages/public-site/scripts/prerender.ts`
- Create: `packages/public-site/scripts/prerender.test.ts`

**Interfaces:**

- Consumes: `getBerichten`, `getNieuws`, `getProducten`, `getRegelcatalogus`, `getProcessen` (Task 9), `PUB_SECTIONS` (Task 8), `hrefFor`/`slugify` (Tasks 10/15), `PUBLIC_API_BASE_URL` (resolved by `lib/api.ts`'s `resolveApiBase()`, Task 9 — this is exactly why that function checks `process.env.PUBLIC_API_BASE_URL` in addition to `import.meta.env`).

This is the DoD's **"a build step that writes static HTML per detail page"** — the alternative ARCHITECTURE.md explicitly sanctions instead of `vite-plugin-ssr`/`vite-react-ssg`. It does **not** run full React SSR (no hooks/effects to resolve): it fetches real data at build time and writes a small, semantic, crawlable HTML fragment (title, h1, description, key facts) into the same shell `index.html` the SPA already uses. The browser then boots the normal client bundle over it via `createRoot(...).render(...)` (not `hydrateRoot`), so any difference between the static fragment and the live render is harmless — it's simply replaced once JS runs.

- [ ] **Step 1: Write the failing test** (pure-function parts only — HTML escaping and sitemap URL building; the file-writing/fetch parts are exercised by Step 4's manual build run, not unit-tested, matching how `packages/frontend` doesn't unit-test its Vite build either)

```ts
// packages/public-site/scripts/prerender.test.ts
import { describe, it, expect } from 'vitest';
import { escapeHtml, buildSitemap, injectIntoShell } from './prerender';

describe('escapeHtml', () => {
  it('escapes the five XML/HTML-sensitive characters', () => {
    expect(escapeHtml(`<a href="x">B & "C" 'D'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;B &amp; &quot;C&quot; &#39;D&#39;&lt;/a&gt;'
    );
  });
});

describe('buildSitemap', () => {
  it('lists every URL with the site origin, and excludes /woordenboek and /zoeken', () => {
    const xml = buildSitemap('https://publiek.open-regels.nl', [
      '/',
      '/berichten',
      '/berichten/b1',
      '/woordenboek',
      '/zoeken',
    ]);
    expect(xml).toContain('<loc>https://publiek.open-regels.nl/berichten/b1</loc>');
    expect(xml).not.toContain('/woordenboek');
    expect(xml).not.toContain('/zoeken');
  });
});

describe('injectIntoShell', () => {
  const shell = `<!doctype html><html lang="nl"><head><title>Old</title></head><body><div id="root"></div></body></html>`;

  it('replaces the title, injects description + canonical, and fills #root', () => {
    const html = injectIntoShell(shell, {
      title: 'Zorgtoeslag — Open Regels Nederland',
      description: 'Toeslag voor zorgkosten.',
      canonical: 'https://publiek.open-regels.nl/regels/zorgtoeslag',
      bodyFragment: '<main><h1>Zorgtoeslag</h1></main>',
    });
    expect(html).toContain('<title>Zorgtoeslag — Open Regels Nederland</title>');
    expect(html).toContain('name="description" content="Toeslag voor zorgkosten."');
    expect(html).toContain(
      'rel="canonical" href="https://publiek.open-regels.nl/regels/zorgtoeslag"'
    );
    expect(html).toContain('<div id="root"><main><h1>Zorgtoeslag</h1></main></div>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/public-site -- scripts/prerender.test.ts`
Expected: FAIL — `./prerender` doesn't exist

- [ ] **Step 3: Write `scripts/prerender.ts`**

```ts
// packages/public-site/scripts/prerender.ts
/**
 * Post-build step: writes a static, crawlable index.html per section and
 * detail route into dist/, plus sitemap.xml and robots.txt. Run via
 * `tsx scripts/prerender.ts --mode <development|acceptance|production>`
 * after `vite build`. See the DoD note in Task 19 of the implementation
 * plan for why this isn't full React SSR.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  getBerichten,
  getNieuws,
  getProducten,
  getRegelcatalogus,
  getProcessen,
} from '../src/lib/api';
import { PUB_SECTIONS } from '../src/lib/sections';
import { slugify } from '../src/lib/slug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

type Mode = 'development' | 'acceptance' | 'production';

const SITE_ORIGIN: Record<Mode, string> = {
  development: 'http://localhost:5175',
  acceptance: 'https://acc.publiek.open-regels.nl',
  production: 'https://publiek.open-regels.nl',
};
const ENV_FILE: Record<Mode, string> = {
  development: '.env.development',
  acceptance: '.env.acceptance',
  production: '.env.production',
};

// ── Pure helpers (unit-tested directly, see Step 1) ─────────────────────────

export function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

export function injectIntoShell(
  shell: string,
  opts: { title: string; description: string; canonical: string; bodyFragment: string }
): string {
  let html = shell.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(opts.title)}</title>`);
  html = html.replace(
    '</head>',
    `  <meta name="description" content="${escapeHtml(opts.description)}" />\n` +
      `  <link rel="canonical" href="${opts.canonical}" />\n</head>`
  );
  html = html.replace('<div id="root"></div>', `<div id="root">${opts.bodyFragment}</div>`);
  return html;
}

export function buildSitemap(origin: string, urls: string[]): string {
  const entries = urls
    .filter((u) => u !== '/zoeken' && u !== '/woordenboek')
    .map((u) => `  <url><loc>${origin}${u}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function buildRobots(origin: string): string {
  return `User-agent: *\nAllow: /\nDisallow: /zoeken\n\nSitemap: ${origin}/sitemap.xml\n`;
}

// ── Fragment builders (small, semantic — not the interactive React tree) ───

function factsTable(facts: [string, string][]): string {
  if (!facts.length) return '';
  const rows = facts
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<table><tbody>${rows}</tbody></table>`;
}

function detailFragment(
  title: string,
  summary: string,
  org: string,
  facts: [string, string][]
): string {
  return (
    `<main id="pub-main"><article>` +
    `<p>${escapeHtml(org)}</p>` +
    `<h1>${escapeHtml(title)}</h1>` +
    `<p>${escapeHtml(summary)}</p>` +
    factsTable(facts) +
    `</article></main>`
  );
}

function listFragment(
  title: string,
  sub: string,
  rows: { title: string; summary: string }[]
): string {
  const items = rows
    .map((r) => `<li><h3>${escapeHtml(r.title)}</h3><p>${escapeHtml(r.summary)}</p></li>`)
    .join('');
  return `<main id="pub-main"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(sub)}</p><ul>${items}</ul></main>`;
}

// ── Write one route ──────────────────────────────────────────────────────

async function writeRoute(
  shell: string,
  origin: string,
  route: string,
  opts: {
    title: string;
    description: string;
    bodyFragment: string;
  }
) {
  const html = injectIntoShell(shell, {
    title: opts.title,
    description: opts.description,
    canonical: `${origin}${route}`,
    bodyFragment: opts.bodyFragment,
  });
  const dir = route === '/' ? distDir : path.join(distDir, ...route.split('/').filter(Boolean));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html, 'utf-8');
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const modeArgIndex = process.argv.indexOf('--mode');
  const mode = (modeArgIndex !== -1 ? process.argv[modeArgIndex + 1] : 'production') as Mode;
  const origin = SITE_ORIGIN[mode] ?? SITE_ORIGIN.production;

  const envText = await readFile(path.join(root, ENV_FILE[mode] ?? ENV_FILE.production), 'utf-8');
  const apiUrlMatch = envText.match(/^VITE_API_URL=(.*)$/m);
  if (!apiUrlMatch) throw new Error(`VITE_API_URL not found in ${ENV_FILE[mode]}`);
  process.env.PUBLIC_API_BASE_URL = apiUrlMatch[1].trim();

  const shell = await readFile(path.join(distDir, 'index.html'), 'utf-8');
  const urls: string[] = ['/', '/woordenboek', '/toegankelijkheid', '/open-data', '/zoeken'];

  // Home
  await writeRoute(shell, origin, '/', {
    title: 'Open Regels Nederland — publieke kennisbank',
    description:
      'Doorzoek de openbare regels, producten, processen en berichten van Provincie Flevoland — zonder inloggen.',
    bodyFragment: listFragment(
      'Open Regels Nederland',
      'Doorzoek de regels, producten en processen van de overheid.',
      PUB_SECTIONS.map((s) => ({ title: s.nl, summary: s.nlSub }))
    ),
  });

  // Berichten
  const { items: berichten } = await getBerichten(1000);
  await writeRoute(shell, origin, '/berichten', {
    title: 'Berichten — Open Regels Nederland',
    description: 'Officiële berichten van Provincie Flevoland.',
    bodyFragment: listFragment(
      'Berichten',
      'Officiële berichten van Provincie Flevoland.',
      berichten.map((b) => ({ title: b.subject, summary: b.preview }))
    ),
  });
  for (const b of berichten) {
    urls.push(`/berichten/${b.id}`);
    await writeRoute(shell, origin, `/berichten/${b.id}`, {
      title: `${b.subject} — Open Regels Nederland`,
      description: b.preview,
      bodyFragment: detailFragment(b.subject, b.preview, b.sender.name, [
        ['Afzender', b.sender.name],
      ]),
    });
  }

  // Nieuws
  const { items: nieuws } = await getNieuws(1000);
  await writeRoute(shell, origin, '/nieuws', {
    title: 'Nieuws — Open Regels Nederland',
    description: 'Landelijk nieuws van de Rijksoverheid.',
    bodyFragment: listFragment(
      'Nieuws',
      'Landelijk nieuws van de Rijksoverheid.',
      nieuws.map((n) => ({ title: n.title, summary: n.summary }))
    ),
  });
  for (const n of nieuws) {
    urls.push(`/nieuws/${n.id}`);
    await writeRoute(shell, origin, `/nieuws/${n.id}`, {
      title: `${n.title} — Open Regels Nederland`,
      description: n.summary,
      bodyFragment: detailFragment(n.title, n.summary, n.source.name, [['Bron', n.source.name]]),
    });
  }

  // Producten & Diensten
  const { items: producten } = await getProducten(1000);
  await writeRoute(shell, origin, '/producten', {
    title: 'Producten & Diensten — Open Regels Nederland',
    description: 'Vergunningen, meldingen en subsidies voor inwoners en ondernemers.',
    bodyFragment: listFragment(
      'Producten & Diensten',
      'Vergunningen, meldingen en subsidies.',
      producten.map((p) => ({ title: p.title, summary: p.description }))
    ),
  });
  for (const p of producten) {
    urls.push(`/producten/${p.id}`);
    await writeRoute(shell, origin, `/producten/${p.id}`, {
      title: `${p.title} — Open Regels Nederland`,
      description: p.description,
      bodyFragment: detailFragment(p.title, p.description, 'Provincie Flevoland', [
        ['Soort', p.soort],
      ]),
    });
  }

  // Regelcatalogus (services)
  const catalogus = await getRegelcatalogus();
  await writeRoute(shell, origin, '/regels', {
    title: 'Regelcatalogus — Open Regels Nederland',
    description: 'Publieke diensten en de regels waarmee de overheid ze uitvoert.',
    bodyFragment: listFragment(
      'Regelcatalogus',
      'Publieke diensten en de regels waarmee de overheid ze uitvoert.',
      catalogus.services.map((s) => ({ title: s.title, summary: s.description }))
    ),
  });
  for (const s of catalogus.services) {
    const slug = slugify(s.title);
    const org = catalogus.organizations.find((o) => o.services.some((os) => os.uri === s.uri));
    const ruleCount = catalogus.rules.filter((r) => r.serviceTitle === s.title).length;
    urls.push(`/regels/${slug}`);
    await writeRoute(shell, origin, `/regels/${slug}`, {
      title: `${s.title} — Open Regels Nederland`,
      description: s.description,
      bodyFragment: detailFragment(s.title, s.description, org?.name ?? 'Onbekend', [
        ['Uitvoeringsorganisatie', org?.name ?? '—'],
        ['Aantal regels', String(ruleCount)],
      ]),
    });
  }

  // Procesbibliotheek
  const processen = await getProcessen();
  await writeRoute(shell, origin, '/processen', {
    title: 'Procesbibliotheek — Open Regels Nederland',
    description: 'Hoe een aanvraag stap voor stap door de organisatie loopt.',
    bodyFragment: listFragment(
      'Procesbibliotheek',
      'Hoe een aanvraag stap voor stap door de organisatie loopt.',
      processen.map((p) => ({ title: p.naam, summary: p.beschrijving ?? '' }))
    ),
  });
  for (const p of processen) {
    urls.push(`/processen/${p.key}`);
    await writeRoute(shell, origin, `/processen/${p.key}`, {
      title: `${p.naam} — Open Regels Nederland`,
      description: p.beschrijving ?? '',
      bodyFragment: detailFragment(p.naam, p.beschrijving ?? '', 'Provincie Flevoland', [
        ['Proceskey', p.key],
        ['Status', p.status],
      ]),
    });
  }
  urls.push('/berichten', '/nieuws', '/producten', '/regels', '/processen');

  await writeFile(path.join(distDir, 'sitemap.xml'), buildSitemap(origin, urls), 'utf-8');
  await writeFile(path.join(distDir, 'robots.txt'), buildRobots(origin), 'utf-8');

  // eslint-disable-next-line no-console
  console.log(`Prerendered ${urls.length} routes for mode=${mode} (${origin})`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Prerender failed:', error);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Run test to verify it passes, then run a real build**

Run: `npm run test --workspace=@ronl/public-site -- scripts/prerender.test.ts`
Expected: PASS (3 tests)

Run (with `packages/backend` already running on :3002): `npm run build --workspace=@ronl/public-site`
Expected: `dist/sitemap.xml`, `dist/robots.txt`, `dist/regels/zorgtoeslag/index.html` (or whichever slugs the live data produces) all exist; `dist/regels/zorgtoeslag/index.html` contains a real `<title>` and `<h1>Zorgtoeslag</h1>`, not the generic shell title.

- [ ] **Step 5: Commit**

```bash
git add packages/public-site/scripts
git commit -m "feat(public-site): prerender detail/section pages + sitemap.xml + robots.txt"
```

---

### Task 20: Bundle-cleanliness gate (no auth/telemetry code)

**Files:**

- Create: `packages/public-site/scripts/check-bundle.mjs`
- Create: `packages/public-site/scripts/check-bundle.test.ts`
- Modify: `packages/public-site/package.json` — `build`/`build:acc`/`build:prod` already updated above to run this as their final step

**Interfaces:**

- Produces: `findForbiddenStrings(distDir: string): Promise<{ file: string; term: string }[]>`, exercised by the test and by the CLI entry point at the bottom of the same file.

This automates the DoD's _"No auth, telemetry or assistant code in the bundle"_ check as a hard build gate, in addition to the DoD's own suggested manual spot-check with `npx vite-bundle-visualizer` (Step 4 below) — the automated grep catches an accidental import on every single build; the visualizer is for a human to _look_ at the dependency graph before a real launch.

- [ ] **Step 1: Write the failing test**

```ts
// packages/public-site/scripts/check-bundle.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findForbiddenStrings } from './check-bundle.mjs';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('findForbiddenStrings', () => {
  it('finds a forbidden term inside a built .js file', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-check-'));
    await writeFile(path.join(dir, 'index.js'), `import Keycloak from 'keycloak-js';`);
    const hits = await findForbiddenStrings(dir);
    expect(hits).toHaveLength(1);
    expect(hits[0].term).toBe('keycloak');
  });

  it('is case-insensitive and scans nested directories', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-check-'));
    const nested = path.join(dir, 'assets');
    await writeFile(path.join(dir, 'a.js'), 'clean file');
    await import('node:fs/promises').then((fs) => fs.mkdir(nested));
    await writeFile(path.join(nested, 'b.js'), 'new MSAL.PublicClientApplication()');
    const hits = await findForbiddenStrings(dir);
    expect(hits.map((h) => h.term)).toContain('msal');
  });

  it('returns no hits for a clean bundle', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-check-'));
    await writeFile(path.join(dir, 'index.js'), 'console.log("hello")');
    expect(await findForbiddenStrings(dir)).toEqual([]);
  });

  it('ignores non-.js files', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'bundle-check-'));
    await writeFile(path.join(dir, 'notes.txt'), 'keycloak mentioned here but not JS');
    expect(await findForbiddenStrings(dir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=@ronl/public-site -- scripts/check-bundle.test.ts`
Expected: FAIL — `./check-bundle.mjs` doesn't exist

- [ ] **Step 3: Write `scripts/check-bundle.mjs`**

```js
// packages/public-site/scripts/check-bundle.mjs
/**
 * Build gate: fails if any built .js file mentions auth or telemetry
 * libraries that must never ship in this bundle (DoD: "No auth, telemetry
 * or assistant code in the bundle"). Run as the last step of every
 * build/build:acc/build:prod script (see package.json).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const FORBIDDEN = [
  'keycloak',
  'msal',
  '@azure/msal',
  'oidc-client',
  'react-ga',
  'google-analytics',
  'gtag(',
];

export async function findForbiddenStrings(distDir) {
  const hits = [];

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.js')) {
        const text = (await readFile(full, 'utf-8')).toLowerCase();
        for (const term of FORBIDDEN) {
          if (text.includes(term.toLowerCase())) hits.push({ file: full, term });
        }
      }
    }
  }

  await walk(distDir);
  return hits;
}

// CLI entry point — only runs when invoked directly (`node check-bundle.mjs`),
// not when imported by the test above.
if (import.meta.url === `file://${process.argv[1]}`) {
  const distDir = path.resolve(process.cwd(), 'dist');
  const hits = await findForbiddenStrings(distDir);
  if (hits.length) {
    console.error('Forbidden auth/telemetry strings found in the built bundle:');
    for (const h of hits) console.error(`  ${h.file}: "${h.term}"`);
    process.exitCode = 1;
  } else {
    console.log('Bundle clean — no auth/telemetry strings found.');
  }
}
```

- [ ] **Step 4: Run test to verify it passes, then document the manual visualizer check**

Run: `npm run test --workspace=@ronl/public-site -- scripts/check-bundle.test.ts`
Expected: PASS (4 tests)

Before the first real launch (not part of this task's automated gate — a one-time human check):

```bash
cd packages/public-site
npm run build
npx vite-bundle-visualizer
```

Expected: the treemap shows `react`, `react-dom`, `react-router-dom` and this package's own `src/` — nothing named `keycloak`, `msal`, or any analytics/telemetry library.

- [ ] **Step 5: Commit**

```bash
git add packages/public-site/scripts/check-bundle.mjs packages/public-site/scripts/check-bundle.test.ts \
  packages/public-site/package.json
git commit -m "feat(public-site): automated bundle-cleanliness gate (no auth/telemetry code)"
```

---

### Task 21: CI workflows, `staticwebapp.config.json`, final DoD verification

**Files:**

- Create: `packages/public-site/staticwebapp.config.json`
- Create: `.github/workflows/azure-publicsite-acc.yml`
- Create: `.github/workflows/azure-publicsite-prod.yml`

**Interfaces:** none — this task wires CI/CD around the package Tasks 6–20 already built and tested; no application code changes.

The Azure Static Web App **resource itself** (DNS for `publiek.open-regels.nl`, the `AZURE_STATIC_WEB_APPS_API_TOKEN_*` secrets these workflows reference) is an **operational step outside this repo** — the same kind of blocker `[[edocs-live-switch-status]]` and `[[dossierbeheer-feature]]` already flag elsewhere in this project: this task ships code-complete CI/CD config; provisioning the actual Azure resource and secrets needs an account with access, not more code.

- [ ] **Step 1: Write `staticwebapp.config.json`** — no auth routes, deliberately

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "*.{png,jpg,jpeg,svg,ico,css,js,xml,txt}"]
  },
  "globalHeaders": {
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src https://skosmos.open-regels.nl; connect-src 'self' https://api.open-regels.nl https://acc.api.open-regels.nl",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  },
  "mimeTypes": {
    ".xml": "application/xml",
    ".txt": "text/plain"
  }
}
```

`frame-src` allows the Skosmos embed (Task 16); there is no `routes`/`allowedRoles` block at all, matching every other file in this plan's "no auth" constraint. `style-src 'unsafe-inline'` is required because several components (ported faithfully from the prototype, per the DoD's "carry over style and structure literally") use inline `style={{...}}`; tightening this to nonces/hashes is a reasonable follow-up, not blocking for launch.

- [ ] **Step 2: Write `.github/workflows/azure-publicsite-acc.yml`**

```yaml
name: Deploy Public Site to Azure ACC

on:
  push:
    branches:
      - acc
    paths:
      - 'packages/public-site/**'
      - '.github/workflows/azure-publicsite-acc.yml'
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches:
      - acc
  workflow_dispatch:

jobs:
  build_and_deploy_job:
    if: github.event_name == 'push' || github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.event.action != 'closed')
    runs-on: ubuntu-latest
    name: Build and Deploy ACC Public Site
    environment:
      name: acc
      url: https://acc.publiek.open-regels.nl

    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
          lfs: false

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        working-directory: packages/public-site
        run: npm run lint

      - name: Type-check
        working-directory: packages/public-site
        run: npm run type-check

      - name: Unit tests
        working-directory: packages/public-site
        run: npm test

      - name: Build for ACC (includes prerender + bundle-cleanliness gate)
        working-directory: packages/public-site
        run: |
          npm run build:acc
          test -f dist/index.html || (echo "ERROR: index.html not found!" && exit 1)
          test -f dist/sitemap.xml || (echo "ERROR: sitemap.xml not found!" && exit 1)
          test -f dist/robots.txt || (echo "ERROR: robots.txt not found!" && exit 1)
          echo "✅ Build completed successfully"

      - name: Deploy to Azure Static Web Apps
        id: builddeploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_PUBLIC_SITE_ACC }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: 'upload'
          app_location: '/packages/public-site/dist'
          skip_app_build: true

  close_pull_request_job:
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest
    name: Close Pull Request Job
    steps:
      - name: Close Pull Request
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_PUBLIC_SITE_ACC }}
          action: 'close'
```

- [ ] **Step 3: Write `.github/workflows/azure-publicsite-prod.yml`** — same shape, production environment

```yaml
name: Deploy Public Site to Azure Production

on:
  push:
    branches:
      - main
    paths:
      - 'packages/public-site/**'
      - '.github/workflows/azure-publicsite-prod.yml'
  workflow_dispatch:

jobs:
  build_and_deploy_job:
    runs-on: ubuntu-latest
    name: Build and Deploy Production Public Site
    environment:
      name: production
      url: https://publiek.open-regels.nl

    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
          lfs: false

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Lint
        working-directory: packages/public-site
        run: npm run lint

      - name: Type-check
        working-directory: packages/public-site
        run: npm run type-check

      - name: Unit tests
        working-directory: packages/public-site
        run: npm test

      - name: Build for production (includes prerender + bundle-cleanliness gate)
        working-directory: packages/public-site
        run: |
          npm run build:prod
          test -f dist/index.html || (echo "ERROR: index.html not found!" && exit 1)
          test -f dist/sitemap.xml || (echo "ERROR: sitemap.xml not found!" && exit 1)
          test -f dist/robots.txt || (echo "ERROR: robots.txt not found!" && exit 1)

      - name: Deploy to Azure Static Web Apps
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_PUBLIC_SITE_PROD }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: 'upload'
          app_location: '/packages/public-site/dist'
          skip_app_build: true
```

- [ ] **Step 4: Commit**

```bash
git add packages/public-site/staticwebapp.config.json \
  .github/workflows/azure-publicsite-acc.yml .github/workflows/azure-publicsite-prod.yml
git commit -m "ci(public-site): Azure Static Web App deploy workflows + staticwebapp.config.json (no auth routes)"
```

---

## Final DoD verification pass

Once Tasks 1–21 are all committed, walk `publiek-handoff/CLAUDE-CODE-PROMPT.md`'s Definition of Done top to bottom against what was actually built — this is a manual review pass, not a task with its own commit:

| DoD item                                                                 | Where it's satisfied                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runs with `npm run dev -w public-site` on :5175                          | Task 6 (`vite.config.ts` `server.port`)                                                                                                                                                                                                    |
| All six sections fed from `/v1/public/*`, no mock data                   | Tasks 2–4 (backend), 13–16 (pages) — Woordenboek is the one section with no data of its own (embed-only, by design)                                                                                                                        |
| Federated search with Type/Source/Audience facets, filters in URL        | Task 13 (`Results` + `useQueryState`)                                                                                                                                                                                                      |
| A detail page per item on a permanent URL, prerendered                   | Task 19                                                                                                                                                                                                                                    |
| NL/EN switch; `<html lang>` follows the choice                           | Task 12 (`App.tsx` `useEffect`)                                                                                                                                                                                                            |
| WCAG 2.1 AA: axe-core clean on home/results/detail; keyboard walkthrough | Task 18 (axe-core specs + keyboard spec) — **manual keyboard walkthrough still needs a human to actually do it and record it**; the e2e spec covers the skip-link/search path but is not a substitute for the DoD's "recorded" walkthrough |
| `sitemap.xml` + `robots.txt` at build time                               | Task 19                                                                                                                                                                                                                                    |
| Lighthouse ≥ 95 (Performance/Accessibility/SEO, mobile)                  | Not directly testable in this plan (needs a deployed URL or `lighthouse-ci` against a preview) — **flag as a manual gate before launch**, run against the ACC deploy once Task 21 is live                                                  |
| No auth/telemetry/assistant code in the bundle                           | Task 20 (automated) + manual `vite-bundle-visualizer` spot-check                                                                                                                                                                           |
| Backend `/v1/public/*` GET-only, anonymous, rate-limited, cached         | Task 5 (structural test) + existing global rate limiter (`packages/backend/src/index.ts`, `config.rateLimit`) + per-service in-memory caches (Tasks 2–3)                                                                                   |

Two items are explicitly **not** closed by any task above and need a human before this ships: the **recorded keyboard walkthrough** and the **Lighthouse ≥95 run against a real deployed URL**. Both require the site to actually be live somewhere (ACC), which itself depends on Task 21's operational follow-up (the Azure resource + secrets).
