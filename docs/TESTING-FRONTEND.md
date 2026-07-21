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

## Reading test output — expected console noise

A clean run still prints warnings and `Error: ...` stack traces to the
console. That's expected — **don't triage individual console lines, triage
the pass/fail summary**:

```
✓ src/pages/AuthCallback.test.tsx (16 tests)
✓ src/pages/public-affairs-v2/PaDataProvider.test.tsx (10 tests)
✓ src/components/CaseworkerDashboardV2/SectionErrorBoundary.test.tsx (4 tests)
...
 Test Files  119 passed (119)
      Tests  888 passed (888)
```

A real failure shows a red `×` next to the specific test name and a `FAIL`
block with an assertion diff. The noise below is not that — it falls into
two categories:

**`Warning: An update to <Component> inside a test was not wrapped in
act(...)`** — React's own dev-mode warning, not an error. It fires when a
component's state changes (typically a `useEffect` resolving a mocked
promise) slightly after the test's assertions already ran and React can't
guarantee the update was flushed inside its `act()` batching. Harmless when
the test already `await`ed the data it needed before asserting — this is a
late second update nobody's asserting on. Seen in several P5 dashboard
containers (`PADashboardV2`, `WooDashboard`, `CaseworkerDashboardV2`,
`CuratieSpecSection`); not something to chase down per file.

**A stray `Error: ...` stack trace with no matching `FAIL` block** —
almost always a test deliberately making something throw or reject to
verify the app's own error-handling UI, where the error path's own logging
(or React's dev-mode error reporting) prints as a side effect even though
the resulting assertions all pass. Three flavors show up in this suite:

- **The app's own `console.error` call, firing as designed.**
  `AuthCallback.tsx`'s catch block does `console.error('Keycloak
initialization error:', err)` before setting the fallback error message.
  `AuthCallback.test.tsx` mocks `keycloak.init` to reject specifically to
  exercise that catch block — the log is the component working correctly,
  not a problem.
- **A negative-path hook test with no error boundary.**
  `PaDataProvider.test.tsx` asserts `usePaData()` throws when called
  outside its provider (`renderHook` with no wrapper). The test spies on
  `console.error` to suppress React's first log, but `renderHook` has no
  boundary around it, so React also reports the uncaught render error
  through jsdom's `window` error-event path — a second channel the spy
  doesn't reach. The test is asserting exactly this thrown message.
- **An error-boundary test, by design.**
  `SectionErrorBoundary.test.tsx` renders a `Bomb` component that throws on
  purpose to verify the boundary catches it and renders the fallback panel.
  React _does_ catch it — that's correct behavior — but development-mode
  React still logs caught errors to the console via multiple paths
  regardless of whether a boundary handled them for rendering purposes.

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

Some data modules generate their mock fixture from a **fixed-seed PRNG**
(e.g. `woo.data.ts`'s `WOO_REGISTER`, 218 rows from a seeded mulberry32-style
generator) rather than hand-written literals — deterministic across runs,
but not something to snapshot line-by-line. Test structural invariants
instead (`toHaveLength(218)`, id format/uniqueness, sort order, a field
that's only ever true under a specific condition) — that survives the
generator being tweaked later without becoming a change-detector test that
breaks on every unrelated edit. See `woo.data.test.ts`.

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

For a component that wraps a third-party **custom element** (e.g.
`AltchaWidget.tsx`, worked example: `AltchaWidget.test.tsx`), the same
`render`/`screen` approach works — jsdom supports
`customElements.define`/`CustomEvent` natively, so you can
`el.dispatchEvent(new CustomEvent('statechange', { detail: {...} }))` to
simulate the widget's callback.

For a component that wraps a third-party **class instance** (e.g.
`DecisionViewer.tsx`/`ProcessStartFormViewer.tsx` both wrap
`@bpmn-io/form-js`'s `Form`), mock the class with a plain `function`, not an
arrow function — `new (() => x)` is a runtime error, since arrow functions
have no `[[Construct]]`:

```ts
const mockFormInstance = vi.hoisted(() => ({
  importSchema: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
}));
const MockForm = vi.hoisted(() =>
  vi.fn(function MockFormCtor() {
    return mockFormInstance; // a constructor that returns an object overrides `this`
  })
);
vi.mock('@bpmn-io/form-js', () => ({ Form: MockForm }));
```

Watch for **`Promise.allSettled`** absorbing rejections: if a component
fetches via `Promise.allSettled([...])` (as `DecisionViewer.tsx` does), a
rejected individual promise does _not_ make the `.catch()` after
`allSettled` fire — it just becomes a `{ status: 'rejected' }` entry that
the component's own fallback logic handles (usually routing to a
"no data"/fallback UI state, not an error state). To reach a genuine error
state in a component like this, you typically need the effect itself to
throw _before_ `Promise.allSettled` runs — e.g. mock one of the underlying
calls with `mockImplementation(() => { throw new Error(...) })` (synchronous
throw) rather than `mockRejectedValue()` (a rejected promise, which
`allSettled` absorbs). See `DecisionViewer.test.tsx` for both cases side by
side.

### Page-level containers (dashboard shells)

These files (`Dashboard.tsx`, `PADashboardV2.tsx`, `CaseworkerDashboardV2.tsx`,
`WooDashboard.tsx`, `InfraBoardDashboard.tsx`) are 300–1,000+ line shells:
top bar, mode/tab nav, a rail, a main section dispatcher, a command palette,
an assistant dock. Test **this container's own wiring** — not its children,
which either have their own test file already or belong to a future backlog
item — by mocking every child component and every context one level below
where this file consumes it:

```ts
vi.mock('../components/InfraBoardDashboard/InfraSectionRouter', () => ({
  default: (props: { mode: string; section: string }) => (
    <div data-testid="section-router">{props.mode}:{props.section}</div>
  ),
}));
```

For a container that renders a real context provider around itself (e.g.
`PADashboardV2` wraps everything in `PaDataProvider`), mock the provider
module itself rather than letting the real one run — a passthrough for the
provider, a controllable `vi.fn()` for the hook:

```ts
const mockUsePaData = vi.hoisted(() => vi.fn());
vi.mock('./public-affairs-v2/PaDataProvider', () => ({
  PaDataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePaData: mockUsePaData,
}));
```

`PaDataProvider` already has its own full test file — re-running it here
through the real thing would just duplicate that coverage while making
these tests slower and harder to reason about.

What's worth testing at this layer, worked examples across the five files:

- **Auth/access gates** — unauthenticated → login prompt; authenticated but
  missing a required role/org-type → the no-access panel; both wired
  correctly for an authorized user (all five files).
- **Tab/mode switching**, including mode-specific defaults
  (`InfraBoardDashboard`, `WooDashboard`, `CaseworkerDashboardV2`) and a
  genuinely tricky one: `PADashboardV2`'s `switchMode` restores the last
  section visited _per mode_, falling back to a hardcoded default only on
  first visit — test both the fallback and the restore.
  `CaseworkerDashboardV2` also has a real exception to its own login wall
  (the public "Zoeken" mode is reachable while unauthenticated) worth
  testing explicitly since it's easy to regress.
- **Login/logout**, including the `sessionStorage` keys the login flow
  writes before navigating to `/auth`.
- **The highest-value form flow**, not every one — `Dashboard.tsx`'s permit
  application is a two-step flow worth getting right in a test: the child
  form's own local success screen fires first, and the _container's_ tab
  switch only happens once the user clicks through it — don't assume
  `onStarted` and the container's `onSubmitted` fire together.
- **Command palette / dock toggle** open state and `sessionStorage`
  persistence, where present.

What's explicitly out of scope here: exhaustive rail-rendering permutations,
every inline sub-form's every branch, and anything already covered by that
child component's own test file.

### SSE streaming (`businessApi.mcp.chatStream`)

Bypasses `axios` entirely — it's an async generator reading a raw `fetch`
`ReadableStream` via `TextDecoder`, splitting on `\n`, and parsing
`data: {...}` lines as JSON. Rather than fighting `msw`'s streamed-response
API, mock the reader directly — it's a two-method interface
(`{ read(), releaseLock() }`), trivial to fake:

```ts
function makeStreamResponse(chunks: string[], opts: { ok?: boolean; status?: number } = {}) {
  const encoder = new TextEncoder();
  let i = 0;
  const reader = {
    read: vi.fn(async () =>
      i < chunks.length
        ? { done: false, value: encoder.encode(chunks[i++]) }
        : { done: true, value: undefined }
    ),
    releaseLock: vi.fn(),
  };
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    body: { getReader: () => reader },
  } as unknown as Response;
}

vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeStreamResponse(['data: {"type":"done"}\n'])));
```

Consume the async generator the same way calling code does:

```ts
async function collect(gen: AsyncGenerator<McpChatStreamEvent>) {
  const out: McpChatStreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}
```

Worked example: `packages/frontend/src/services/api.chatStream.test.ts`
(kept as its own file, separate from `api.test.ts`, since it needs raw
`fetch` stubbing instead of `msw` — a deliberate, documented exception to
"one test file per source file"). Covers: normal event parsing; a line
split across two chunks (real buffering logic, not just decoding);
malformed JSON on one line without losing subsequent valid events;
non-`data:` lines (SSE comments/blank lines) ignored; the reader's lock
released once the stream ends; the two distinct error paths (`!response.ok`
with a parseable vs. unparseable error body, and `fetch` itself rejecting);
the `AbortError` case, which yields nothing at all rather than an error
event (it's a deliberate cancellation, not a failure); and the auth
interceptor attaching a bearer token, including the branch where a failed
token refresh causes `keycloak.login()` without ever calling `fetch`.

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
10.92% statements / 7.01% branches overall; `PaDataProvider.tsx` alone at
86.44% statements / 100% branches. That's the shape to expect going
forward — a service/hook-heavy file lifts the total a lot per file, a
component or page barely moves it, since `src/services` + `src/hooks` are
a small fraction of the codebase's total statement count.

**After P3** (small reusable components — `SessionExpiryWarning`,
`AltchaWidget`, `DecisionViewer`, `PersonalDataPanel`,
`ProcessStartFormViewer`, `TimeLine`): 14.14% statements / 9.7% branches
overall, 187 tests total (up from 149 after P2). `components/` is a much
bigger denominator than `services`/`hooks` (82 files), so 6 small files
barely move the overall percentage — watch per-file coverage in the
report, not just the top-line number.

**After P4** (remaining pure logic/data modules — `woo/modes.config.ts`,
`login-choice/boards.config.ts`, `infra-board/modes.config.ts`,
`caseworker-v2/modes.config.ts`, `infra-board/rip-model.ts`,
`infra-board/infra-board.data.ts`, `woo/woo.data.ts`): 18.45% statements /
12.81% branches overall, 251 tests total (up from 187 after P3).
`woo.data.ts` alone hit 96.55% statements — data/config modules with real
logic (filter predicates, deterministic seeded generators) are cheap to
cover thoroughly, same as P1's services.

**After P5** (dashboard containers, critical interactions only —
`InfraBoardDashboard`, `WooDashboard`, `CaseworkerDashboardV2`,
`PADashboardV2`, `Dashboard.tsx`): 25.67% statements / 20.03% branches
overall, 292 tests total (up from 251 after P4). `src/pages` alone jumped
from ~15% to 54.18% statements — unlike P1–P4, these are large files
(300–1,000+ lines each), so even a scoped, non-exhaustive pass moves the
top-line number a lot. Per-file numbers (60–86% statements) reflect what
"critical interactions only" actually covers — the untested remainder is
mostly deep branches inside inline sub-forms and rail-rendering variants
that weren't worth chasing.

**After P6** (SSE streaming chat — `businessApi.mcp.chatStream`, the final
backlog item): **26.33% statements / 20.41% branches / 21.09% functions /
26.46% lines** overall, 303 tests total (up from 292 after P5). `api.ts`
itself went from 13.23% to 39.7% statements — `chatStream` alone is a
sizeable chunk of that file's statement count, and it's now fully covered
including the buffer/reassembly logic, malformed-line handling, and both
error paths (HTTP error, network/fetch rejection, abort).

**Full P1–P6 baseline: 1.6% → 26.33% statements, 11 → 303 tests, in six
scoped passes.** The remaining ~74% is P1b (`api.ts`'s other ~40 methods)
plus everything below P6 in feature-area terms: most page/section
components (`Vandaag`, `Monitoring`, `AgendaView`, `Issuekaart`,
`WooDashboard`'s section views, `CaseworkerDashboardV2`'s section views,
etc.) and `AuthCallback`/`LoginChoice`/`ChangelogPanel`, none of which were
in scope for this backlog.

**After P1b + section components** (`test/p1b-sections-followups` branch —
`api.ts`'s remaining ~40 methods; every Public Affairs section component
—`Vandaag`, `Monitoring`, `AgendaView`, `Issuekaart`, `Kompas`, `Voortgang`,
`FeitenCijfers`, `BronnenSection`, `ZoekcriteriaSection`,
`NotificatiesSection`, `CuratieSpecSection`, `KompasSpecSection`,
`CuratiePijplijnFlow`, `WatchBell`; every Woo Dashboard section component
—`Register`, `Bezwaar`, `Overzicht`, `Proces`, `Publicatie`, `Tijdigheid`,
`Verzoeken`, the `charts.tsx` SVG primitives; and the Caseworker/InfraBoard
side —`GegevenswoordenboekV2`, `TakenInbox`, `MijnDag`, `Fase1Swimlane`,
`Portfolio`, `ProjectDetail`): **46.59% statements / 38.28% branches /
45.23% functions / 47.07% lines** overall, 466 tests across 60 files (up
from 303 tests / 26.33% statements after P6). `api.ts` itself reached
95.58% statements. Section components followed the same "critical
interactions only" scoping as P5 for the largest files —
`ZoekcriteriaSection.tsx` (1,069 lines, the single largest component in the
codebase) got 8 targeted tests (grouping, create, edit, scope-promote,
notify-toggle, delete, scoring-modal open/close) rather than exhaustive
coverage of every inline sub-form branch; `Issuekaart.tsx` and
`Monitoring.tsx` similarly still show lower per-file percentages (37% and
55% statements respectively) by design — the untested remainder is deep
sub-tab/rail branches, not core interaction paths.

No threshold is enforced yet — that becomes a later milestone once the
backlog below is substantially worked through, matching the backend's
current "manual discipline" approach documented in `TESTS.md`.

**After P7** (`components/CaseworkerDashboard/`'s 18 small/medium files,
branch `test/p7-p11-remaining-coverage`): **54.28% statements / 46.54%
branches / 50.98% functions / 55.27% lines** overall, 581 tests across 78
files (up from 466 tests / 46.59% statements). One real finding along the
way: `AuditSection.tsx`'s load-on-mount effect had no role guard — it
fetched `/admin/audit` on every mount regardless of `user.roles`, and only
the _rendered_ UI was gated behind the admin check that came after the
hooks. **Fixed** on `fix/audit-section-role-gate`: the effect now checks
the same `isAdmin` flag the render guard uses and skips `load(0)` entirely
for a non-admin user, re-firing if the user gains the role later (e.g. a
role refresh mid-session).

**After P8** (`components/CaseworkerDashboard/`'s 11 larger files, critical
interactions only): **67.92% statements / 60.9% branches / 64.63% functions
/ 69.68% lines** overall, 660 tests across 89 files (up from 581 tests /
54.28% statements). This closes out `components/CaseworkerDashboard/`
entirely — every one of its ~29 files now has a test file. Two small UX
findings surfaced along the way, both **fixed** on `fix/audit-section-role-gate`:
`IouFeedbackSection.tsx`'s persist effect now skips writing while
`submitState === 'success'`, so `clearDraft()`'s removal on a successful
submit sticks instead of being immediately undone by the form-watching
effect rewriting a blank draft right after; and
`IouGebruiksscenarioSection.tsx`'s "Overig / Other" materials checkbox is
now wrapped in a `<label>` like its sibling options, so clicking its text
toggles it too, not just the checkbox itself.

**After P9** (`components/PADashboardV2/dossierbeheer/`'s 8 files — the PA
dossier-authoring surface): **72.24% statements / 66.03% branches / 70.1%
functions / 74.15% lines** overall, 722 tests across 97 files (up from 660
tests / 67.92% statements). `Dossierbeheer.tsx` (the container) was tested
by mocking one level below — `DossierRow`/`DossierEditor`/`TemplateGallery`/
`ArchiveDialog`/`DeleteDialog` all get lightweight stubs exposing their
props as clickable buttons, same pattern as the P5 dashboard containers. One
real gap found here — `actionError` was only rendered inside the overview
('list' mode) JSX branch, but `handleSave`'s catch doesn't switch the view
back to 'list' on failure, so a failed save while still in the editor set
the error state but never rendered it anywhere — was **fixed** on
`fix/audit-section-role-gate`: the banner JSX is now a shared
`actionErrorBanner` variable rendered in both the edit view and the
overview, so a failed save is visible regardless of which view the user is
still on.

**After P10** (`LoginChoice.tsx` + `BoardCard`/`BoardPreview`,
`AuthCallback.tsx`, `ChangelogPanel.tsx`): **74.86% statements / 68.15%
branches / 72.81% functions / 76.81% lines** overall, 758 tests across 102
files (up from 722 tests / 72.24% statements). `AuthCallback.tsx` got the
most thorough coverage of the three — the medewerker vs. citizen IdP
branches, the role→dashboard fallback table, and the post-login-redirect
allow/deny logic (including the infra-projectteam-vs-caseworker precedence
case) are all real behavior worth locking in, not just smoke tests.
`ChangelogPanel.test.tsx` renders the real `changelog-data.ts` (60+ version
entries) rather than a trimmed fixture, which pushed one test over the 5s
default timeout under full-suite CPU contention — fixed with a per-file
`vi.setConfig({ testTimeout: 15000 })` rather than shrinking the fixture to
something unrealistic.

**After P11** (all 17 `*CommandPalette*`/`*Dock*`/`*SectionRouter*`/
`*NoAccessPanel*` shell files across the 4 dashboards): **83.39% statements
/ 75.09% branches / 79.18% functions / 84.99% lines** overall, 888 tests
across 119 files (up from 758 tests / 74.86% statements). This closes the
entire P1–P11 backlog — **every component and page in the frontend now has
at least a test file**, following the established layer-by-layer patterns
throughout: mock the network boundary for API calls, mock one level below
for containers/routers (their children already have dedicated tests), keep
pure logic/data modules unmocked. The two `*SectionRouter*` files (`PA` and
`Caseworker-V2`, ~190 lines each) were the largest in this priority —
each dispatches a section id to one of a dozen+ already-tested child
components plus a defence-in-depth role/org-type gate, so the tests focus
on the routing table and the gate logic itself rather than re-testing
children.

## CI roadmap

Neither `azure-frontend-acc.yml` nor `azure-frontend-prod.yml` currently run
lint or tests — they go straight from `npm ci` to `vite build` to deploy.
That's an intentional, separate decision from this guide: **no CI test gate
is being added yet**, even now that the full P1–P11 backlog is done (888
tests, 83.39% statement coverage, every component/page has a test file).
The remaining ~17% of uncovered statements is depth, not breadth — dense
inline sub-branches inside already-tested files, deliberately left out
under the "critical interactions only" scoping used throughout P5/P8/P9 for
large files. Revisit adding a CI gate once that depth gap has closed
further, or once the team decides breadth alone is enough to gate on; when
ready, add a test step to both workflows before the build step, mirroring
how `azure-backend-*.yml` already runs `npm run lint` before building.

## Coverage backlog (priority order)

| Priority | Area                                                                                                                                                                                                                                                                                                                                  | Why this order                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**   | `services/*.ts` — **done** (`keycloak.ts`, `tenant.ts`, `bsn.mapping.ts`, `brp.api.ts`, `brp.timeline.ts`, `dossierbeheer.api.ts`, `infra.api.ts`, `pa.api.ts` fully tested; `api.ts` has a worked example on `businessApi.health` but its other ~40 methods, listed below, are not yet covered)                                      | Highest value, lowest cost — no DOM needed, and this is the auth/error-handling layer everything else depends on.                                                                                                                                                |
| **P1b**  | Remaining `api.ts` methods — **done** (`evaluateDecision`, `process.*`, `task.*`, `portal.*`, `hr.*`, `rip.*`, `admin.*`, `capacityClaim.*`, `edocs.*`, `mcp.*` non-streaming, `externalStatus`, `getBaseUrl` all now covered; `api.ts` reaches 95.58% statements)                                                                    | Same `msw` pattern as `businessApi.health` — mechanical repetition, not a new pattern to establish. Lower priority than P1 was because the auth-interceptor risk (the part that's shared across all of them) is already covered.                                 |
| **P2**   | Hooks — **done** (`infra.api.ts`'s `useOpenTasks`/`useActivityHistory` done as part of P1; `hooks/useProfielData.ts` and `PaDataProvider.tsx`'s `useResource`/`usePaData` context now fully tested)                                                                                                                                   | Needs jsdom + `renderHook`; covers the loading/error/success state machine repeated across the app.                                                                                                                                                              |
| **P3**   | Small reusable components — **done** (`SessionExpiryWarning`, `AltchaWidget`, `DecisionViewer`, `PersonalDataPanel`, `ProcessStartFormViewer`, `TimeLine` all fully tested)                                                                                                                                                           | Isolated, low-complexity — good next targets for establishing the RTL pattern broadly across the team.                                                                                                                                                           |
| **P4**   | Remaining pure logic/data modules — **done** (`woo/modes.config.ts`, `login-choice/boards.config.ts`, `infra-board/modes.config.ts`, `caseworker-v2/modes.config.ts`, `infra-board/rip-model.ts`, `infra-board/infra-board.data.ts`, `woo/woo.data.ts` all fully tested)                                                              | Same pattern as the 2 existing PA tests, just extended to the other feature areas — cheap, mechanical.                                                                                                                                                           |
| **P5**   | Page-level dashboard containers — **done, scoped to critical interactions** (`InfraBoardDashboard`, `WooDashboard`, `CaseworkerDashboardV2`, `PADashboardV2`, `Dashboard.tsx` — auth gates, tab/mode switching, login/logout, command palette, and the highest-value form flows; deliberately not exhaustive on 500+ line containers) | High value but expensive. Mock every child section/dock/palette component and go one level below `PaDataProvider`/`usePaData` rather than through the real context, so each test targets this container's own wiring, not a re-test of already-covered children. |
| **P6**   | SSE streaming chat — **done** (`businessApi.mcp.chatStream`: SSE parsing/buffering across chunk boundaries, malformed-line handling, error/abort paths, auth)                                                                                                                                                                         | Bypasses `axios`/`msw` entirely (raw `fetch` + `ReadableStream`); mock a `{ getReader, releaseLock }` reader directly instead. See `api.chatStream.test.ts`.                                                                                                     |

**P1–P6 backlog complete, plus P1b and the full section-component sweep** (branch `test/p1b-sections-followups`). Every dashboard's individual section components — Public Affairs, Woo, Caseworker-V2, and InfraBoard — now have dedicated test files, on top of the P5 container-level tests that already mocked them out.

`components/CaseworkerDashboard/` (the folder name is a holdover from before the V2 migration) turned out **not** to be dead code — every one of its ~29 files is still imported, either directly by `CaseworkerDashboardV2/SectionRouter.tsx`, `InfraBoardDashboard/InfraSectionRouter.tsx`, and `PADashboardV2/PASectionRouter.tsx`, or transitively within the folder itself (`CapacityClaimDocumentsViewer` via `CapacityClaimArchiefSection`, `ProcessStepsTimeline`/`RipFase1WipViewer` via the RIP Fase 1 sections). It's a shared section-component library now, reused by three of the four V2 dashboards, and it's the single largest block of untested, definitely-live code left — hence P7/P8 below. A full-repo orphan scan (126 source files, matched by basename import) found no other dead files anywhere in `src/`.

| Priority | Area                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Why this order                                                                                                                                                                                                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P7**   | `components/CaseworkerDashboard/` — small/medium files (<200 lines, 18 files: `ProcessVarsSection`, `processSteps.ts`, `DvtpStartSection`, `HrOnboardingSection`, `CapacityClaimSection`, `ProcessStepsTimeline`, `RollenSection`, `RipFase1Section`, `BerichtenSection`, `NieuwsSection`, `OnboardingArchiefSection`, `RipFase1WipSection`, `RipFase1GereedSection`, `TaskFormViewer`, `CapacityClaimArchiefSection`, `ProfielSection`, `DvtpTakenSection`, `AuditSection`) — **done** | Highest leverage in the whole remaining backlog — every file here is reused by 2–3 of the 4 V2 dashboards (`SectionRouter`/`InfraSectionRouter`/`PASectionRouter`, plus `TaskFormViewer`/`ProcessVarsSection` from `TakenInbox`/`ProjectDetail`), so one test file benefits multiple dashboards at once. Cheap and mechanical at this size — same pattern as P3. |
| **P8**   | `components/CaseworkerDashboard/` — larger files (200+ lines, 11 files: `ArchiefSection`, `IouZakenSection`, `CapacityClaimDocumentsViewer`, `GereedschapSection`, `RipFase1WipViewer`, `ProcesBibliotheek`, `ProductenDienstenCatalogus`, `McpChatSection`, `IouFeedbackSection`, `RegelCatalogus` (704 lines), `IouGebruiksscenarioSection` (826 lines, the largest file in this folder)) — **done**                                                                                  | Same shared-library leverage as P7, but expensive per file — scope to critical interactions only, the P5/`ZoekcriteriaSection` convention, not exhaustive branch coverage of 700–800 line files.                                                                                                                                                                 |
| **P9**   | `components/PADashboardV2/dossierbeheer/` (8 files: `Dossierbeheer.tsx`, `DossierEditor.tsx`, `DossierRow.tsx`, `ArchiveDialog.tsx`, `DeleteDialog.tsx`, `MdEditor.tsx`, `KompasScorer.tsx`, `TemplateGallery.tsx`) — **done**                                                                                                                                                                                                                                                          | Self-contained PA-authoring feature, not a shared dependency of anything else — lower leverage than P7/P8 but still a real, live surface (gated behind `pa-author`/`editor`/`admin` Keycloak roles that aren't provisioned yet, per project notes, but the code path is real once they are).                                                                     |
| **P10**  | Remaining top-level pages and their components: `LoginChoice.tsx` + `components/LoginChoice/{BoardCard,BoardPreview}.tsx`, `AuthCallback.tsx` (OAuth redirect handling), `ChangelogPanel.tsx` (mostly static-data rendering) — **done**                                                                                                                                                                                                                                                 | The first thing every user sees (`LoginChoice`) and the OAuth redirect glue (`AuthCallback`) are worth real behavioral tests; `ChangelogPanel` is lower-value (renders `changelog-data.ts`, already exercised indirectly) but cheap smoke coverage closes the gap.                                                                                               |
| **P11**  | `*CommandPalette*` / `*Dock*` / `*SectionRouter*` / `*NoAccessPanel*` shells across all 4 dashboards (17 files) — **done**                                                                                                                                                                                                                                                                                                                                                              | Lowest leverage of what's left — thin routing/keyboard-shortcut wrappers around components that already have their own test files (from P5's mocking and this backlog). Worth a pass for keyboard-shortcut wiring and role-gating regressions, but last in line.                                                                                                 |

**Follow-ups found while writing P4 tests:**

- **Fixed** (`test/p1b-sections-followups` branch): `login-choice/boards.config.ts` hardcoded `role: 'woo-coordinatie'` and `role: 'infra-projectteam'`, duplicating `woo/modes.config.ts`'s `WOO_GATE_ROLE` and `infra-board/modes.config.ts`'s `INFRA_GATE_ROLE`. Both boards now import the constant instead of re-typing the string; `boards.config.test.ts` has a regression check for each. (`public-affairs`/`caseworker` weren't touched — neither `modes.config.ts` for those exports an equivalent single-role constant to point at; their required roles live as local arrays inside the dashboard container itself.)
- **Reviewed, not changed** — product decision, not a code-quality issue: `woo.data.ts`'s `wooFilterRows` "In behandeling" status filter matches "not Gesloten and not Over termijn," not an exact string match against `r.status === 'In behandeling'`. This looks like the intended behavior (the register's open rows carry several different in-progress status strings, and "In behandeling" as a filter option reads as "still open"), but confirm with whoever owns the Woo dashboard's product requirements before treating it as settled — it's not obvious from the filter UI alone, and a future "fix" to exact-match could silently change what the filter shows.

## E2E / Playwright (future initiative — main lines only)

Not in scope for the tooling added alongside this guide. Noted here so the
next person doesn't have to rediscover the reasoning. The detailed Phase 1
plan lives in [`docs/TESTING-FRONTEND-UI.md`](./TESTING-FRONTEND-UI.md)
(branch `test/e2e-playwright-phase1`).

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
