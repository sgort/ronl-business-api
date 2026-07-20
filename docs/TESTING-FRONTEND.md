# Frontend testing guide — `packages/frontend`

The backend has a mature Jest suite (see [`TESTS.md`](./TESTS.md)). The frontend
does not — at the time this guide was written it had 2 test files covering pure
logic only, and the Vitest config couldn't even render a component (no DOM, no
React Testing Library). This guide documents the conventions to use going
forward, plus the tooling that was added to make component/hook testing
possible at all.

## Running the tests

```bash
# From the repo root — runs backend Jest + frontend Vitest, both with coverage
npm test

# Frontend only, once (with coverage report — same convention as the backend's
# `jest --coverage` default)
npm test --workspace=@ronl/frontend

# Frontend only, watch mode (no coverage — kept fast for the dev inner loop)
npm run test:watch --workspace=@ronl/frontend

# Single file / pattern
npx vitest run --config packages/frontend/vite.config.ts session
```

There is currently **no CI test gate** for either package — `npm test` is a
manual discipline enforced by review, same as the backend. See
[CI roadmap](#ci-roadmap) below for when/how that changes.

## Test runner & environment strategy

Frontend tests run on **Vitest**, configured in `packages/frontend/vite.config.ts`:

```ts
test: {
  environment: 'node',
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
  coverage: {
    provider: 'v8',
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
  },
},
```

- **`environment: 'node'`** is the default for every test file — no DOM, fast
  startup. Pure logic (utils, `*.data.ts` config modules) and service/API-layer
  tests belong here; `axios` + `msw` work fine without a DOM.
- **Per-file override to jsdom** for anything that needs to render a component
  or a hook that touches the DOM. Add this as the very first line of the file:

  ```ts
  // @vitest-environment jsdom
  ```

  Don't flip the _global_ environment to `jsdom` — most of the codebase (utils,
  services, data modules) doesn't need it, and paying jsdom's startup cost on
  every file slows the whole suite down for no benefit.

- **`globals: true`** is required for React Testing Library's automatic
  cleanup between tests to register itself (it checks for a global
  `afterEach`). Existing tests still explicitly `import { describe, it, expect } from 'vitest'` — that's fine, an explicit import shadows the global in that
  file. New tests can rely on the globals or import explicitly; stay
  consistent with whichever a given directory is already doing.
- **`setupFiles: ['./src/test/setup.ts']`** loads `@testing-library/jest-dom/vitest`
  matchers (`toBeInTheDocument()`, etc.) for every test file. This is safe to
  load globally even for `node`-environment tests — it only extends `expect`,
  it doesn't touch the DOM at import time.
- **`.env.test`** provides `VITE_API_URL`/`VITE_KEYCLOAK_URL`/etc. for service
  tests. Axios's Node adapter needs a syntactically valid absolute base URL to
  construct a request even when `msw` is going to intercept it — without this
  file, service tests fail with `TypeError: Invalid URL`.

## File conventions

- Colocate `*.test.ts` / `*.test.tsx` next to the file under test — same
  pattern as the two existing tests (`kompas.test.ts`,
  `notificaties-nav.test.ts`) and the backend's colocated `*.test.ts` files.
- No `__tests__` directories.
- Shared mocks/fixtures used by more than one test file go in a local
  `__helpers__` subdirectory, mirroring the backend's convention documented in
  `TESTS.md`. Don't create one until a second file actually needs to share
  something — none exist yet.

## Layer-by-layer patterns

### Pure utils / data modules

No new pattern needed — keep following what `kompas.test.ts` and
`notificaties-nav.test.ts` already do: plain `describe`/`it`/`expect` against
an exported pure function or static config, `environment: 'node'` (the
default), no mocks.

### API / service modules

Mock at the **network boundary** with `msw`, not by stubbing `axios` methods
directly — this exercises the real interceptor chain (including the
Keycloak-token-refresh logic every request goes through) and works uniformly
whether a module uses `axios` or raw `fetch`.

`keycloak.ts` exports a module-level singleton (`new Keycloak(...)` runs at
import time), so it must be mocked with `vi.mock`, not partially stubbed.

The one exception is testing `keycloak.ts` itself (`getUser`/`getToken`) —
there's nothing to mock, you need the real singleton. `keycloak-js`'s
constructor touches `document` at construction time, so that file's test
needs `// @vitest-environment jsdom` even though it's otherwise a plain
service test with no rendering involved. See
`packages/frontend/src/services/keycloak.test.ts`.

Worked example: `packages/frontend/src/services/api.test.ts` (tests
`businessApi.health`) covers:

- a successful response,
- the "error response still carries usable data" fallback path,
- the auth interceptor attaching `Authorization: Bearer <token>` when
  `keycloak.authenticated` is true,
- no auth header when it's false.

Key shape:

```ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  token: undefined as string | undefined,
  updateToken: vi.fn(),
  login: vi.fn(),
}));
vi.mock('./keycloak', () => ({ default: mockKeycloak }));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('returns the health payload on success', async () => {
  server.use(
    http.get('*/health', () => HttpResponse.json({ success: true, data: { status: 'healthy' } }))
  );
  const result = await businessApi.health();
  expect(result).toEqual({ status: 'healthy' });
});
```

`vi.hoisted` is required because `vi.mock` factories are hoisted above normal
`const` declarations — referencing a plain `const mockKeycloak` inside the
factory throws a "Cannot access before initialization" error.

`onUnhandledRequest: 'error'` is deliberate: a request nobody mocked should
fail the test loudly, not silently hit the real network.

Some service modules hold **module-level mutable state** (an in-memory
cache, a mock data store — e.g. `tenant.ts`'s `cachedTenants`,
`dossierbeheer.api.ts`'s `mockStore`). Because Vitest gives one module
instance per test _file_ (not per test), that state otherwise leaks between
tests. For simple caches, just overwrite the state at the start of every
test that depends on it (see `tenant.test.ts`). For a store with real CRUD
semantics where tests build on each other within a single scenario, isolate
each test completely instead:

```ts
async function freshApi(isMock: boolean) {
  vi.resetModules();
  mockIsDossiersMock.mockReturnValue(isMock);
  return import('./dossierbeheer.api');
}
```

`vi.mock()` factory registrations survive `vi.resetModules()` — only the
instantiated module cache is cleared — so a fresh dynamic `import()` after
`resetModules()` gets its own isolated copy of the module's state while
still using the same mocks. See `dossierbeheer.api.test.ts`.

### Hooks

Use `renderHook` + `waitFor` from React Testing Library, `// @vitest-environment jsdom`.
Mock `businessApi` directly with `vi.mock('./api', () => ({ businessApi: mockBusinessApi }))`
(`vi.hoisted` for the mock object, same reason as the service-layer pattern
above) rather than going through `msw` — hook tests are about the
loading/error/success state machine, not the HTTP layer, so mocking one
level lower keeps the test focused. Worked example:
`packages/frontend/src/services/infra.api.test.ts` (`useOpenTasks`,
`useActivityHistory`) covers the happy path, an unsuccessful response, a
rejected promise, and a conditional short-circuit (hook called with a null
id skips the API call entirely).

Two more worked examples, for two different hook shapes:

- `packages/frontend/src/hooks/useProfielData.test.ts` — a manual
  loading/error/data hook exposing an imperative `load()` function (not
  auto-fetching on mount). Demonstrates asserting the `loading: true` state
  mid-flight by resolving a manually-controlled promise inside `act()`.
- `packages/frontend/src/pages/public-affairs-v2/PaDataProvider.test.tsx` —
  a Context provider wrapping several `useResource` instances plus a set of
  write-actions that call an API function and then selectively `refetch()`
  one or more sibling resources. Uses RTL's `renderHook(fn, { wrapper })` to
  render the hook under `PaDataProvider`, and asserts the "outside a
  provider" error path by calling the hook with no wrapper at all — spy on
  `console.error` first, since React logs the render-time throw.

### Components

`render` + `screen` + `userEvent`, `// @vitest-environment jsdom`. Worked
example: `packages/frontend/src/components/SessionExpiryWarning.test.tsx`
covers a component that reads from the mocked `keycloak` singleton, renders
conditionally based on derived state, and responds to button clicks:

```ts
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

it('extends the session and hides the modal on "Sessie verlengen"', async () => {
  const user = userEvent.setup();
  render(<SessionExpiryWarning />);
  await user.click(screen.getByRole('button', { name: 'Sessie verlengen' }));
  expect(mockKeycloak.updateToken).toHaveBeenCalledWith(-1);
});
```

Prefer real timers over `vi.useFakeTimers()` when a test doesn't actually
need to fast-forward a `setInterval`/`setTimeout` — `userEvent.click()` can
hang against fake timers unless every internal delay is wired through
`advanceTimers`, which adds complexity for no benefit if the test isn't
asserting time-based behavior.

For a component that wraps a third-party custom element (e.g.
`AltchaWidget.tsx`), the same `render`/`screen` approach works — jsdom
supports `customElements.define`/`CustomEvent` natively, so you can
`fireEvent(el, new CustomEvent('statechange', { detail: {...} }))` to
simulate the widget's callback.

### SSE streaming (`businessApi.mcp.chatStream`)

Lower priority, harder to mock — it bypasses `axios` entirely and reads a raw
`fetch` `ReadableStream` via `TextDecoder`. `msw` supports streamed
responses (`new ReadableStream({ start(controller) { controller.enqueue(...) } })`
as the mock body), but write this once the simpler layers below have
established the team's comfort with the tooling — don't start here.

## Coverage

`npm test --workspace=@ronl/frontend` (i.e. the default `test` script) always
runs with coverage, matching the backend's `jest --coverage` convention.

`coverage.include` in `vite.config.ts` (see above) matters more than it looks:
Vitest's V8 provider only reports files it actually executes during the test
run. Without an explicit `include` glob, untested files aren't added to the
report at all — they're just absent, not shown at 0%. That made an early
version of this report look deceptively close to "done" (it only listed the
handful of files the 4 test suites happened to import). With `include` set to
the whole `src` tree, the report now reflects reality.

**Baseline** (once `coverage.include` was added, right after the first P1/P3
worked examples): 1.6% statements / 0.5% branches across 5,499 statements.

**After P1** (`services/*.ts` fully worked through, `api.ts` left at its
worked-example level — see the backlog table below): 9.72% statements /
6.89% branches overall; `src/services` itself at 73.41% statements / 70.35%
branches.

**After P2** (hooks — `useProfielData.ts` and `PaDataProvider.tsx`):
**10.92% statements / 7.01% branches / 8.46% functions / 10.71% lines**
overall; `PaDataProvider.tsx` alone at 86.44% statements / 100% branches.
That's the shape to expect going forward — a service/hook-heavy file lifts
the total a lot per file, a component or page barely moves it, since
`src/services` + `src/hooks` are a small fraction of the codebase's total
statement count.

No threshold is enforced yet — that becomes a later milestone once the
backlog below is substantially worked through, matching the backend's
current "manual discipline" approach documented in `TESTS.md`.

## CI roadmap

Neither `azure-frontend-acc.yml` nor `azure-frontend-prod.yml` currently run
lint or tests — they go straight from `npm ci` to `vite build` to deploy.
That's an intentional, separate decision from this guide: **no CI test gate
is being added yet.** Once frontend coverage is meaningful (roughly: the P1–P3
backlog items below are done), add a test step to both workflows before the
build step, mirroring how `azure-backend-*.yml` already runs `npm run lint`
before building.

## Coverage backlog (priority order)

| Priority | Area                                                                                                                                                                                                                                                                                             | Why this order                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**   | `services/*.ts` — **done** (`keycloak.ts`, `tenant.ts`, `bsn.mapping.ts`, `brp.api.ts`, `brp.timeline.ts`, `dossierbeheer.api.ts`, `infra.api.ts`, `pa.api.ts` fully tested; `api.ts` has a worked example on `businessApi.health` but its other ~40 methods, listed below, are not yet covered) | Highest value, lowest cost — no DOM needed, and this is the auth/error-handling layer everything else depends on.                                                                                                                |
| **P1b**  | Remaining `api.ts` methods (`evaluateDecision`, `process.*`, `task.*`, `portal.*`, `hr.*`, `rip.*`, `admin.*`, `capacityClaim.*`, `edocs.*`, `mcp.*`, `externalStatus`)                                                                                                                          | Same `msw` pattern as `businessApi.health` — mechanical repetition, not a new pattern to establish. Lower priority than P1 was because the auth-interceptor risk (the part that's shared across all of them) is already covered. |
| **P2**   | Hooks — **done** (`infra.api.ts`'s `useOpenTasks`/`useActivityHistory` done as part of P1; `hooks/useProfielData.ts` and `PaDataProvider.tsx`'s `useResource`/`usePaData` context now fully tested)                                                                                              | Needs jsdom + `renderHook`; covers the loading/error/success state machine repeated across the app.                                                                                                                              |
| **P3**   | Small reusable components (`SessionExpiryWarning` done; `AltchaWidget`, `DecisionViewer`, `PersonalDataPanel`, `ProcessStartFormViewer`, `TimeLine`)                                                                                                                                             | Isolated, low-complexity — good next targets for establishing the RTL pattern broadly across the team.                                                                                                                           |
| **P4**   | Remaining pure logic/data modules (`pages/*/*.data.ts`, `modes.config.ts` across `infra-board`, `caseworker-v2`, `woo`, `login-choice`)                                                                                                                                                          | Same pattern as the 2 existing PA tests, just extended to the other feature areas — cheap, mechanical.                                                                                                                           |
| **P5**   | Page-level dashboard containers (`Dashboard.tsx`, `PADashboardV2.tsx`, `CaseworkerDashboardV2.tsx`, `WooDashboard`, `InfraBoardDashboard`)                                                                                                                                                       | High value but expensive. Scope to critical interactions (tab switching, form submit success/error paths) — don't chase exhaustive coverage on 500+ line container components.                                                   |
| **P6**   | SSE streaming chat (`businessApi.mcp.chatStream`)                                                                                                                                                                                                                                                | Defer — hardest to mock correctly, lowest immediate risk.                                                                                                                                                                        |

## E2E / Playwright (future initiative — main lines only)

Not in scope for the tooling added alongside this guide. Noted here so the
next person doesn't have to rediscover the reasoning:

- **Why**: unit/component tests can't cover the full Keycloak login redirect,
  cross-page navigation, or real network behavior end-to-end.
- **Tooling**: `@playwright/test`, a new `packages/frontend/e2e/` directory
  with its own `playwright.config.ts`, run against a locally built/served
  frontend plus a running (or mocked) backend.
- **Milestones**: (1) install & scaffold Playwright; (2) one smoke test (app
  loads, login redirect works); (3) 2–3 critical user journeys (citizen login
  → dashboard, caseworker task action, process-start submission); (4) wire
  into CI as a separate, initially non-blocking workflow.
- Treat this as a distinct future effort with its own plan, not something to
  fold into the P1–P6 backlog above.
