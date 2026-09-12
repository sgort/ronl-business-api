# `@ronl/shared`

Types and constant data that the backend and the frontends must never author
separately. The RIP phase→process-key map, the PA dossier seed, the Operaton and
auth type declarations.

## There is no `test` script here, deliberately

Every other workspace has a test runner and is held to a **per-file 80% branch
floor** ([#80](https://github.com/sgort/ronl-business-api/issues/80)). This one
has neither, and that is a decision rather than an omission
([#84](https://github.com/sgort/ronl-business-api/issues/84)).

**The package contains no executable logic**: no functions, no `if`, no
`switch`, no loops. Today that is 11 files and ~1,500 lines of type declarations
and constant arrays. A test runner over that would measure an empty set and
report a green check that means nothing — the same false comfort the coverage
floor exists to remove.

So instead of measuring the logic, the package is kept free of it, and
`npm run check-shared` enforces that:

```
check-shared-declarations: 11 file(s) in packages/shared/src/ — declarations and constant data only.
```

It runs in the `audit` job, which has no `paths:` filter and is a required
check, so every pull request reaches it.

## Why this matters more than it sounds

A function placed here is not _under-tested_. It is **outside the measurement
entirely** — no run fails, no reviewer sees a number move, and the first hint is
someone wondering later why coverage dropped in the package that had to
re-implement it.

That is not hypothetical. **v2026.09.4 moved a branching label helper out of
this package** for exactly this reason. The helper was correct; its branches
were simply never counted, and a passing test run concealed that.

This package is the natural home for anything both frontend and backend need,
which is precisely why the rule needs a check rather than a convention.

## If you were about to add a function here

Put it in the package that uses it. If both frontend and backend need it, it
belongs in whichever one owns the behaviour — duplicating a few lines is
cheaper than moving branching logic somewhere nothing measures it.

If the package genuinely needs runtime logic, that is a deliberate change and
the documented fallback, not a workaround:

1. Give it a Vitest runner with the same per-file `branches: 80` floor.
2. Wire that suite into the workflows that already carry `packages/shared/**` in
   their `paths:` filter — the way `pa-cockpit`'s suite was added to the
   frontend workflows.
3. Delete `scripts/check-shared-declarations.mjs` and its npm script, and this
   section with them.

Do all three or none. Deleting the check without adding the runner removes the
only thing standing between this package and unmeasured logic.

## Build

`tsc` to `dist/`, consumed by the other workspaces through the workspace
protocol. `npm run build --workspace=@ronl/shared` — the backend and frontend
builds do this for you.
