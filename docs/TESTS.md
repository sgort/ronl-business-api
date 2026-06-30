# Test suite — ronl-business-api

## Running the tests

All backend tests run with Jest. The test script lives in `packages/backend`.

```bash
# Run all backend tests once (with coverage report)
npm test --workspace=@ronl/backend

# Run without coverage (faster)
npx jest --config packages/backend/jest.config.js --no-coverage

# Watch mode during development
npm run test:watch --workspace=@ronl/backend

# Single file / pattern
npx jest --config packages/backend/jest.config.js --no-coverage --testPathPattern=rules
```

From the repo root, `npm test` runs all workspace test scripts (currently backend only).

---

## Test files

### `packages/backend/src/pa-monitoring/rules.test.ts`

**29 tests · pure unit · no mocks needed**

Covers `scoreItem` — the pure scoring function that assigns a relevance score (1–10),
a tab (`politiek` / `regionaal` / `europa`), and a `dossierId` to each raw feed item
before it enters the curation inbox.

| Group                 | What is tested                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab assignment        | `tk → politiek`, `ob → regionaal`, `eu → europa`                                                                                                    |
| No-match floor        | Items matching no saved search are capped at rel 3, even with a high-value document type                                                            |
| Title match           | +3 per matching term; `OR`-split queries; `bestScore` capped at 5                                                                                   |
| Description match     | +1 per matching term; title match always outscores desc match for the same term                                                                     |
| High-value type bonus | TK: Motie, Kamervraag, Brief, Amendement → +2; EU: Verslag, Motie, Aangenomen tekst, Resolutie → +2; non-listed types → no bonus                    |
| rel ceiling           | `min(rel, 10)` — TK Motie (3+2) + bestScore 5 → exactly 10                                                                                          |
| Tag bonus             | +1 per tag that appears in title or description                                                                                                     |
| Quoted terms          | `"green deal"` is stripped to `green deal` before matching                                                                                          |
| dossierId assignment  | From the highest-scoring search; null when winning search has no dossier; lower-scoring search's dossierId does not carry over when winner has null |

The last dossierId case revealed a **bug** fixed in this session: `rules.ts` used
`if (search.dossierId) dossierId = search.dossierId`, which never cleared the value
when the winning search had `dossierId: null`. Fixed to unconditional assignment.

---

### `packages/backend/src/pa-monitoring/curation.service.test.ts`

**17 tests · unit · mocked feeds, DB, and scoreItem**

Covers `runCurationCycle` — the orchestration layer that loads saved searches, fetches
the right feeds, deduplicates items, scores them, and persists candidates above the
relevance threshold.

`scoreItem` is mocked here (tested in isolation in `rules.test.ts`).

| Group              | What is tested                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No searches        | Returns early; no feeds fetched                                                                                                                                   |
| Source routing     | TK-only → only `fetchTkFeed`; OB-only → only `fetchObFeed`; EU-only → only `fetchEuFeed`; TK+OB → both, not EU; missing `source` field defaults to `['tk', 'ob']` |
| EU fetch count     | Multiple EU searches still trigger exactly one `fetchEuFeed` call per cycle                                                                                       |
| EU config flag     | `PA_EU_SOURCE_ENABLED=false` suppresses EU fetch even when EU searches exist                                                                                      |
| TK/OB query dedup  | Identical query string in two searches fetches that API once, not twice                                                                                           |
| rel threshold      | Items scoring below 4 are not written to DB; items at exactly 4 are persisted                                                                                     |
| Item deduplication | Two feed results with the same `source:id` are written once; same `id` from different sources are treated as distinct                                             |
| Error resilience   | A failing TK fetch does not abort the cycle — OB and EU are still attempted; EU fetch failure resolves cleanly                                                    |

---

### `packages/backend/src/pa-monitoring/pa.routes.test.ts`

**7 tests · route integration · mocked DB and auth**

Covers the role-gating middleware on PA data routes. `jwtMiddleware` is replaced with a
test stub that reads an `x-test-roles` header; `requireRoles` is the real implementation.

| Scenario                                  | Expected                                |
| ----------------------------------------- | --------------------------------------- |
| No `Authorization` header                 | 401 `MISSING_TOKEN`                     |
| Valid JWT, role `caseworker`              | 403 `FORBIDDEN`                         |
| Valid JWT, role `public-affairs`          | 200 (signals) / 404 (unknown signal id) |
| Valid JWT, `public-affairs`, known signal | 200 with confirmed signal shape         |

Routes tested: `GET /v1/pa/signals`, `POST /v1/pa/signals/:id/confirm`.

---

### `packages/backend/src/pa-monitoring/sources/eu.client.test.ts`

**12 tests · pure unit · fixture-based, no network**

Covers `parseRssFeed` — the RSS parser for the European Parliament plenary feed.
Uses a static fixture (`__fixtures__/ep-plenary.rss.xml`) so no network is required.

| Group             | What is tested                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| Basic parsing     | Returns at least one item; every item has a non-empty title             |
| Ref extraction    | `guid` → EP document ref (e.g. `A-10-2026-0181`)                        |
| Doceo URL         | Provenance link points to `doceo.europarl.europa.eu`                    |
| Date parsing      | ISO date extracted from `<pubDate>`                                     |
| Dutch type labels | `<category domain="type">` mapped to Dutch label (Verslag, Motie, …)    |
| Term expansion    | `EU_TO_NL_TERMS` appends Dutch equivalents to `description` for scoring |
| Agenda filtering  | Items without an EP document ref in the guid are excluded               |

---

## Coverage

Run `npm test --workspace=@ronl/backend` to generate a coverage report in
`packages/backend/coverage/`. The PA monitoring module (`pa-monitoring/`) is the
primary coverage target; external API clients (`tk.client.ts`, `ob.client.ts`) are
excluded from unit coverage because they depend on live network responses.

---

## Adding tests

All test files follow the pattern `src/**/*.test.ts` and are picked up automatically.
Place new tests next to the file they cover. Shared test helpers (factories, stubs) can
live in a `__helpers__` subdirectory alongside the test files.

The backend Jest config is at `packages/backend/jest.config.js`. Path aliases (`@utils/`,
`@services/`, `@auth/`, `@middleware/`, `@ronl/shared`) are mapped there and work inside
test files.
