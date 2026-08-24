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
