# Lazy-load the changelog drawer — design

**Goal:** take the changelog out of the frontend's initial load without changing
what it shows, what ships, or how releases are cut.

This is part 1 of follow-up item 14 from
`docs/superpowers/plans/2026-08-27-pa-cockpit-follow-ups.md`. Part 2 — curating
the history and archiving it to the documentation site — is deliberately split
out; see §7.

---

## 1. The problem, measured

`packages/frontend/src/pages/changelog-data.ts` is **6,217 lines / 432 KB raw,
131 KB gzipped**, carrying 102 releases. The entry that raised this recorded
5,061 lines and 93 releases; it has grown since.

|                       | raw     | gzipped |
| --------------------- | ------- | ------- |
| `changelog-data.ts`   | 432 KB  | 131 KB  |
| the built entry chunk | 2.22 MB | 690 KB  |

So it is roughly **19% of what a visitor downloads**, and the visitor need not be
a visitor at all: `LoginChoice.tsx:160` renders the panel, so someone who has not
authenticated downloads 102 releases of internal engineering diary before they
can log in.

Nothing in `packages/frontend` is code-split today — there is not one
`React.lazy` or dynamic `import()` in the workspace, so every route's code is in
one chunk.

## 2. Why lazy-loading rather than rotation

The original entry proposed rotating pre-CalVer history out to the documentation
site. Measured against the actual numbers, that is the more expensive branch and
the smaller win:

|                           | lazy-load              | rotate history                                         |
| ------------------------- | ---------------------- | ------------------------------------------------------ |
| Removed from initial load | **131 KB — all of it** | ~87 KB, the 68 pre-CalVer releases                     |
| Release procedure         | unchanged              | grows a rotation step, permanently                     |
| Documentation site        | untouched              | two pages (`docs/en/`, `docs/nl/`), maintained forever |
| Data                      | untouched              | split, permanently                                     |

The documentation site is `iou-architectuur`, a separate **bilingual MkDocs**
repository, so an archive is cross-repo work with an ongoing publishing
obligation.

Rotation is not thereby wrong — but its case is about **curation**, not bundle
weight, and lazy-loading answers the bundle argument completely. Those are
different questions and this design settles only the second, so that the first
can be judged on its own merits.

## 3. Architecture

Two files where there is one.

**`ChangelogPanel.tsx`** becomes a shim: same default export, same
`ChangelogPanelProps`, no `changelog-data` import. It gates on `isOpen` and
wraps a `React.lazy` import of the content in `<Suspense>`.

**`ChangelogPanelContent.tsx`** receives the current 562-line implementation
verbatim, together with `ScopeBadge` and the `changelog-data` import.

Unchanged: all five call sites, the `@ronl/pa-cockpit` host seam, the package,
and `changelog-data.ts` itself.

### 3.1 Why the boundary lives in the shim

This is a correctness constraint, not a style preference.

`packages/pa-cockpit/src/pages/PADashboardV2.tsx:516` renders the host's
`ChangelogPanel` through the host contract, and **neither package contains a
Suspense boundary anywhere**. A bare `lazy()` default export would therefore
throw the moment the drawer opened on the PA cockpit route, because a suspending
component with no boundary above it is an error.

The alternative — adding `<Suspense>` inside `PADashboardV2` — would change
package code to accommodate one host's implementation detail, which is precisely
what the host contract exists to prevent. `packages/pa-demo` supplies its own
`DemoChangelogPanel` and must not acquire a Suspense requirement because
`packages/frontend` chose to code-split.

Keeping the boundary inside the shim leaves the seam untouched in both
directions.

### 3.2 The gating is load-bearing

The lazy element must render only when `isOpen` is true:

```tsx
if (!isOpen) return null;
return (
  <Suspense fallback={null}>
    <ChangelogPanelContent isOpen onClose={onClose} />
  </Suspense>
);
```

If the lazy element rendered unconditionally, React would begin resolving the
import on mount and the chunk would download on every page load — the change
would look correct, pass a naive test, and save nothing. This is the specific
way this refactor fails silently, which is why §5's guard asserts it.

The early return also preserves the existing contract exactly: `ChangelogPanel.tsx:57`
is `if (!isOpen) return null;` today, and `ChangelogPanel.test.tsx:37` asserts
the container is empty when closed.

### 3.3 `ScopeBadge` moves with the content

`ChangelogPanel.tsx:434` exports `ScopeBadge`. Checked: its only consumers are
three call sites inside the same file and the test file. **No production code
outside imports it**, so it moves to the content module with everything else and
only the test's import specifier changes.

This is worth stating because it looks like a blocker and is not: a shim cannot
statically re-export a symbol from a lazily-loaded module without pulling that
module back into the eager graph, which would defeat the split. That problem
does not arise here only because nothing outside needs the symbol.

### 3.4 The props type, and the one-word way to undo all of this

`ChangelogPanelProps` is declared at `ChangelogPanel.tsx:14` as a local,
unexported interface of two primitives. It has no dependency on
`changelog-data`, so either file can own it.

The content module exports it and the shim takes it as a **type-only** import:

```tsx
import type { ChangelogPanelProps } from './ChangelogPanelContent';
```

`import type` is erased at build and creates no runtime edge. Dropping the word
`type` — a change of four characters that reviews cleanly, type-checks
identically, and passes every behavioural test — would make the content module a
static dependency of the shim and pull all 131 KB straight back into the entry
chunk. The split would be gone and nothing except a bundle measurement would
say so.

That is why §5's second assertion is written as it is, and why the alternative
of declaring the interface twice was rejected: duplicating four lines to avoid
one import edge trades a real risk for a smaller one, and the guard removes the
real risk outright.

### 3.5 Fallback: `null`

The drawer is user-initiated and the chunk is one round trip. A spinner that
appears for a few tens of milliseconds is worse than nothing, and `null` keeps
the closed-state DOM byte-identical to today.

## 4. What a reader sees

No change. The drawer opens on click as it does now, one network round trip
later on a cold cache. Every release, every commit, every scope badge renders
exactly as before, from the same data.

## 5. Testing

**The eight existing tests keep testing `ChangelogPanel`** — the real
user-visible component — rather than being repointed at the content module.
Assertions about rendered content become `await screen.findBy…`, which has the
useful side effect of proving the lazy path resolves end to end. The
closed-state test stays synchronous, because the shim returns `null` without
suspending.

The `ScopeBadge` describe block repoints its import to `./ChangelogPanelContent`,
since that helper moved.

**A new source guard, `no-eager-changelog.test.ts`**, parses the shim with the
TypeScript AST — the parse-don't-scan idiom already established by
`packages/pa-cockpit/src/modes/no-module-scope-modes.test.ts` and
`packages/frontend/src/pa-cockpit-class-coverage.test.ts` — and asserts three
things:

1. `ChangelogPanel.tsx`'s static **value** imports are limited to an allow-list
   containing only `react`. Stated as an allow-list rather than as "does not
   import `./changelog-data`", because the shim could just as easily reach the
   data through a new static import of the content module — a rule that names
   one forbidden specifier would miss that, and following imports transitively
   is more machinery than an allow-list of one.
2. `./ChangelogPanelContent` appears **only** inside `lazy(() => import(…))`, or
   as a **type-only** import. See §3.5 for why that distinction is the whole
   ballgame.
3. The lazy element is **gated on `isOpen`** rather than rendered
   unconditionally.

Assertion 3 is the one that matters most and the one a lesser guard would omit:
assertions 1 and 2 can both hold while the split saves nothing.

Each assertion is **mutation-proven** before it is trusted — introduce the
defect, watch the guard go red naming it, revert from a file copy (never
`git checkout --`, which restores HEAD and discards uncommitted work), and
confirm the tree is clean with `git status`.

**Not added:** a build-time bundle check. `packages/pa-demo` and
`packages/public-site` each have a `check-bundle.mjs` and `packages/frontend`
has none; adding one would prove the artifact rather than the source shape.
Considered and declined for now — the realistic regression is someone adding
`import { changelog }` to the shim for a count badge, which the source guard
catches at edit time for free. If a bundle check is wanted later it is
independent of this work.

## 6. Verification

Build before and after, and record both entry-chunk sizes in the commit message,
so the claim in §1 is evidence rather than assertion. Expect the entry chunk to
drop by approximately the figures in §1 and a new chunk of roughly that size to
appear alongside it.

Full suite green, and the four Vitest workspaces plus backend unaffected — this
change is confined to `packages/frontend`.

## 7. What this does not do

- **No curation.** `changelog-data.ts` keeps all 102 releases, including the 68
  pre-CalVer ones. Part 2 remains open and unjudged.
- **No documentation-site work.** No archive page, in either language.
- **No release-procedure change.** `/bump-release` continues to edit
  `changelog-data.ts` exactly as it does today; nothing in
  `.claude/commands/bump-release.md` needs to change.
- **No change to the host contract or to `@ronl/pa-cockpit`.**
- **No general code-splitting programme.** This splits one drawer because it was
  measured at 19% of the bundle. Whether other routes deserve the same treatment
  is a separate question this design takes no position on.
