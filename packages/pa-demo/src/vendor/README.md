# Vendored copy — temporary by design

These files are byte-identical copies from `packages/frontend/src`, listed in
`../../scripts/vendor-manifest.mjs`. **Never edit anything in this directory.**
Every adaptation lives in `src/demo/` and is wired up through the alias maps in
`vite.config.ts` and `tsconfig.json`.

They exist because `pa-demo` was built before `@ronl/pa-cockpit` was extracted
from `packages/frontend` — deliberately, so that the extraction's interface
could be designed against a real second consumer rather than guessed at.

**Exit condition:** when `@ronl/pa-cockpit` exists and `pa-demo` depends on it,
delete this directory, `../../scripts/vendor-*.mjs`, `../../scripts/check-drift.*`
and `.github/workflows/pa-demo-drift.yml`. Nothing under `src/demo/` changes.

Re-sync with `npm run vendor:sync --workspace=@ronl/pa-demo`; check for
divergence with `npm run vendor:check --workspace=@ronl/pa-demo`.

## Correction: how the alias map actually works (Task 3)

The line above about "alias maps in `vite.config.ts` and `tsconfig.json`"
overstates what `tsconfig.json` does. In practice **two different mechanisms**
resolve the six imports the vendored tree reaches outside itself with —
`../services/keycloak`, `./keycloak`, `../services/tenant`,
`../components/SessionExpiryWarning`, `../components/PADashboardV2/PADock`,
`../components/PADashboardV2/PASectionRouter`, and
`.../public-affairs-v2/modes.config` (four textual forms) — and which
mechanism applies depends on whether the target collides with a real
vendored file.

**Five targets are not vendored files at all** (keycloak, tenant,
SessionExpiryWarning, PADock, PASectionRouter). For these, `tsconfig.json`
has **no `paths` entry and never will**: TypeScript's `paths` only rewrites
non-relative module specifiers, and every one of these imports is relative.
This was verified empirically, not assumed — adding the brief's proposed
`paths` block and re-running `tsc --noEmit` produced byte-identical output,
error-for-error, to having no `paths` at all.

A second approach — ambient wildcard `declare module '*/services/keycloak' {
export { default } from './keycloak'; }` — _does_ resolve the "cannot find
module" errors (wildcard ambient modules match by trailing text regardless
of relative-ness, the same mechanism `declare module '*.svg'` uses). It was
rejected anyway: it silently breaks JSX contextual typing for every callback
prop the redirected component takes. Concretely, `<PASectionRouter
onOpenDossier={(id) => …} onNavigate={(m, s) => …} />` type-checked with `id`,
`m` and `s` all falling back to implicit `any` — caught only because
`noImplicitAny` is on — even though a direct (non-aliased) import of the same
component inferred those parameter types correctly. Reproduced in isolation
before being ruled out.

What actually resolves these five, for both `tsc` and Vite, with no alias
configuration at all: a thin **re-export overlay file physically placed at
the path the real (unvendored) module would occupy** —
`src/vendor/services/keycloak.ts`, `src/vendor/services/tenant.ts`,
`src/vendor/components/SessionExpiryWarning.tsx`,
`src/vendor/components/PADashboardV2/PADock.tsx`,
`src/vendor/components/PADashboardV2/PASectionRouter.tsx` — each just
re-exporting from the matching file in `src/demo/`. Ordinary relative-import
resolution then does all the work; there is nothing left to alias. These five
files are **not** vendored copies of anything (there is no origin to diff
against — PADock and PASectionRouter aren't in `packages/frontend` under
these names either, per the manifest's own exclusion comment) and are
deliberately **not** listed in `scripts/vendor-manifest.mjs`, so
`vendor:sync` never overwrites them and `vendor:check` never flags them as
drift. They carry an `OVERLAY FILE` header comment saying exactly that.
Anyone deleting `src/vendor/` wholesale during the future `@ronl/pa-cockpit`
extraction takes these five with it — that's correct, since `src/demo/`
holds the real implementation they merely re-export.

**The sixth target, `pages/public-affairs-v2/modes.config`, is the one real
collision** — a vendored `modes.config.ts` already occupies that path, so the
overlay-file trick would mean overwriting (i.e. editing) a vendored file,
which is exactly what this directory forbids. That one _is_ handled by a
`resolve.alias` regex in `vite.config.ts`, redirecting the import to
`src/demo/modes.filtered.ts` — but **only for Vite, at runtime**. `tsconfig.json`
has no entry for it either; `tsc` is deliberately left to resolve
`modes.config` to the real vendored file, which it already does unaided. That
is sound rather than an oversight: `src/demo/modes.filtered.ts` re-exports
the same names and types the real `modes.config.ts` does (for now, literally
`export * from '../vendor/pages/public-affairs-v2/modes.config'`; Task 4 will
narrow it to a genuine filter), so type-checking the vendored call sites
against the unfiltered module is a sound proxy for type-checking them against
what actually runs.

**Net result:** `tsconfig.json` carries no alias configuration whatsoever.
Every relative import in the vendored tree resolves through ordinary
module resolution, either to a real overlay file that happens to live at
the expected path (five cases) or to the real vendored file itself
unaided (`modes.config`, whose only redirection is a runtime-only Vite
alias). Confirmed clean with `npm run type-check --workspace=@ronl/pa-demo`
and, separately, with a diagnostic (uncommitted) test that `import()`s
`vendor/pages/PADashboardV2` end-to-end under Vite/Vitest — proving the
same resolution holds at runtime, not just statically under `tsc`.

**Placeholder stubs created by Task 3, to be replaced by later tasks:**
`src/demo/DemoSectionRouter.tsx` (Task 6 — the demo-safe dispatcher) and
`src/demo/modes.filtered.ts` (Task 4 — the actual curated filter). Both
currently exist only so this task's `type-check` and `vendor:check` could be
verified end-to-end; their current contents are not meant to ship.
