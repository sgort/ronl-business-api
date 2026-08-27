# PA-Cockpit extraction — follow-ups

Carried out of `feat/de-vendor-pa-cockpit` (30 commits, `f9b580f..88f7906`), which
extracted the PA-Cockpit UI into `@ronl/pa-cockpit` and deleted the 45-file
vendored copy `packages/pa-demo` used to carry.

**None of these block the merge.** They were surfaced by the per-task reviews and
the whole-branch review, adjudicated as deferrable, and are written down here
because the SDD ledger they came from lives under a git-ignored path and does not
travel with the branch.

Ordered by value-for-effort, not severity. Nothing here is Critical; nothing leaks
today.

---

## 1. Close the `usePaModes` guard residual

**~20 lines, no new dependency. Do this one first.**

`packages/pa-cockpit/src/modes/no-module-scope-modes.test.ts` stops components
reaching `allStaticSections()` / `findPaModeForSection()` over the _unfiltered_
mode set — the path by which restricted sections could reach a public
unauthenticated site. It survives four rounds of adversarial review, but one hole
is open: a decoy function named `usePaModes` declared in an **inner function
scope**, in a file that also imports the genuine hook, disarms the excusing rule
for the whole file. It compiles with zero `tsc` and zero `eslint` errors.

**Correct the record before acting on it.** The original ruling parked this partly
on the grounds that closing it "needs a `ts.TypeChecker`". _That was wrong._ The
final whole-branch review reproduced the exploit and then closed it in about
twenty lines with two rules and no TypeChecker:

- **R3b (excuse):** if the file declares _any_ binding named `usePaModes` anywhere
  in its AST — not just the import specifier — refuse the excuse entirely.
  Fail-closed: a file that both imports and shadows the hook cannot be trusted to
  have called the import.
- **R5 (accuse):** no file may dynamically `import('…/modes.config')`. A plain text
  rule in the safe direction, applied to every file including the allow-list.

Both fire independently against the exploit; both stay green against the real tree
with no false positives. R5 alone nearly closes the harm half, since reaching the
unfiltered helpers otherwise requires a namespace import (caught by R2) or a star
re-export (R2/R4).

The park itself was still the right call at the time — harm needs a decoy _and_ a
dynamic import in the same file, and the guard is defence-in-depth behind the
required `host.modes` prop, `buildAllowedModes`, the E2E section assertion and the
CSP. But do not inherit "needs a TypeChecker" as settled fact.

---

## 2. A surface pass over `packages/pa-cockpit/src/index.ts`

The entry point was narrowed from 23 names to 9 in Task 9, then re-widened twice
for real needs. Every export was resolved against actual imports in both hosts;
three have **no consumer in either**:

- `isPaItemVisible` (`index.ts:44`) — zero consumers.
- `PaGateContext` — zero consumers. Exists only to type `isPaItemVisible`.
- `OrgTypeGate` — zero consumers _of the package's copy_. `packages/frontend`
  declares a character-identical `OrgTypeGate` at
  `pages/caseworker-v2/modes.config.ts:18` and `CaseworkerDashboardV2.tsx:46`
  imports **that** one.

Removing that triple is the concrete candidate. Also worth a look:
`getPaCockpitAuth` / `getPaCockpitTenant` have exactly one consumer repo-wide —
`packages/frontend/src/pages/pa-cockpit-host.test.ts`, a test. No host application
code reads back what it configured.

`index.test.ts` pins the value exports, so any change here is a visible diff. It
pins **values only**; the 15 type exports sit in a voided array, so adding or
removing a type export is still silent. Worth closing at the same time.

---

## 3. The login protocol is still hardcoded in the package

> **Done** on `feat/pa-cockpit-follow-ups` (`682385c`, `96c2f86`, `f450e54`), to
> the design in `docs/superpowers/specs/2026-08-27-cockpit-session-seam-design.md`.
> Session controls are now optional `onLogin` / `onLogout` host callbacks whose
> absence removes the control, the five hardcoded host facts are gone with a
> source-text guard keeping them gone, and `PaCockpitAuth` lost `logout`. The
> demo's avatar renders inert rather than disappearing — it is the identity
> display, not a labelled button — and no fourth `demo-overrides.css` rule was
> added, which was the point. Kept here for the reasoning.

`packages/pa-cockpit/src/pages/PADashboardV2.tsx:396-405` sets two `sessionStorage`
keys (`selected_idp`, `post_login_redirect`), an IdP literal (`'medewerker'`) and
navigates to two router paths (`/auth`, `/dashboard/public-affairs`). All five are
host-owned facts, in a package whose premise is that host-specific seams are
injected. Their real owners are `packages/frontend/src/pages/AuthCallback.tsx` and
`App.tsx`.

The visible consequence is in the demo: `PADashboardV2.tsx:553` renders an
"Uitloggen" button wired to the shim's `logout: () => Promise.resolve()`, so a
visitor on the public site clicks it and nothing happens.

This is **pre-existing** — the vendored shell did the same — so it is not a branch
regression. But this branch is the one that wrote down "what a host supplies" as a
typed contract, and the contract names five seams where the code needs six. Note
the asymmetry with the assistant dock: `demo-overrides.css` went to real trouble to
hide that toggle because it was a _one-way trap_. The logout button is the merely
dead case nobody looked at.

---

## 4. Duplication the branch did not reach

The branch removed the fork and consolidated the section-id grammar into
`PaSectionsRouter`. These survived:

- **`packages/pa-demo/src/index.css:17-41` is byte-identical to
  `packages/frontend/src/index.css:1-25`** — same `@tailwind` triple, same
  five-property `:root` brand block, same `body`/`code` rules. The copy is
  deliberate and documented; nothing keeps the contents in step. The same five
  brand colours appear twice more as Tailwind fallbacks in each app's
  `tailwind.config.js`. One fact, four hand-maintained copies, no test.
- **The two `configurePaCockpit` auth adapters have already diverged** —
  `packages/frontend/src/pages/pa-cockpit-host.tsx:27` uses
  `!!keycloak.authenticated` where `packages/pa-demo/src/demo/pa-cockpit-host.tsx:43`
  uses `keycloak.authenticated`, and their `updateToken` differ on `minValidity ?? 0`
  vs `minValidity`. Both benign today. Only the frontend's adapter has a test —
  the demo has no `pa-cockpit-host.test.ts` beyond the mode-narrowing pin added by
  the final fix wave.
- **`.v2-changelog-btn`** — 14 identical declarations plus `:hover` /
  `:focus-visible` in `dashboard-v2.css` and `dashboard-pa.css`, differing only in
  scope prefix.
- **`.v2-no-access*`** — four class names, two independently-maintained rule sets,
  already diverged (`--v2-*` vs `--pac-*` tokens, `520px` vs `60ch`).

---

## 5. Dead dependencies in `packages/pa-demo`

> **Done** in `2381f32`. Kept here for the reasoning.

`axios`, `react-markdown`, `remark-gfm` and `rehype-sanitize` are declared but have
**zero importers** anywhere under `packages/pa-demo/`. They existed for the
vendored tree; `@ronl/pa-cockpit` declares all four itself. The deletion checklist
covered the tree and its machinery, not the tree's dependency footprint.

---

## 6. Node version floor vs the `pathToFileURL` `windows` option

> **Done** in `2381f32`. Kept here for the reasoning.

`88f7906` fixed a Windows bug where the bundle gate silently no-opped, using
`pathToFileURL(argv1, { windows })`. That option needs **Node ≥20.13**, while root
`package.json` declares `engines: { "node": ">=20.0.0" }`.

CI is unaffected — `node-version: '20'` resolves to the latest 20.x. The gap is a
developer on 20.0–20.12, who would see the _test_ fail rather than the gate
silently pass: loud, and in the safe direction. Tightening `engines` to `>=20.13.0`
is the fix, but it is a repo-wide decision.

---

## 7. Two guards with known blind spots

Both are recorded rather than open bugs — each was assessed and deliberately left.

- **The Tailwind guard** (`packages/pa-cockpit/src/no-tailwind.test.ts`) cannot see
  template-literal `className={…}` expressions. Deliberately not closed: widening
  the regex to read JSX expression containers risks reintroducing the over-matching
  that once reported six Tailwind-using files here when the true answer was two.
  Failure mode is unstyled UI on future drift, not data exposure.
- **`v2-main-pad`** is asserted by two package doc comments
  (`CuratieSpecSection.tsx:7`, `NotificatiesSection.tsx:9`) to be supplied by the
  router. It is in fact **inert in both PA hosts**: the frontend's only definitions
  are `.cwd-v2 .v2-main-pad`, and the PA shell renders under `.pac`, never nested in
  `.cwd-v2`. The real padding comes from `.pac .pac-main-pad`. A no-op convention
  maintained across three workspaces, with two comments claiming it does something.
  Correct the comments or drop the class.

---

## 8. Test-mock hygiene in `packages/frontend`

> **Done** in `2381f32`. Kept here for the reasoning. Note the same hazard
> recurred immediately: `PaCockpitRoute.test.tsx`, added on the very next branch,
> uses `importOriginal` but not `expectMockNamesRealExports` — see item 13.

`packages/frontend/src/components/PADashboardV2/PASectionRouter.test.tsx` mocks
`@ronl/pa-cockpit` with neither `importOriginal` nor `expectMockNamesRealExports` —
the helper the package ships on `./test-utils` for exactly this hazard.
`packages/pa-demo/src/demo/DemoSectionRouter.test.tsx` uses both. One host uses the
facility the package added; the other, mocking the same entry, does not. A future
value import from the package would silently become `undefined` rather than failing
loudly.

---

## 9. Three frontend test files fail intermittently under parallelism

`IouGebruiksscenarioSection.test.tsx`, `Portfolio.test.tsx` and
`SimMissedPanel.test.tsx` fail between one and seven times per run of
`npm test --workspace=@ronl/frontend`, varying run to run. With
`--no-file-parallelism` the workspace is stable at 836/836.

**Verified pre-existing**, not caused by any of this work: the changes were
stashed, the baseline re-run reproduced the same signature in the same files, and
the stash was restored.

**The cause is not the trap this repo already knows about.** None of the three
uses `performance.now`, fake timers, `localStorage` or `sessionStorage` — so this
is not the wall-clock contention that `*.perf.test.ts` and `ChangelogPanel`'s
raised timeout already address. Something else is shared between them, and it has
not been identified.

Worth finding rather than masking. Serial execution would hide it, and CI runs
parallel — so CI is where it will eventually surface, on a gating suite. Likely
candidates in rough order: module-level state that survives Vitest's per-file
isolation, an unisolated temp directory, or a fixture all three mutate.

Note the deliberate choice not to disable parallelism globally, and the reasoning
behind it, now recorded as a standing rule in `~/.claude/CLAUDE.md`.

---

## 10. The protocol guard is blind to test files, and `/auth` is a loose needle

`packages/pa-cockpit/src/no-host-protocol.test.ts` walks `src` but filters
`!/\.test\.tsx?$/`. Excluding tests is defensible — a test may legitimately need
a literal to assert against — but nothing records it as a decision, and it is
exactly where dead contract fixtures accumulate.

Separately, `'/auth'` was deliberately made quote-agnostic in `f17682d` so that
`navigate("/auth")` could not slip past. The cost is that it is now a bare
substring: any future `api/auth`, `oauth/…` or similar would trip it. Currently
green, no comment warns about it.

## 11. The demo shim keeps three members nobody reads

`packages/pa-demo/src/demo/shims/keycloak.ts` lost `logout` because it existed
only to satisfy a contract member that no longer exists. `login`, `tokenParsed`
and `isTokenExpired` are in the same object with **zero consumers** anywhere in
`packages/pa-demo/src` — `keycloak.test.ts` exercises only `getUser` and
`setDemoRoles`. The file's rewritten header now names the three members the
adapter actually uses, which makes the three extra ones read as an oversight
rather than a decision.

## 12. The seam's render rule is pinned by tests, not by types

`onLogout` now guards on `keycloak.authenticated` like three of its four sibling
dashboards, so the "moved, not invented" claim in its header is literally true.
What remains: `onLogin`'s _absence_ is typed (`onLogin?:`), but the **render rule**
it drives is not — nothing in the type system says "no callback means no control".
Two tests pin it, which is what the whole-branch review demanded, but a host could
still supply `onLogin` and separately hide the button by other means without the
compiler noticing. Recorded as a known limit of the approach, not a defect.

## 13. `PaCockpitRoute.test.tsx` uses half the mock-hygiene pattern

It spreads `importOriginal` for its three mocks but does not call
`expectMockNamesRealExports`, the assertion half of the helper the package ships
on `@ronl/pa-cockpit/test-utils`. Item 8 fixed exactly this in
`PASectionRouter.test.tsx`; this file was added on the same branch and repeated
half of it. Cheap to close.

---

## Not follow-ups — resolved, recorded so they are not re-raised

- **`packages/public-site`'s build failing locally** is not a defect. Its prerender
  fetches `/processen` through the backend from LDE, which indexes Operaton. Running
  `npm run build` uses `--mode production`, which targets the deployed
  `api.open-regels.nl`. Verified identical at the branch base and at HEAD.
- **The PROD backend 404 on `/v1/public/processen`** is the known `acc → main` gap —
  the route landed 2026-08-06 in `9d346df`, and `main` is ~386 commits behind. It has
  a real consequence for the PROD release: `azure-publicsite-prod.yml:49` runs
  `build:prod`, which runs that same prerender, so **public-site cannot deploy to
  PROD until the backend is deployed there first.** Backend, then public-site.
- **`packages/pa-demo/scripts/check-drift.mjs`'s Windows bug** was reported against
  `acc` and is real there. This branch deletes the file, so it needs no fix. The same
  idiom in the two `check-bundle.mjs` files _was_ fixed, in `88f7906`.

---

---
