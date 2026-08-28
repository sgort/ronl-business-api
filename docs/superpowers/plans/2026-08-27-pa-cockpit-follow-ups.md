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

> **Done.** R3b and R5 added to
> `packages/pa-cockpit/src/modes/no-module-scope-modes.test.ts`, both
> mutation-proven against the exploit and green with no false positives on the
> real tree. No `ts.TypeChecker`, no new dependency.
>
> **R3b** refuses the R3 excuse for any file that _declares_ a binding named
> `usePaModes` — function, `const`/`let`, parameter, binding element, named
> function expression or class — skipping `ImportDeclaration` subtrees, since
> the import specifier is the one sanctioned binding of that name. Scope is
> deliberately ignored: deciding whether a _particular_ decoy reaches a
> _particular_ call site is the question that would need a TypeChecker;
> refusing the excuse for the whole file needs only the tree and is the safe
> answer wherever the two differ.
>
> **R5** forbids a dynamic `import('…/modes.config')` in every file, allow-list
> included — a plain text accusation covering the delivery half.
>
> Three probes, each isolating one rule, each reverted and confirmed by
> `git status`:
>
> | Probe                                            | Result                       |
> | ------------------------------------------------ | ---------------------------- |
> | Inner-scope decoy + real import (the R3 exploit) | red — R3b, names unexplained |
> | Dynamic import, no guarded identifier anywhere   | red — R5                     |
> | Both halves in one file                          | red — both rules, separately |
>
> Kept as two rules rather than one because they fail in different directions:
> R3b could in principle produce a false positive (a file legitimately importing
> the hook that also binds the name for an unrelated reason — none exists, and
> the cost is a rename); R5 cannot.

---

<details>
<summary>Original entry</summary>

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

</details>

---

## 2. A surface pass over `packages/pa-cockpit/src/index.ts`

> **Done.** Surface narrowed by three, and the type half of the pin made real.
>
> **Removed** — `isPaItemVisible`, `PaGateContext`, `OrgTypeGate`. The first two
> are live package-internal code (PADashboardV2 builds the gate context and
> applies it when rendering the rail) that no host can call, because a host never
> sees a `PaRailItem` un-gated. `OrgTypeGate` had zero consumers of _this_ copy:
> `CaseworkerDashboardV2.tsx` imports the character-identical union from its own
> `pages/caseworker-v2/modes.config.ts:18`. All three stay exported from
> `modes.config` for internal use; re-adding one is a line, now caught by the pin.
>
> **Kept, with the reason recorded in the file** — the audit found five more type
> exports with no host consumer, and stopping at "zero consumers, delete it" would
> have been wrong for four of them. `PaModeId`, `PaRailItem` and `PaRailGroup` are
> the field types of `PaModeConfig`, which pa-demo _does_ consume; exporting a
> value while withholding the types needed to hold it is precisely what produces a
> host-side re-declaration — which is how the two `OrgTypeGate` declarations
> happened in the first place. `PaCockpitAuth`, `PaCockpitTenant` and
> `PaCockpitServices` are the parameter and return types of exported functions.
>
> **Recorded, not changed** — `getPaCockpitAuth` / `getPaCockpitTenant` /
> `SORT_SECTION_IDS` have only a test as their consumer. Each is the read side of
> something a host writes, and a host that could not read it back could not test
> its own wiring. `isPaMock` is the same shape and already carried that reasoning.
> Noted in `index.ts` so the next audit does not read them as dead.
>
> **The type pin.** `index.test.ts` listed the type exports in a `void`ed array as
> documentation, so that half of the contract was exactly as unwatched as the whole
> surface had been before the file existed. It now parses `index.ts` with the
> TypeScript AST — the same parse-don't-scan choice, for the same reasons, as
> `no-module-scope-modes.test.ts` — and asserts the type names, catching both
> spellings (`export type { X }` and `export { type X }`). Four probes, each
> isolating one name:
>
> | Probe                                  | Result                 |
> | -------------------------------------- | ---------------------- |
> | Type export added                      | red — `+PaGateContext` |
> | Type export removed                    | red — `−PaRailGroup`   |
> | Inline `export { type X }` spelling    | red — `+OrgTypeGate`   |
> | Value export removed (older assertion) | red — `−isPaMock`      |
>
> pa-cockpit 368/368, frontend 839/839, pa-demo 97/97, public-site 140/140.

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

> **Done.** Three of the four listed duplications are required copies, not decay.
> `packages/pa-demo` never imports `dashboard-v2.css` — `CaseworkerDashboardV2.tsx:55`
> is its only importer anywhere — so `@ronl/pa-cockpit` must carry its own rule for
> every `v2-*` class it renders, or the demo renders unstyled. The copies are the
> price of the package being standalone-renderable, which is the demo's whole
> premise.
>
> The fourth — the two `configurePaCockpit` auth adapters — was not duplication at
> all. The two differences are each correct for their side: keycloak-js types
> `authenticated?: boolean` and requires a `number` from `updateToken`, while the
> demo's shim is already boolean and takes an optional parameter. The real gap was
> that only the frontend's adapter had a test.
>
> A fifth item turned up during design that the entry above never listed:
> `PACommandPalette.tsx:6-7` claimed it reused `.cwd-v2-palette*` styles. It renders
> only `pac-palette*` classes, all defined in dashboard-pa.css's "Command palette
> (⌘K)" block — same defect class as the `v2-main-pad` comments corrected in
> item 7, and worse in effect, since it implied `pa-demo` depends on a
> stylesheet it never loads.
>
> Three alternatives were considered and rejected, one line each: a shared
> `brand.css` reverses the decision written at `pa-demo/src/index.css:1-16` that
> app-shell CSS stays per-app; a shared token module couples the ESM
> `tailwind.config.js` files to a CommonJS `@ronl/shared` build for five constants
> that never change; consolidating the CSS makes the caseworker dashboard take its
> chrome from the PA cockpit package.
>
> Three guards landed:
>
> - **Guard A** (`781afe4`) — the five brand colours pinned across all four files
>   that spell them, `packages/pa-demo/src/brand-colours.test.ts`, 2 tests.
> - **Guard B** (`b8c9f97`) — every `v2-*` class a package component renders must
>   have a rule in both stylesheets,
>   `packages/frontend/src/pa-cockpit-class-coverage.test.ts`. It deliberately does
>   not assert value equality: `.v2-no-access*` has already diverged on purpose,
>   and a guard enforcing equality would be red against a decision already made and
>   get deleted rather than fixed.
> - **Guard C** (`883af09`) — the demo's auth adapter pinned,
>   `packages/pa-demo/src/demo/pa-cockpit-host.auth.test.ts`, 4 tests.
>
> | Probe                                                                         | Result                                         |
> | ----------------------------------------------------------------------------- | ---------------------------------------------- |
> | A brand colour edited in any of the four files it appears in                  | red — Guard A                                  |
> | A `v2-*` class rendered by a package component with no rule in one stylesheet | red — Guard B                                  |
> | A `configurePaCockpit` auth-adapter difference changed                        | red — Guard C                                  |
> | `.pac .v2-no-access`'s `max-width` changed                                    | green — Guard B does not assert value equality |
> | A class name spelled inside a CSS comment                                     | green — `definesClass` excludes comments       |
>
> The last row is the sequencing lesson worth keeping: Guard B's review returned
> zero Critical and zero Important findings, and one Minor — that `definesClass`
> matched raw CSS text without excluding comments, harmless because no such comment
> existed yet. The comment corrections that closed the fifth item above then
> created one. Had the two landed in the other order, that correction would have
> silently disarmed part of Guard B. The fix landed first (`09b9c78`), the comment
> corrections after (`8350041`).

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

> **Closed.** The Tailwind bullet was always a decision, not a task. The
> `v2-main-pad` thread is now resolved by correcting the comments — the option
> the entry offered first, and the right one once the class turned out to be
> live elsewhere.
>
> The claim was wrong twice over: it named `PASectionRouter` (the _host's_
> component) when the wrapper is emitted by the package's own
> `PaSectionsRouter.tsx:140` after de-vendoring, and it implied the wrapper
> supplies padding when it supplies none.
>
> Inertness is provable from the CSS, no browser needed: `.cwd-v2 .v2-main-pad`
> (`caseworker-v2/dashboard-v2.css:436`) is the only rule anywhere, in a
> stylesheet imported by `CaseworkerDashboardV2.tsx` alone. In pa-demo the rule
> is not in the bundle at all; in the frontend it is present but unreachable,
> since PA renders under `.pac` — which `PADashboardV2.tsx:6` says exists
> precisely so it cannot collide with `.cwd-v2`. The visible padding is
> `.pac .pac-main-pad`, in dashboard-pa.css's "Main content area" block, on
> the shell's own `<main>` wrapper at `PADashboardV2.tsx:614`, a single rule
> with no child selectors.
>
> **The class stays.** Dropping it would mean editing ten sites across three
> workspaces for no functional gain, and it is genuinely live in the `.cwd-v2`
> family — the frontend's `PASectionRouter` and pa-demo's `DemoSectionRouter`
> spell their section wrappers the same way and make no claim about it.
> Removing it from one of the three would leave the convention inconsistent
> rather than absent. The authoritative explanation now sits beside the wrapper
> in `PaSectionsRouter.tsx`, with both section files pointing at it.

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
  Correct the comments or drop the class. **Done — comments corrected; see the
  note above.**

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

## 9. Frontend test files fail intermittently under file parallelism

> **Done.** Root cause found, fixed, and verified under the exact load that
> produced it. Commit `194ffaf`.

### What it turned out to be

Not the three files named in the original report, and not shared state. Every
failure carried the same message — `Error: Test timed out in 5000ms` — Vitest's
default, which **none of the four Vitest workspaces had overridden**.

| Condition                         | Result                       |
| --------------------------------- | ---------------------------- |
| Idle machine, full parallelism    | 839/839 green, five runs     |
| Under concurrent load, 5s default | 15 failed, then 16, then 8   |
| Every one of those failures       | `Test timed out in 5000ms`   |
| Same load, `testTimeout: 20000`   | 839/839 green, zero timeouts |

The affected file set tracks machine load rather than any property of the files:
six under the load used to reproduce it (`IouFeedbackSection`,
`IouGebruiksscenarioSection`, `RegelSimulatie`, `Portfolio`, `SimMissedPanel`,
`simEngine`), three under whatever load existed when it was first reported. That
is why it looked random — and why _"what do these three files share?"_ was the
wrong question. The earlier investigation correctly ruled out `performance.now`,
fake timers, `localStorage` and `sessionStorage`, then went looking for a fourth
shared thing that was never there.

It was, as originally suspected, pre-existing rather than caused by this branch —
verified by stashing the changes and reproducing the same signature on baseline.

`packages/pa-cockpit` had the same latent flake, unnoticed, because it had only
ever been run as a load generator for the frontend suite.

### The fix

`testTimeout: 20000` in all four Vitest configs, with the diagnosis in a comment
beside it. jsdom component tests are CPU-bound; a 5s timeout is a hang detector,
not a budget, and on a saturated machine it fires as one. Raising it costs no
coverage — a genuinely hung test still fails, four times slower.

The repo had already reached this conclusion once and applied it to a single
file: `ChangelogPanel.test.tsx` carries `vi.setConfig({ testTimeout: 60000 })`
with the reasoning written out. The general case had simply never been asked.

### What was built around this bug, and whether it still earns its place

Three artefacts were added while the cause was unknown. Reviewed after the fix:

**The `~/.claude/CLAUDE.md` rule — _"a parallel-run failure is not a finding
until it fails in isolation"_. Keep.** It is what made the diagnosis possible,
and it already prescribes the fix that landed: _do not disable parallelism
globally to make the symptom go away; when a suite really is parallelism-
sensitive, fix it at its own boundary — adjust the timeout it actually needs._
Its two companion clauses stand on independent merits: check which runner you are
addressing before reaching for a flag, and do not background a long suite then
read only its tail.

**The five `test:serial` scripts and the root aggregator. Keep — on different
grounds than they were added.** They were introduced to chase this flake. They
are retained because the problem they actually solve is permanent: **two runners
behind one command shape.** `backend` is Jest and wants `--runInBand`; the other
four are Vitest and want `--no-file-parallelism`. Isolating a suspected flake
stays a recurring need, and these few lines remove a trap agents demonstrably
fell into.

**`ChangelogPanel.test.tsx`'s 60s override. Keep.** Genuine slowness, not a
machine artefact — it renders 93 real version cards and took 22s once, so the new
20s global would not cover it. Item 14 is the thing that would actually retire
it, on its own terms rather than by raising a limit.

Net effect: `--no-file-parallelism` and the serial scripts are now **diagnostics
rather than load-bearing**. Serial execution is still the right way to isolate a
suspected flake; it is no longer how the suite is expected to pass.

**Deliberately not corrected.** The Global Constraints blocks in
`2026-08-26-de-vendor-pa-cockpit.md` and `2026-08-27-cockpit-session-seam.md`
still say _"three test files that fail intermittently under file parallelism."_
That was accurate when written and it governed how those plans were executed.
Rewriting an executed plan to match what was learned afterwards turns a record
into fiction — the correction lives here instead.

---

## 10. The protocol guard is blind to test files, and `/auth` is a loose needle

> **Done** — `88150ba`. Both properties are now recorded in
> `no-host-protocol.test.ts` rather than inferred: the test-file exclusion is
> documented as a decision, with the note that dead contract fixtures can
> accumulate there unseen (two were found that way), and the bare `/auth` needle
> carries a comment saying it will also match `api/auth` or `oauth/…` — and to
> sharpen it if a legitimate match ever appears, not weaken it.

`packages/pa-cockpit/src/no-host-protocol.test.ts` walks `src` but filters
`!/\.test\.tsx?$/`. Excluding tests is defensible — a test may legitimately need
a literal to assert against — but nothing records it as a decision, and it is
exactly where dead contract fixtures accumulate.

Separately, `'/auth'` was deliberately made quote-agnostic in `f17682d` so that
`navigate("/auth")` could not slip past. The cost is that it is now a bare
substring: any future `api/auth`, `oauth/…` or similar would trip it. Currently
green, no comment warns about it.

## 11. The demo shim keeps three members nobody reads

> **Done** — `88150ba`. `login`, `tokenParsed` and `isTokenExpired` removed;
> the header now explains that the shim never grew them either.

`packages/pa-demo/src/demo/shims/keycloak.ts` lost `logout` because it existed
only to satisfy a contract member that no longer exists. `login`, `tokenParsed`
and `isTokenExpired` are in the same object with **zero consumers** anywhere in
`packages/pa-demo/src` — `keycloak.test.ts` exercises only `getUser` and
`setDemoRoles`. The file's rewritten header now names the three members the
adapter actually uses, which makes the three extra ones read as an oversight
rather than a decision.

## 12. The seam's render rule is pinned by tests, not by types

> **Recorded limit, not a defect.** No work item unless the approach changes.

`onLogout` now guards on `keycloak.authenticated` like three of its four sibling
dashboards, so the "moved, not invented" claim in its header is literally true.
What remains: `onLogin`'s _absence_ is typed (`onLogin?:`), but the **render rule**
it drives is not — nothing in the type system says "no callback means no control".
Two tests pin it, which is what the whole-branch review demanded, but a host could
still supply `onLogin` and separately hide the button by other means without the
compiler noticing. Recorded as a known limit of the approach, not a defect.

## 13. `PaCockpitRoute.test.tsx` uses half the mock-hygiene pattern

> **Done** — `88150ba`. Both halves of the pattern now used for the first-party
> mocks; `react-router-dom` is deliberately exempt (third-party, stable surface)
> with the reasoning inline.

It spreads `importOriginal` for its three mocks but does not call
`expectMockNamesRealExports`, the assertion half of the helper the package ships
on `@ronl/pa-cockpit/test-utils`. Item 8 fixed exactly this in
`PASectionRouter.test.tsx`; this file was added on the same branch and repeated
half of it. Cheap to close.

---

## 14. Rotate the changelog out of the app bundle

`packages/frontend/src/pages/changelog-data.ts` is **5,061 lines / 353 KB
carrying 93 releases**, imported by five pages so it lands in the main chunk for
every visitor of a 2.1 MB bundle. **68 of those 93 are pre-CalVer** — the era
before the versioning scheme changed.

The product runs a documentation site, which is the natural home for full
history. There is already a precedent for the split: `packages/pa-demo`'s curated
changelog covers only the CalVer era, and its file comment states the 68
pre-CalVer releases are _"out of scope by design, not merely omitted for space."_
That call was made once already, for the public demo.

Rotating would also retire `ChangelogPanel.test.tsx`'s 60s timeout override on
its own terms rather than by raising a limit — that file is slow because it
renders 93 real version cards, which is a genuine cost rather than a machine
artefact.

**Needs a design pass, not just an implementation.** It touches the release
procedure (`/bump-release` edits this file every release and would grow a
rotation step), the documentation site (someone must build and maintain the
archive page), and a user-facing panel that may serve a sales purpose in-app.
Open questions: how many releases stay, does rotation happen at a version
boundary or a count, and does the panel link out to the archive.

**This does not overlap item 9.** Item 9's timeouts hit six files, none of them
changelog-related; `ChangelogPanel` was not among them precisely because it
already had its override.

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
