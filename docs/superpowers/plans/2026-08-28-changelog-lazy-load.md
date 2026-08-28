# Changelog Lazy-Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the 131 KB gzipped changelog out of `packages/frontend`'s initial load by splitting `ChangelogPanel` into a lazy shim and a content module, without changing what any user sees.

**Architecture:** `ChangelogPanel.tsx` becomes a thin shim that gates on `isOpen` and wraps a `React.lazy` import in `<Suspense>`. The current 562-line implementation moves verbatim to `ChangelogPanelContent.tsx`, taking `ScopeBadge` and the `changelog-data` import with it. All five call sites, the `@ronl/pa-cockpit` host seam, and `changelog-data.ts` are untouched.

**Tech Stack:** React 18.2 (`lazy`, `Suspense`), Vitest + Testing Library, the `typescript` compiler API for the source guard (hoisted to the repo root, importable from every workspace).

**Spec:** `docs/superpowers/specs/2026-08-28-changelog-lazy-load-design.md`

## Global Constraints

- **The Suspense boundary must live inside `packages/frontend`'s shim.** `packages/pa-cockpit/src/pages/PADashboardV2.tsx:516` renders the host's `ChangelogPanel`, and neither package has a Suspense boundary anywhere. A bare `lazy()` export would throw when the drawer opens on the PA cockpit route. **Do not add `<Suspense>` to `@ronl/pa-cockpit`** — that would change package code for one host's implementation detail, and `packages/pa-demo` supplies its own panel and must not inherit a Suspense requirement.
- **The lazy element must be gated on `isOpen`.** Rendered unconditionally, React resolves the import on mount, the chunk downloads on every page load, and the change saves nothing while passing a naive test.
- **The shim imports `ChangelogPanelProps` with `import type`, never a value import.** Dropping the word `type` restores the static edge and pulls all 131 KB back into the entry chunk. It reviews cleanly, type-checks identically, and passes every behavioural test.
- **`changelog-data.ts` is not edited.** No curation, no entry removal, no reordering. All 102 releases stay.
- **`.claude/commands/bump-release.md` is not edited.** The release procedure is unchanged by this work.
- **No call site changes.** The five files rendering `<ChangelogPanel …>` keep their current code exactly.
- **Anchor edits by content, not by line number.** Line numbers in this plan are provided for orientation and will shift as edits are applied; locate each edit by the surrounding code or the test name.
- **Every guard assertion is mutation-proven** before it is trusted: introduce the defect, watch it go red naming the right thing, revert **from a file copy** — never `git checkout --`, which restores HEAD and silently discards uncommitted work — and confirm with `git status --porcelain`.
- **Never pass `--no-verify`**, never set `SKIP=`/`HUSKY=0`, never edit or disable a hook. If a hook fails, read it and fix what it names, or stop and report.
- **No `Co-Authored-By: Claude` or `Claude-Session:` trailers** on commit messages. Thorough bodies, no trailers.
- **Never start, stop or restart a dev server.**

## File Structure

| File                                                                                            | Responsibility                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/frontend/src/pages/ChangelogPanelContent.tsx` _(created by moving the existing file)_ | The whole panel implementation and `ScopeBadge`. Owns the `changelog-data` import. Exports `ChangelogPanelProps`.      |
| `packages/frontend/src/pages/ChangelogPanel.tsx` _(rewritten)_                                  | The shim. Gates on `isOpen`, provides the Suspense boundary, holds the only `lazy()` call. No `changelog-data` import. |
| `packages/frontend/src/pages/ChangelogPanel.test.tsx` _(modified)_                              | Existing behaviour tests, now awaiting the lazy resolve. `ScopeBadge` import repointed.                                |
| `packages/frontend/src/pages/no-eager-changelog.test.ts` _(created)_                            | The source guard: allow-listed value imports, `lazy()` target, `isOpen` gating.                                        |

---

### Task 1: Split the panel into a shim and a content module

**Files:**

- Create: `packages/frontend/src/pages/ChangelogPanelContent.tsx` (by `git mv` from `ChangelogPanel.tsx`)
- Create: `packages/frontend/src/pages/ChangelogPanel.tsx` (new shim, replacing the moved file)
- Modify: `packages/frontend/src/pages/ChangelogPanel.test.tsx`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `ChangelogPanelContent.tsx` exports `ChangelogPanelProps` (`{ isOpen: boolean; onClose: () => void }`), a default export named `ChangelogPanelContent`, and the named export `ScopeBadge`. `ChangelogPanel.tsx` keeps its default export and its props unchanged. Task 2's guard parses `ChangelogPanel.tsx` and expects exactly the shape written in Step 3.

**Background the implementer needs.** `ChangelogPanel.tsx` is currently 562 lines. Line 1 imports `useEffect, useState` from react; lines 2-12 import `changelog` plus eight types from `./changelog-data`; line 14 declares a local, unexported `interface ChangelogPanelProps`; line 19 is the default export; line 57 is `if (!isOpen) return null;`; line 434 exports `ScopeBadge`.

`ScopeBadge` has no consumer outside this file and its test — verified. It moves with the content, and only the test's import specifier changes.

Both `useEffect` blocks already gate on `isOpen` internally (`if (e.key === 'Escape' && isOpen)` and `if (isOpen) { … } else { … }`), so **the content component needs no restructuring at all**. It keeps its `isOpen` prop, its early return, and its effects exactly as they are. The shim only ever renders it with `isOpen` true, which is harmless and keeps the diff to a pure move.

- [ ] **Step 1: Move the implementation, preserving history**

```bash
cd /home/steven/Development/ronl-business-api
git mv packages/frontend/src/pages/ChangelogPanel.tsx \
       packages/frontend/src/pages/ChangelogPanelContent.tsx
```

- [ ] **Step 2: Make two edits to the moved file, and no others**

In `packages/frontend/src/pages/ChangelogPanelContent.tsx`:

Change

```tsx
interface ChangelogPanelProps {
```

to

```tsx
export interface ChangelogPanelProps {
```

and change

```tsx
export default function ChangelogPanel({ isOpen, onClose }: ChangelogPanelProps) {
```

to

```tsx
export default function ChangelogPanelContent({ isOpen, onClose }: ChangelogPanelProps) {
```

Nothing else in this file changes — not the imports, not `ScopeBadge`, not the effects, not the early return. If you find yourself editing anything else, stop: the move is meant to be verbatim so the diff shows the split rather than a rewrite.

- [ ] **Step 3: Write the shim**

Create `packages/frontend/src/pages/ChangelogPanel.tsx`:

```tsx
import { lazy, Suspense } from 'react';
import type { ChangelogPanelProps } from './ChangelogPanelContent';

/**
 * The changelog drawer, split so its data does not ship in the entry chunk.
 *
 * changelog-data.ts is 432 KB raw / 131 KB gzipped across 102 releases — about
 * 19% of what a visitor downloads. LoginChoice.tsx renders this panel, so
 * before this split an unauthenticated visitor downloaded the project's entire
 * engineering diary before they could log in.
 *
 * ── Why the Suspense boundary is here and not at the call sites ──
 *
 * This is a correctness constraint, not a preference. @ronl/pa-cockpit's
 * PADashboardV2 renders the host's ChangelogPanel through the host contract,
 * and neither package contains a Suspense boundary anywhere. Exporting a bare
 * lazy() component would throw the moment the drawer opened on the PA cockpit
 * route. Adding <Suspense> inside the package instead would change package code
 * to accommodate one host's implementation detail — precisely what the host
 * contract exists to prevent, and packages/pa-demo supplies its own panel and
 * must not inherit a Suspense requirement because this host chose to split.
 *
 * Keeping the boundary here leaves all five call sites and the seam untouched.
 *
 * ── Why the early return is load-bearing ──
 *
 * The lazy element must render only when isOpen is true. Rendered
 * unconditionally, React begins resolving the import on mount, the chunk
 * downloads on every page load, and this whole exercise saves nothing while
 * still passing every behavioural test. The early return also preserves the
 * contract the panel has always had: nothing in the DOM while closed.
 *
 * ── Why the props import says `type` ──
 *
 * `import type` is erased at build and creates no runtime edge. Dropping that
 * one word would make ChangelogPanelContent a static dependency and pull all
 * 131 KB straight back into the entry chunk — a four-character change that
 * reviews cleanly, type-checks identically, and passes every behavioural test.
 * Only a bundle measurement would notice. no-eager-changelog.test.ts asserts
 * the import form for exactly that reason.
 */
const ChangelogPanelContent = lazy(() => import('./ChangelogPanelContent'));

export default function ChangelogPanel({ isOpen, onClose }: ChangelogPanelProps) {
  if (!isOpen) return null;

  // fallback={null}: the drawer is user-initiated and the chunk is one round
  // trip. A spinner that flashes for a few tens of milliseconds reads as a
  // glitch, and null keeps the closed-state DOM identical to before the split.
  return (
    <Suspense fallback={null}>
      <ChangelogPanelContent isOpen onClose={onClose} />
    </Suspense>
  );
}
```

- [ ] **Step 4: Repoint the `ScopeBadge` import**

Do this _before_ the diagnostic run below. `ScopeBadge` is no longer exported from `./ChangelogPanel`, and a missing named export is a link-time error in ESM — the test file would fail to load at all, running **zero** tests and telling you nothing about which assertions depend on synchronous rendering.

In `packages/frontend/src/pages/ChangelogPanel.test.tsx`, change

```tsx
import ChangelogPanel, { ScopeBadge } from './ChangelogPanel';
```

to

```tsx
import ChangelogPanel from './ChangelogPanel';
import { ScopeBadge } from './ChangelogPanelContent';
```

The `import { changelog } from './changelog-data';` line below it stays — the test file may import the data eagerly, because test files are never bundled.

- [ ] **Step 5: Run the tests and watch them fail for the right reason**

Run: `npx vitest run --no-file-parallelism src/pages/ChangelogPanel.test.tsx --root packages/frontend`

Expected in a **whole-file run**: the seven `ScopeBadge` tests PASS, `'renders nothing when closed'` PASSES, and **exactly one** `ChangelogPanel` test fails — `'when open, shows a version card for every release with the latest one expanded'`. One failure, fourteen passes, fifteen total.

**That is not seven failures, and the reason matters.** `lazy()` caches its resolved promise at **module scope**, so the first test that renders the panel open suspends and fails, and every later test in the file rides the now-warmed cache and renders synchronously. Six tests therefore pass for a reason unrelated to what they assert.

To see the real failure set, run them individually:

```bash
for t in \
  "when open, shows a version card" \
  "clicking a collapsed version expands it" \
  "the close" \
  "clicking the overlay calls onClose" \
  "pressing Escape calls onClose" \
  "locks body scroll while open" \
  "a per-commit format version shows"; do
  npx vitest run --no-file-parallelism src/pages/ChangelogPanel.test.tsx \
    --root packages/frontend -t "$t" 2>&1 | grep -E "^ *Tests "
done
```

Expected: all seven FAIL in isolation. That is the list Step 6 works from.

This inverts the hazard the repo's standing rule describes. There, a _failure_ that depends on how the suite was run is not yet a finding. Here a _pass_ depends on it — six tests would break the moment anyone reorders the file, inserts a test above them, or runs one with `-t`. Adding all seven awaits is what makes each test independent of its neighbours, which is why Step 6 does not stop at the one test that fails in a whole-file run.

- [ ] **Step 6: Await the lazy resolve in the seven tests that need it**

Locate each test by its name, not by line number — earlier edits shift them.

**`'renders nothing when closed'` — unchanged.** It must stay synchronous: the shim returns `null` without suspending, and this test is what pins that.

**`'when open, shows a version card for every release with the latest one expanded'`** — add `async` to the callback and change

```tsx
expect(screen.getByRole('dialog')).toBeInTheDocument();
```

to

```tsx
expect(await screen.findByRole('dialog')).toBeInTheDocument();
```

**`'clicking a collapsed version expands it, clicking again collapses it'`** — already `async`. Insert immediately after its `render(…)` call:

```tsx
await screen.findByRole('dialog');
```

**`'the close (×) button calls onClose'`** — already `async`. Change

```tsx
await user.click(screen.getByRole('button', { name: 'Close changelog' }));
```

to

```tsx
await user.click(await screen.findByRole('button', { name: 'Close changelog' }));
```

**`'clicking the overlay calls onClose'`** — already `async`. Insert immediately after its `render(…)` call:

```tsx
await screen.findByRole('dialog');
```

**`'pressing Escape calls onClose'`** — already `async`. Insert immediately after its `render(…)` call:

```tsx
await screen.findByRole('dialog');
```

The Escape handler lives in the content's `useEffect`, so without this the listener is not registered when the key is pressed.

**`'locks body scroll while open and restores it on close'`** — add `async` to the callback and insert `await screen.findByRole('dialog');` between the `render(…)` and the first `expect`, so the body becomes:

```tsx
const { rerender } = render(<ChangelogPanel isOpen onClose={vi.fn()} />);
await screen.findByRole('dialog');
expect(document.body.style.overflow).toBe('hidden');

rerender(<ChangelogPanel isOpen={false} onClose={vi.fn()} />);
expect(document.body.style.overflow).toBe('');
```

The second half needs no await: `isOpen={false}` makes the shim return `null` synchronously, unmounting the content and running its cleanup.

**`'a per-commit format version shows its commit subjects and sha/author trailer'`** — already `async`. Change

```tsx
const toggle = screen.getByRole('button', {
  name: versionButtonName(commitVersion.version),
});
```

to

```tsx
const toggle = await screen.findByRole('button', {
  name: versionButtonName(commitVersion.version),
});
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `npx vitest run --no-file-parallelism src/pages/ChangelogPanel.test.tsx --root packages/frontend`
Expected: PASS, **15** tests — 8 `ChangelogPanel` plus 7 `ScopeBadge` (three `it(` blocks and a four-row `it.each`).

Then confirm the order-independence this task exists to establish, by re-running the seven from Step 5 individually with `-t`. All seven must now pass standalone. A test that passes in file order but not alone has not been fixed; it has been hidden.

If a test times out rather than failing an assertion, the lazy import is not resolving — check that the `lazy()` specifier matches the created filename exactly.

- [ ] **Step 8: Verify nothing else broke**

```bash
npm test --workspace=@ronl/frontend
npm run type-check
npm run lint
npm run check-format
```

Expected: frontend 842 tests (unchanged — this task adds none), zero type errors, lint and format clean.

Note the file carries `vi.setConfig({ testTimeout: 60000 })`; leave it. It exists because the panel renders 102 real version cards, which is genuinely slow, and that has not changed.

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/pages/ChangelogPanel.tsx \
        packages/frontend/src/pages/ChangelogPanelContent.tsx \
        packages/frontend/src/pages/ChangelogPanel.test.tsx
git commit
```

Message: `perf(frontend): load the changelog drawer's content on demand`. The body should state the measured cost, why the Suspense boundary is in the shim rather than the package, why the `isOpen` gate is load-bearing, and that the content module moved verbatim.

---

### Task 2: Guard the split against silent regression

**Files:**

- Create: `packages/frontend/src/pages/no-eager-changelog.test.ts`

**Interfaces:**

- Consumes: `ChangelogPanel.tsx` in the exact shape Task 1 Step 3 wrote — a `lazy()` call assigned at module scope, a `import type` of `ChangelogPanelProps`, and a default export whose first statement is `if (!isOpen) return null;`.
- Produces: nothing.

**Background the implementer needs.** Three edits, each a few characters, would each undo the split while leaving every behavioural test green:

1. Adding any static value import that reaches the data — including `import ChangelogPanelContent from './ChangelogPanelContent'` alongside the `lazy()` call.
2. Dropping the word `type` from the props import.
3. Removing the `if (!isOpen) return null;` line, so the lazy element renders on mount.

The guard asserts against all three. It parses rather than greps, following the idiom already used by `packages/frontend/src/pa-cockpit-class-coverage.test.ts` and `packages/pa-cockpit/src/modes/no-module-scope-modes.test.ts`: a regex over source text cannot tell an import from the same words inside a comment or a string, and the parse tree distinguishes them by construction.

Assertion 1 is written as an **allow-list** rather than as "does not import `./changelog-data`". A rule naming one forbidden specifier would miss the far likelier regression — reaching the data through a new static import of the content module.

`typescript` resolves from `packages/frontend`; it is hoisted to the repo-root `node_modules`.

- [ ] **Step 1: Write the guard**

Create `packages/frontend/src/pages/no-eager-changelog.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';

/**
 * ChangelogPanel.tsx must stay a shim.
 *
 * changelog-data.ts is 131 KB gzipped and LoginChoice.tsx renders this panel,
 * so the split is what keeps an unauthenticated visitor from downloading the
 * project's entire release history. Three edits would undo it while leaving
 * every behavioural test green, which is why this file exists:
 *
 *   - a static value import that reaches the data, including one of the
 *     content module alongside the lazy() call;
 *   - dropping the word `type` from the props import, which restores the
 *     static edge in four characters;
 *   - removing the isOpen gate, after which React resolves the import on
 *     mount and the chunk ships on every page load anyway.
 *
 * None of the three changes what a user sees, so nothing else would notice.
 *
 * It parses rather than greps, as pa-cockpit-class-coverage.test.ts and
 * no-module-scope-modes.test.ts do, and for the same reason: a regex cannot
 * tell an import from the same words in a comment or a string literal, and the
 * parse tree distinguishes them by construction.
 */
const SHIM = join(dirname(fileURLToPath(import.meta.url)), 'ChangelogPanel.tsx');

/**
 * Modules the shim may import for their runtime value.
 *
 * An allow-list, not a list of forbidden specifiers. "Must not import
 * ./changelog-data" would be satisfied by importing ./ChangelogPanelContent
 * statically instead, which pulls in the data transitively and is the likelier
 * mistake. Naming what is permitted closes both doors with one rule.
 */
const ALLOWED_VALUE_IMPORTS = new Set(['react']);

const CONTENT_MODULE = './ChangelogPanelContent';

function parseShim(): ts.SourceFile {
  return ts.createSourceFile(
    SHIM,
    readFileSync(SHIM, 'utf-8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
}

/** True when an import contributes nothing at runtime. */
function isTypeOnlyImport(stmt: ts.ImportDeclaration): boolean {
  const clause = stmt.importClause;
  if (!clause) return false; // bare `import './x'` — a side-effect import, real
  if (clause.isTypeOnly) return true; // `import type { X } from …`
  if (clause.name) return false; // a default binding is a value
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return false; // `import * as x` is a value
  // `import { type A, type B }` — type-only iff every specifier is.
  return bindings.elements.every((el) => el.isTypeOnly);
}

describe('ChangelogPanel.tsx stays a shim', () => {
  it('imports nothing for its value except the allow-list', () => {
    const offenders: string[] = [];
    for (const stmt of parseShim().statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      if (isTypeOnlyImport(stmt)) continue;
      const spec = stmt.moduleSpecifier;
      if (!ts.isStringLiteral(spec)) continue;
      if (!ALLOWED_VALUE_IMPORTS.has(spec.text)) {
        offenders.push(
          `${spec.text} is imported for its value; only ${[...ALLOWED_VALUE_IMPORTS].join(', ')} may be. ` +
            `A static import here pulls the changelog back into the entry chunk.`
        );
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('reaches the content module only through lazy(() => import(…))', () => {
    let lazyTarget: string | null = null;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'lazy' &&
        node.arguments.length === 1
      ) {
        const arrow = node.arguments[0];
        if (ts.isArrowFunction(arrow) && ts.isCallExpression(arrow.body)) {
          const inner = arrow.body;
          if (
            inner.expression.kind === ts.SyntaxKind.ImportKeyword &&
            inner.arguments.length === 1 &&
            ts.isStringLiteral(inner.arguments[0])
          ) {
            lazyTarget = (inner.arguments[0] as ts.StringLiteral).text;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(parseShim(), visit);

    expect(
      lazyTarget,
      `no lazy(() => import('${CONTENT_MODULE}')) found — the panel is not code-split`
    ).toBe(CONTENT_MODULE);
  });

  it('returns before rendering the lazy element when closed', () => {
    // The gate is what makes the split real. Without it React resolves the
    // import on mount and the chunk ships on every page load — the component
    // still behaves correctly, so no other test would fail.
    const sf = parseShim();
    let firstStatement: ts.Statement | undefined;
    for (const stmt of sf.statements) {
      if (
        ts.isFunctionDeclaration(stmt) &&
        stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        firstStatement = stmt.body?.statements[0];
      }
    }

    const gatesOnIsOpen =
      !!firstStatement &&
      ts.isIfStatement(firstStatement) &&
      ts.isPrefixUnaryExpression(firstStatement.expression) &&
      firstStatement.expression.operator === ts.SyntaxKind.ExclamationToken &&
      ts.isIdentifier(firstStatement.expression.operand) &&
      firstStatement.expression.operand.text === 'isOpen';

    expect(
      gatesOnIsOpen,
      "the default export's first statement must be `if (!isOpen) return null;` — " +
        'without it the lazy chunk downloads on mount and the split saves nothing'
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run it against the real shim**

Run: `npx vitest run --no-file-parallelism src/pages/no-eager-changelog.test.ts --root packages/frontend`
Expected: PASS, 3 tests. Green on arrival is correct — the proof comes from Step 3.

- [ ] **Step 3: Mutation-prove all three assertions**

Back the shim up and restore from the copy. **Do not use `git checkout --`**: the shim is committed by now, so it would appear to work, but the habit is what matters and on uncommitted work it silently discards the change under test.

```bash
cd /home/steven/Development/ronl-business-api
mkdir -p /tmp/shimprobe
cp packages/frontend/src/pages/ChangelogPanel.tsx /tmp/shimprobe/shim.tsx
T="npx vitest run --no-file-parallelism src/pages/no-eager-changelog.test.ts --root packages/frontend"

# Probe 1 — a static value import of the content module, alongside the lazy call
python3 - <<'PY'
import pathlib
p = pathlib.Path('packages/frontend/src/pages/ChangelogPanel.tsx')
s = p.read_text()
old = "import type { ChangelogPanelProps } from './ChangelogPanelContent';"
assert old in s, "anchor not found — check the shim against the plan"
p.write_text(s.replace(old, old + "\nimport { ScopeBadge } from './ChangelogPanelContent';", 1))
PY
$T
# Expected: FAIL on "imports nothing for its value except the allow-list",
# naming ./ChangelogPanelContent
cp /tmp/shimprobe/shim.tsx packages/frontend/src/pages/ChangelogPanel.tsx

# Probe 2 — drop the word `type` from the props import (the four-character undo)
sed -i "s/^import type { ChangelogPanelProps }/import { ChangelogPanelProps }/" \
  packages/frontend/src/pages/ChangelogPanel.tsx
$T
# Expected: FAIL on the same assertion — the import is now value-bearing
cp /tmp/shimprobe/shim.tsx packages/frontend/src/pages/ChangelogPanel.tsx

# Probe 3 — remove the isOpen gate
python3 - <<'PY'
import pathlib
p = pathlib.Path('packages/frontend/src/pages/ChangelogPanel.tsx')
s = p.read_text()
old = "  if (!isOpen) return null;\n\n"
assert old in s, "anchor not found — check the shim's gate against the plan"
p.write_text(s.replace(old, "", 1))
PY
$T
# Expected: FAIL on "returns before rendering the lazy element when closed"
cp /tmp/shimprobe/shim.tsx packages/frontend/src/pages/ChangelogPanel.tsx

# Probe 4 — break the lazy target
sed -i "s|lazy(() => import('./ChangelogPanelContent'))|lazy(() => import('./ChangelogPanelContentX'))|" \
  packages/frontend/src/pages/ChangelogPanel.tsx
$T
# Expected: FAIL on "reaches the content module only through lazy(() => import(…))"
cp /tmp/shimprobe/shim.tsx packages/frontend/src/pages/ChangelogPanel.tsx

git status --porcelain packages/frontend/src/pages/ChangelogPanel.tsx
# Expected: no output. If the file still shows as modified, a restore failed.
rm -rf /tmp/shimprobe
```

Each `python3` probe carries an `assert` so a mismatched anchor fails loudly instead of replacing nothing and reporting a false "probe passed".

- [ ] **Step 4: Verify the suite and the gates**

```bash
npm test --workspace=@ronl/frontend
npm run type-check
npm run lint
npm run check-format
```

Expected: frontend 845 tests (842 + this file's 3), gates clean.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pages/no-eager-changelog.test.ts
git commit
```

Message: `test(frontend): keep ChangelogPanel a shim`. The body should name all three regressions the guard catches, say why the first assertion is an allow-list rather than a list of forbidden specifiers, and record the four probe results.

---

### Task 3: Measure the result and close the follow-up entry

**Files:**

- Modify: `docs/superpowers/plans/2026-08-27-pa-cockpit-follow-ups.md` (the `## 14.` entry)

**Interfaces:**

- Consumes: the outcomes of Tasks 1 and 2.
- Produces: nothing.

**Background the implementer needs.** The spec promises the bundle claim will be evidence rather than assertion. Before this work the entry chunk was 2,219,747 bytes raw / 690,378 gzipped, with `changelog-data.ts` at 432,561 raw / 130,682 gzipped inside it.

- [ ] **Step 1: Build and measure**

```bash
cd /home/steven/Development/ronl-business-api
npm run build --workspace=@ronl/frontend
ls -la packages/frontend/dist/assets/*.js
for f in packages/frontend/dist/assets/*.js; do
  printf "%-60s raw %9s  gz %9s\n" "$(basename "$f")" "$(wc -c < "$f")" "$(gzip -9 -c "$f" | wc -c)"
done
```

Expected: the largest chunk is now materially smaller than 2,219,747 bytes, and a separate chunk of roughly the changelog's size has appeared. Record both figures — the new entry chunk and the new changelog chunk — for Step 2.

If no second chunk appears, the split did not happen: check that the `lazy()` specifier resolves and that nothing else statically imports `ChangelogPanelContent`.

- [ ] **Step 2: Close item 14's first half in the follow-ups list**

Add a `> **Done — part 1.**` blockquote directly under the `## 14. Rotate the changelog out of the app bundle` heading, in the same shape and voice as items 1, 2, 4 and 9 already in that file — read those first and match them. Record:

- that measuring first **changed the answer**: the entry proposed rotation, but the panel is a drawer and nothing in the frontend was code-split, so lazy-loading removes all 131 KB rather than rotation's ~87 KB, and does it without touching the release procedure, the data, or the documentation site;
- the before and after entry-chunk figures from Step 1;
- that the Suspense boundary had to live in the shim because `PADashboardV2.tsx:516` renders the host's panel and neither package has a boundary — a bare `lazy()` export would have thrown on the PA cockpit route;
- that the guard asserts the import _form_, not just the specifier, because dropping `type` from `import type` is a four-character undo that reviews cleanly and passes every behavioural test;
- that **part 2 — curation and a documentation-site archive — remains open and unjudged**, and that its case is about curation rather than bundle weight, since lazy-loading has answered the bundle argument in full.

- [ ] **Step 3: Format and commit**

```bash
npx prettier --write docs/superpowers/plans/2026-08-27-pa-cockpit-follow-ups.md
npm run check-format
git add docs/superpowers/plans/2026-08-27-pa-cockpit-follow-ups.md
git commit
```

Message: `docs: close the first half of follow-up item 14`.

---

## Final verification

```bash
npm run type-check
npm run lint
npm run check-format
npm test --workspace=@ronl/backend
npm test --workspace=@ronl/frontend
npm test --workspace=@ronl/pa-cockpit
npm test --workspace=@ronl/pa-demo
npm test --workspace=@ronl/public-site
```

Expected: backend 1576, frontend **845**, pa-cockpit 368, pa-demo 104, public-site 140 — **3,033**, up from 3,030 by Task 2's three assertions.

Treat that figure as a **floor rather than an equality**: a plan cannot predict tests its own review loop will require, so a higher count with every task green means the loop did its job, while a lower one means something was lost.

If a test fails inside a full run, re-run it in isolation before concluding anything — a parallel-only failure may be contention rather than a defect. Use `npm run test:serial --workspace=@ronl/<name>`; `--no-file-parallelism` is Vitest-only and the backend is Jest.

Do not merge or push. Report the branch state and stop.
