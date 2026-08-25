# De-vendoring the PA Cockpit — design

**Goal:** delete `packages/pa-demo/src/vendor/` and the drift machinery that
polices it, by moving the 39 duplicated files into a real workspace package
that `packages/frontend` and `packages/pa-demo` both import.

**Status:** design approved for the changelog seam and the modes seam. Every
other decision below was made while writing this document and is flagged as
such — see "Decisions taken without a separate approval round".

**Sequencing:** this is the step agreed before production. Extract → user
acceptance on ACC → PROD.

---

## 1. Why the vendored fork has to go

`packages/pa-demo` currently carries a byte-identical copy of 39 files from
`packages/frontend/src`, kept honest by a manifest, a sync script, a byte-level
drift checker, a blocking CI step and a reporting-only drift workflow. It was
the right call when the demo was speculative: it shipped without touching the
production caseworker app at all.

It is now the wrong call, for a reason that showed up in the last release
rather than in the abstract. Two of the 39 are `pages/changelog-data.ts` and
`pages/ChangelogPanel.tsx`, so _every_ release makes the mirror stale, and
`/bump-release` had to grow a "Vendored-copy re-sync" step that fires on every
release whether or not the demo changed. That is the fork billing its cost to
work that has nothing to do with it.

The dual maintenance is real but secondary. The primary argument is that the
fork's correctness now depends on rules a person has to remember.

---

## 2. What the measurement says

The coupling is far smaller than the file count suggests. Measured against the
manifest, everything the 39 files import from outside themselves falls into
two categories:

**npm packages** — `react`, `react-router-dom`, `axios`, `react-markdown`,
`remark-gfm`, `rehype-sanitize`, `@ronl/shared`. Ordinary dependencies.

**Five relative specifiers that leave the set** — and these five are exactly
the five files `packages/pa-demo` already overlays:

| Specifier                                  | Imported by                                    | Real (frontend)                          | Demo (pa-demo)                 |
| ------------------------------------------ | ---------------------------------------------- | ---------------------------------------- | ------------------------------ |
| `services/keycloak`                        | `pa.api`, `dossierbeheer.api`, `PADashboardV2` | real Keycloak                            | synthetic token                |
| `services/tenant`                          | `PADashboardV2`                                | fetches `tenants.json`                   | hard-coded Flevoland           |
| `components/PADashboardV2/PASectionRouter` | `PADashboardV2`                                | routes to 6 CaseworkerDashboard sections | `DemoSectionRouter`, 9 curated |
| `components/PADashboardV2/PADock`          | `PADashboardV2`                                | `McpChatSection` → MCP/LLM               | `null`                         |
| `components/SessionExpiryWarning`          | `PADashboardV2`                                | real                                     | `null`                         |

That symmetry is the design. The overlay files are not a workaround for
vendoring — they are the host contract, discovered empirically. Extraction
means writing it down as a type.

Two further seams are not host swaps but content narrowing, and are the ones
that make this non-trivial: `modes.config` (§4) and `changelog-data` (§3).

---

## 3. The changelog seam — injected, not moved

`ChangelogPanel.tsx` has five importers. The cockpit shell is only one:

```
pages/PADashboardV2.tsx:56        ← the cockpit, renders it at :449
pages/CaseworkerDashboardV2.tsx:52
pages/InfraBoardDashboard.tsx:37
pages/WooDashboard.tsx:39
pages/LoginChoice.tsx:4
```

It is app-wide chrome that the cockpit happens to use, not cockpit code. It is
in the vendored 39 for one mechanical reason: `PADashboardV2.tsx` imports it,
which drags `changelog-data.ts` along transitively.

**Decision: both files stay in `packages/frontend`. The cockpit receives the
panel as an injected component.**

Rejected alternatives: moving them into the cockpit package inverts the
dependency (the caseworker app would import its changelog from the cockpit);
a separate `@ronl/changelog` package adds an owner for two files; leaving
pa-demo vendoring just these two keeps the drift machinery alive for 2 of 39,
which fails the goal.

This also **dissolves an alias**. Today `packages/pa-demo/vite.config.ts`
redirects `./changelog-data` to `changelog-data.filtered.ts` — a curated
executive summary, because the real file is the engineering diary and would
both leak internal detail and trip `scripts/check-bundle.mjs`. With the panel
injected, pa-demo simply passes its own panel bound to curated data. No alias,
no `tsc`/Vite disagreement, and `changelog-data.filtered.exports.test.ts` — a
parity guard that exists only to catch that disagreement — gets deleted rather
than ported.

---

## 4. The modes seam — a required prop, not an alias

### Why the current mechanism cannot survive

`modes.filtered.ts` works by aliasing four _relative_ spellings of
`./modes.config` (from `public-affairs-v2/`, from `pages/`, from
`components/PADashboardV2/`, from `dossierbeheer/`). Once these files live in a
package those imports are internal to the package, where a host-side alias no
longer reliably reaches them, and a future internal file importing by a fifth
spelling escapes the filter silently.

It also depends on `tsc` and Vite deliberately disagreeing about where
`./modes.config` resolves. That divergence is the reason
`modes.filtered.exports.test.ts` exists: a name present on the origin but
missing from the filtered module becomes `undefined` at runtime with no type
error.

The stakes are not cosmetic. `sections.allow.ts` is deny-by-default, and what
it drops — the four IOU sections and Hulpmiddelen — are precisely the sections
carrying the six `../CaseworkerDashboard/*` imports. A silent filter failure
puts them on a public unauthenticated site, where they render blank at best.

### The injection surface is two files

Only two files in the package import `modes.config` for _values_:

- `pages/PADashboardV2.tsx:44` — `PA_MODES`, `SORT_SECTION_IDS`, `isPaItemVisible`
- `components/PADashboardV2/PACommandPalette.tsx:15` — `allStaticSections`, `findPaModeForSection`

Every other importer (`Issuekaart`, `FeitenCijfers`, `Monitoring`,
`Dossierbeheer`, `PASectionRouter`) takes `type PaModeId` only, which erases at
compile time and needs nothing.

### Decision

**The cockpit root takes `modes: PaModeConfig[]` as a required value and
publishes it through a context that derives `allStaticSections()` and
`findPaModeForSection()` from that set.** `PACommandPalette` reads the context
instead of importing the module.

The package still exports the real `PA_MODES` and the pure helpers as data —
importing them simply becomes the host's explicit choice rather than something
buried three levels down. `packages/frontend` passes `PA_MODES`;
`packages/pa-demo` passes the allow-list-filtered set. `sections.allow.ts`
stays in pa-demo, where the policy belongs; the shared package never learns
what a public site is.

**Required, never defaulted.** A default of "the full set" would mean a future
refactor that drops the value silently reopens IOU and Hulpmiddelen. Required
makes the compiler stop you, which is the guarantee the alias could never
offer.

Two properties fall out. `tsc` and Vite agree again, so
`modes.filtered.exports.test.ts` is deleted rather than ported. And because the
palette derives from the same injected data the rail renders, ⌘K cannot
diverge from the rail — a structural guarantee replacing today's "filter at the
module, not the router" convention, which is the exact subtlety that was missed
once already during the demo's construction.

Rejected: aliasing the package's internal specifiers instead (works today,
keeps the hack, keeps the parity test, still one new spelling from leaking);
and shipping a `@ronl/pa-cockpit/restricted` entry point (puts public-site
policy inside the shared package and makes the caseworker app carry an
allow-list it never uses).

---

## 5. The host contract

Two mechanisms, chosen by what each seam actually is.

**React seams — one required `host` prop on the cockpit root.**

```ts
export interface PaCockpitHost {
  modes: PaModeConfig[];
  SectionRouter: ComponentType<PaSectionRouterProps>;
  Dock: ComponentType<PaDockProps>;
  SessionExpiryWarning: ComponentType;
  ChangelogPanel: ComponentType<{ isOpen: boolean; onClose: () => void }>;
}
```

One object rather than five separate props, so "what a host must supply" is a
single named type readable in one place — and adding a seam later is a type
error in both hosts rather than a silent default in one.

**Service seams — `configurePaCockpit({ auth, tenant })`, called once at
startup.**

`services/keycloak` and `services/tenant` are consumed at module scope by
`pa.api.ts` and `dossierbeheer.api.ts`, which are not React and cannot read
context. A module-level registration set once before render is correct here
precisely because token lookup is not reactive — the value is read at call
time, not rendered.

This split is deliberate and the reasoning is worth keeping: module-global
state feeding _React components_ is the anti-pattern that produced the
`DemoRoleContext` defect during the demo build, where `setDemoRoles()` mutated
module state that a snapshot in `PADashboardV2`'s mount effect never saw. So
components get props and context; non-React service lookups get module
registration. Neither mechanism is used for the other's job.

---

## 6. Package shape

**Name and location:** `@ronl/pa-cockpit` at `packages/pa-cockpit`.

**Version pinned at `1.0.0`**, matching `@ronl/shared`. The package is never
deployed on its own; it is compiled into two apps that carry their own CalVer.
Giving it an independent version would invite `/bump-release` to bump something
no environment runs.

**Ships TypeScript source, not a build.** `@ronl/shared` compiles to CommonJS
because a Node consumer (the backend) needs it, and both Vite apps pay for that
with `optimizeDeps.include` and `commonjsOptions` workarounds. `@ronl/pa-cockpit`
is browser-only with two Vite consumers using the same React plugin, so
`exports` points at `src/`. This avoids a build step, the CJS/ESM interop, and
the question of how CSS survives `tsc`. Each host's `tsconfig` must include the
package's sources; the package keeps its own `type-check` script.

**CSS:** the package ships `dashboard-pa.css` and `dossierbeheer.css` behind a
single `@ronl/pa-cockpit/styles.css` entry that also carries the minimal global
rules the cockpit depends on. `index.css` stays in `packages/frontend` — like
`ChangelogPanel`, it is app chrome (Tailwind entry plus resets), not cockpit
code.

**Tailwind: the package should carry none.** Measured across the 39, exactly
two files use Tailwind utility classes — `ChangelogPanel.tsx` (58 occurrences)
and `NotificationsPanel.tsx` (19). Everything else styles through the
project's own `pac-*` classes. (An earlier loose grep put this at six; it was
matching bare `flex` and `grid` _inside_ `pac-*` class strings. Two is the
measured figure.)

`ChangelogPanel` stays in `packages/frontend` under §3, which leaves exactly
**one** Tailwind-dependent file in the extracted package.

**Decision: convert `NotificationsPanel.tsx`'s 19 utility classes to `pac-*`
rules in the package's own stylesheet, and let `@ronl/pa-cockpit` declare no
Tailwind dependency at all.** For one file this is cheap, and it removes an
entire failure mode: otherwise both hosts must add `packages/pa-cockpit/src/**`
to their `tailwind.config.js` `content` globs, and a host that forgets gets
silently purged classes — exactly the "unstyled box" symptom the demo hit once
already, with no build error to explain it.

The alternative — keep Tailwind and document the content glob — is viable and
smaller, but it makes a shared package's rendering depend on configuration in
every consumer, forever, to save converting nineteen class names once.

---

## 7. Tests

34 test files live in the affected directories, carrying 354 tests (measured,
not estimated). **32 move with their subjects**; two stay in
`packages/frontend` because their subjects stay: `ChangelogPanel.test.tsx`
(§3) and `PASectionRouter.test.tsx` (a host seam, §5).

The package gets its own Vitest config and its own coverage reporting. Coverage
for these files currently lands in the frontend's numbers and is excluded from
pa-demo's on purpose; after the move it belongs to the package.

Two test files change rather than move: `PACommandPalette.test.tsx` and
`notificaties-nav.test.ts` import `modes.config` directly today and need the
provider wrapper from §4.

The testing documentation under `iou-architectuur` reports per-package figures
and will be wrong the moment this lands. It is already known to be stale on a
separate count, so it needs a re-measure pass either way — the plan should
schedule one rather than hand-patch the numbers.

---

## 8. What gets deleted

The point of the exercise, stated as a checklist so it can be verified rather
than assumed:

- `packages/pa-demo/src/vendor/` — all 39 vendored files, the 5 re-export overlay
  files planted at the seam paths, and `src/vendor/README.md`
- `packages/pa-demo/scripts/vendor-manifest.mjs`, `vendor-sync.mjs`, `check-drift.mjs`
- the `vendor:sync` / `vendor:check` scripts in `packages/pa-demo/package.json` and at the repo root
- `.github/workflows/pa-demo-drift.yml`
- the "Vendored copy matches packages/frontend" step in `azure-pa-demo-acc.yml`
- `packages/pa-demo/src/demo/modes.filtered.ts`, and both
  `*.filtered.exports.test.ts` parity guards — those exist solely to catch the
  `tsc`/Vite resolution split, which stops existing
- the two `resolve.alias` entries in `packages/pa-demo/vite.config.ts` — the two
  entries only, not the file. By the time this lands, `vite.config.ts` is also
  expected to carry a `transformIndexHtml` plugin rewriting the social card's
  origin per build mode (see `docs/pa-demo-social-handoff/`, shipped ahead of
  this work). Removing the aliases must not tidy that away with them.
- the **"Vendored-copy re-sync"** section of `.claude/commands/bump-release.md`, and the accompanying carve-out in its scope cross-check

`packages/pa-demo/src/demo/sections.allow.ts` **survives** — it is the policy,
and §4 keeps it in pa-demo. `changelog-data.filtered.ts` survives too, now as
plain data passed to an injected panel rather than an alias target. So does
`modes.filtered.test.ts`, which tests the _filtering behaviour_ rather than the
alias: pa-demo still narrows the mode set, so that test is retargeted at
whatever §4's filter helper is called, not deleted. Only the two
`*.exports.test.ts` parity guards go.

`scripts/check-bundle.mjs` survives unchanged: it scans the built bundle for
forbidden strings, which is orthogonal to where the sources live.

---

## 9. CI and release scoping

`packages/pa-cockpit` is not deployed, but a change to it must rebuild **both**
apps. Add `packages/pa-cockpit/**` to the path filters of
`azure-frontend-acc.yml`, `azure-frontend-prod.yml`, `azure-pa-demo-acc.yml`
and `azure-pa-demo-prod.yml`.

**No new `ScopeTag`.** A `packages/pa-cockpit/**` change is expressed as
`['frontend', 'pa-demo']`, exactly mirroring the existing rule that
`packages/shared/**` is expressed as `['frontend', 'backend']`. `/bump-release`
needs one line added to its touched-dirs map and nothing else — and it _loses_
the re-sync section from §8, so the command gets shorter, not longer.

---

## 10. Risk, and how the work is ordered

The real risk is not the demo. It is that this moves 39 files out of
`packages/frontend`, the production caseworker app, immediately before its
production release. A regression here is a regression in the product, not in a
showcase.

Two things contain it. The moved files are moved, not rewritten — the only
edits are the seam changes in §4 and §5, which touch `PADashboardV2.tsx` and
`PACommandPalette.tsx` and nothing else. And the 354 tests move with their
subjects, so the suite that proves the cockpit works is the same suite before
and after.

The verification that matters is therefore: the frontend suite and the cockpit
package suite together account for the same tests as before, and
`acc.plato.open-regels.nl` still passes its 10 E2E tests against a build with
no `src/vendor/` in it.

---

## Decisions taken without a separate approval round

Approved in conversation: §3 (changelog injected) and §4 (modes as a required
prop).

Decided while writing, and open to reversal at review:

1. **§5** — one `host` object prop for React seams, `configurePaCockpit()` for
   the two non-React services.
2. **§6** — `1.0.0` pinned; ships source rather than a build; `index.css` stays
   in frontend; Tailwind content globs are a host responsibility.
3. **§7** — 32 test files move, 2 stay.
4. **§9** — no new `ScopeTag`; `packages/pa-cockpit/**` maps to
   `['frontend', 'pa-demo']`.
