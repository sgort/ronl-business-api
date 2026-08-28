# Duplication Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the surviving cross-workspace duplication impossible to drift silently, without moving any CSS or changing anything that renders.

**Architecture:** Four source-reading guards plus two comment corrections. Each guard reads files it can legitimately reach — `packages/pa-demo` reads sibling sources by repo-relative path, `packages/frontend` reaches into `@ronl/pa-cockpit` through that package's declared export surface — and asserts a fact that no type-check or render test can see. Nothing that ships changes.

**Tech Stack:** Vitest, the `typescript` compiler API (hoisted to the repo root, importable from every workspace), Node `fs` / `module.createRequire`.

**Spec:** `docs/superpowers/specs/2026-08-28-pa-cockpit-duplication-design.md`

## Global Constraints

- **No runtime code changes.** No CSS moves, no new package, no change to anything that renders. Nothing in this plan requires a visual check.
- **`packages/pa-cockpit` must never read `packages/frontend`.** The package does not depend on the app and must not learn to. Guard B therefore lives in `packages/frontend`, the only workspace that can legitimately see both stylesheets.
- **Guard B must not assert value equality.** `.v2-no-access*` has already diverged deliberately (`--v2-*` vs `--pac-*` tokens, `520px` vs `60ch`, PA adds `border-left`). A guard that enforced equality would fail on that divergence and be deleted rather than fixed.
- **Extraction must be parse-based, not regex-over-text.** `\bv2-` matches inside `cwd-v2-palette` because `-` is a word boundary, and the same false positive came from a _comment_ rather than markup. Use `ts.createSourceFile` and read only string/template literals, per the idiom in `packages/pa-cockpit/src/modes/no-module-scope-modes.test.ts`.
- **Every guard is mutation-proven before it is trusted.** Introduce the defect, watch it go red naming the right file, revert, confirm with `git status`.
- **Revert probes with a file copy, never `git checkout --`.** On uncommitted work that restores HEAD and silently discards the change under test.
- **Never pass `--no-verify`.** If a pre-commit hook fails, read it and fix what it names.
- **Do not start, stop or restart any dev server.**

## File Structure

| File                                                                                   | Responsibility                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/pa-demo/src/brand-colours.test.ts` _(create)_                                | Guard A. Asserts the five `--color-*` brand tokens hold one value across four files.                                                             |
| `packages/frontend/src/pa-cockpit-class-coverage.test.ts` _(create)_                   | Guard B. Asserts every `v2-*` class a package component renders has a rule in both stylesheets.                                                  |
| `packages/pa-demo/src/demo/pa-cockpit-host.auth.test.ts` _(create)_                    | Guard C. Pins the demo's auth adapter. Separate from the existing host test so the mode-narrowing pin keeps exercising an unmocked module graph. |
| `packages/pa-cockpit/src/components/PADashboardV2/PACommandPalette.tsx:6-7` _(modify)_ | Correction: remove the false `.cwd-v2-palette*` claim.                                                                                           |
| `packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css` _(modify)_          | Correction: note naming the counterpart and why the copies are required.                                                                         |

---

### Task 1: Guard A — the five brand colours

**Files:**

- Create: `packages/pa-demo/src/brand-colours.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

**Background the implementer needs.** Five brand colours exist as literals in four files. `packages/frontend/src/index.css:5-11` and `packages/pa-demo/src/index.css:21-27` declare them as CSS custom properties in a `:root` block; the two `tailwind.config.js` files repeat them as fallbacks inside `var(--color-primary, #01689b)`. Both configs also alias `dutch-blue` → `--color-primary` and `dutch-orange` → `--color-secondary` with the same fallbacks, which is the same fact spelled a second time in the same file — in scope, and handled automatically by keying on the token name.

This test lives in `packages/pa-demo` because that workspace's own `index.css:1-16` declares it "owns its own copy of the shell". Reading `packages/frontend/src/index.css` from here is a **dev-time filesystem read of a sibling workspace's source, not a package dependency** — no `@ronl/frontend` entry is added and nothing changes in the bundle. The path is resolved from this file upward to the repo root, because module resolution would not find it.

- [ ] **Step 1: Write the failing test**

Create `packages/pa-demo/src/brand-colours.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The five RONL brand colours exist as literals in four files, and nothing
 * keeps them in step.
 *
 *   packages/frontend/src/index.css     :root { --color-primary: #01689b; … }
 *   packages/pa-demo/src/index.css      the same block, byte-identical today
 *   packages/frontend/tailwind.config.js   var(--color-primary, #01689b)
 *   packages/pa-demo/tailwind.config.js    the same
 *
 * The copies are deliberate: pa-demo/src/index.css:1-16 records that this
 * app-shell CSS stays per-app on purpose and that @ronl/pa-cockpit leaves it
 * out of styles.css. So the fix is not to merge them — it is to make an
 * edit-one-and-forget-the-others impossible to ship.
 *
 * This lives in packages/pa-demo because pa-demo is the workspace that
 * documents itself as owning a copy. Reading a sibling workspace's source is a
 * dev-time filesystem read, not a package dependency: no @ronl/frontend entry
 * exists and nothing reaches the bundle. The path is resolved upward to the
 * repo root because module resolution would not find it — which is the point.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** `--color-primary: #01689b;` in a CSS :root block. */
const CSS_DECL = /--(color-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;

/** `var(--color-primary, #01689b)` in a Tailwind colour value. */
const TW_FALLBACK = /var\(\s*--(color-[a-z-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g;

const SOURCES = [
  { file: 'packages/frontend/src/index.css', pattern: CSS_DECL },
  { file: 'packages/pa-demo/src/index.css', pattern: CSS_DECL },
  { file: 'packages/frontend/tailwind.config.js', pattern: TW_FALLBACK },
  { file: 'packages/pa-demo/tailwind.config.js', pattern: TW_FALLBACK },
] as const;

const BRAND_TOKENS = [
  'color-primary',
  'color-primary-dark',
  'color-primary-light',
  'color-secondary',
  'color-accent',
] as const;

/** Every (token, value) pair one file declares. Values lower-cased: #FFF and #fff are one colour. */
function pairsIn(relPath: string, pattern: RegExp): Array<[string, string]> {
  const full = join(REPO_ROOT, relPath);
  let text: string;
  try {
    text = readFileSync(full, 'utf-8');
  } catch {
    // Fail rather than skip. A guard that silently stops reading a file it was
    // written to watch is worse than no guard: it reports green forever.
    throw new Error(
      `brand-colours guard: cannot read ${relPath} at ${full}. If the file moved, ` +
        `update SOURCES — do not delete the entry.`
    );
  }
  return [...text.matchAll(new RegExp(pattern.source, 'g'))].map((m) => [m[1], m[2].toLowerCase()]);
}

describe('the five brand colours agree across every file that spells them', () => {
  it('gives each --color-* token exactly one value everywhere', () => {
    const seen = new Map<string, { value: string; file: string }>();
    const conflicts: string[] = [];

    for (const { file, pattern } of SOURCES) {
      for (const [token, value] of pairsIn(file, pattern)) {
        const prior = seen.get(token);
        if (!prior) {
          seen.set(token, { value, file });
        } else if (prior.value !== value) {
          conflicts.push(`--${token}: ${prior.value} in ${prior.file}, but ${value} in ${file}`);
        }
      }
    }

    expect(conflicts, conflicts.join('\n')).toEqual([]);
  });

  it('actually finds all five tokens in all four files', () => {
    // Without this, a rename or a broken pattern makes the assertion above
    // vacuously green: it reads nothing, finds no conflict, and passes.
    const missing: string[] = [];
    for (const { file, pattern } of SOURCES) {
      const found = new Set(pairsIn(file, pattern).map(([token]) => token));
      for (const token of BRAND_TOKENS) {
        if (!found.has(token)) missing.push(`${file} does not declare --${token}`);
      }
    }
    expect(missing, missing.join('\n')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it passes on the untouched tree**

Run: `npx vitest run --no-file-parallelism src/brand-colours.test.ts --root packages/pa-demo`
Expected: `Tests  2 passed (2)`. The four files agree today, so green on arrival is correct — the proof this guard works comes from the probes in Step 3, not from this run.

- [ ] **Step 3: Mutation-prove it**

Back the files up first, and restore from the backup. **Do not use `git checkout --`** — these edits are uncommitted, so that restores HEAD and silently discards the guard you are testing.

```bash
cd /home/steven/Development/ronl-business-api
mkdir -p /tmp/brandprobe
cp packages/pa-demo/src/index.css /tmp/brandprobe/demo-index.css
cp packages/pa-demo/tailwind.config.js /tmp/brandprobe/demo-tailwind.js

# Probe 1: change one hex digit in the demo's CSS :root
sed -i 's/--color-primary: #01689b;/--color-primary: #01689c;/' packages/pa-demo/src/index.css
npx vitest run --no-file-parallelism src/brand-colours.test.ts --root packages/pa-demo
# Expected: FAIL, naming packages/pa-demo/src/index.css and both values
cp /tmp/brandprobe/demo-index.css packages/pa-demo/src/index.css

# Probe 2: change only a Tailwind fallback
sed -i "s/var(--color-accent, #ff6b00)/var(--color-accent, #ff6b01)/" packages/pa-demo/tailwind.config.js
npx vitest run --no-file-parallelism src/brand-colours.test.ts --root packages/pa-demo
# Expected: FAIL, naming packages/pa-demo/tailwind.config.js
cp /tmp/brandprobe/demo-tailwind.js packages/pa-demo/tailwind.config.js

# Probe 3: rename a token so the pattern stops matching it
sed -i 's/--color-accent:/--color-accent-renamed:/' packages/pa-demo/src/index.css
npx vitest run --no-file-parallelism src/brand-colours.test.ts --root packages/pa-demo
# Expected: FAIL on the second test ("does not declare --color-accent"),
# which is the assertion that stops a broken pattern passing vacuously
cp /tmp/brandprobe/demo-index.css packages/pa-demo/src/index.css

git status --porcelain packages/pa-demo/src/index.css packages/pa-demo/tailwind.config.js
# Expected: no output. If either file still shows as modified, the restore failed.
rm -rf /tmp/brandprobe
```

- [ ] **Step 4: Run the workspace suite and the gates**

```bash
npm test --workspace=@ronl/pa-demo
npm run type-check
npm run lint
npm run check-format
```

Expected: pa-demo `Tests 99 passed (99)` (97 before, plus this file's 2); zero type errors; lint and format clean.

- [ ] **Step 5: Commit**

```bash
git add packages/pa-demo/src/brand-colours.test.ts
git commit
```

Message: `test(pa-demo): pin the five brand colours across all four files that spell them`. Body should record that the copies are deliberate per `pa-demo/src/index.css:1-16`, that the second assertion exists so a broken pattern cannot pass vacuously, and the three probe results.

---

### Task 2: Guard B — `v2-*` class coverage across both stylesheets

**Files:**

- Create: `packages/frontend/src/pa-cockpit-class-coverage.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

**Background the implementer needs.** `packages/pa-demo` never imports `dashboard-v2.css` — the only importer anywhere is `packages/frontend/src/pages/CaseworkerDashboardV2.tsx:55`. So every `v2-*` class a package-owned component renders must _also_ have a rule in the package's own `dashboard-pa.css`, or the demo renders it unstyled. That is why the copies exist, and `dashboard-pa.css:1139` and `PANoAccessPanel.tsx:5-7` already say so.

This test lives in `packages/frontend` because it is the only workspace that can legitimately see both stylesheets: its own directly, and the package's through the `@ronl/pa-cockpit` dependency. The reverse is impossible and must stay impossible.

Two constraints, both found by testing the idea rather than assuming it:

1. `\bv2-` matches inside `cwd-v2-palette`, because `-` is a word boundary. A naive regex reports a phantom `v2-palette` class that no stylesheet defines.
2. That phantom came from a **comment**, not from markup — `PACommandPalette.tsx:6` mentions `.cwd-v2-palette*` in prose.

Both are solved by parsing and reading only string and template literals, then requiring a **whole token** match: `cwd-v2-palette` is one token and does not match `^v2-`.

Resolution into the package uses its declared export surface, verified working: `createRequire(import.meta.url).resolve('@ronl/pa-cockpit/styles.css')` returns `<repo>/packages/pa-cockpit/src/styles.css`, whose directory is the package `src`.

`typescript` is hoisted to the repo-root `node_modules` and resolves from this workspace — verified.

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/pa-cockpit-class-coverage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';

/**
 * Every `v2-*` class a package-owned component renders must have a rule in
 * BOTH stylesheets.
 *
 * packages/pa-demo never imports dashboard-v2.css — CaseworkerDashboardV2.tsx
 * is its only importer anywhere — so the cockpit carries its own copy of every
 * v2-* rule it needs. That is not decay; it is what makes the package render
 * standalone, which is the demo's whole premise. dashboard-pa.css:1139 and
 * PANoAccessPanel.tsx both say so already.
 *
 * The failure this catches: someone adds a class to a package component and
 * styles it in one stylesheet. The other host silently loses styling, and
 * nothing else in the repo notices.
 *
 * ── What this deliberately does NOT assert ──
 *
 * Value equality. `.v2-no-access*` has already diverged on purpose — `--v2-*`
 * vs `--pac-*` tokens, 520px vs 60ch, and PA adds a border-left accent — and
 * `.v2-changelog-btn` may legitimately want to theme differently later. A
 * guard that enforced equality would be red on arrival against a deliberate
 * decision, and would be deleted rather than fixed.
 *
 * ── Why it parses ──
 *
 * A text scan cannot do this. `\bv2-` matches inside `cwd-v2-palette`, because
 * `-` is a word boundary, so a regex reports a phantom `v2-palette` class that
 * no stylesheet defines — and the text it matched was a *comment*
 * (PACommandPalette.tsx:6 discusses `.cwd-v2-palette*` in prose), not markup.
 * Reading string and template literals from the parse tree excludes comments by
 * construction, and matching a whole token makes `cwd-v2-palette` a non-match
 * rather than a near-miss. Same choice, for the same reasons, as
 * no-module-scope-modes.test.ts and index.test.ts.
 */
const require_ = createRequire(import.meta.url);

/**
 * The package's src directory, reached through its declared export surface
 * rather than a relative path across workspaces. `@ronl/pa-cockpit` is a
 * dependency of this workspace; './styles.css' is one of its three exports.
 */
const PACKAGE_SRC = dirname(require_.resolve('@ronl/pa-cockpit/styles.css'));

const PA_CSS = join(PACKAGE_SRC, 'pages', 'public-affairs-v2', 'dashboard-pa.css');
const FE_CSS = join(
  dirname(fileURLToPath(import.meta.url)),
  'pages',
  'caseworker-v2',
  'dashboard-v2.css'
);

/**
 * Classes exempt from coverage, each with the ruling that exempted it.
 *
 *  - v2-main-pad: inert under `.pac` and kept deliberately. Its only rule
 *    anywhere is `.cwd-v2 .v2-main-pad` (dashboard-v2.css:436); the PA shell's
 *    padding comes from `.pac .pac-main-pad`. It stays because both PA hosts
 *    and the .cwd-v2 family spell their section wrappers the same way, and
 *    removing it from one of three would make the convention inconsistent
 *    rather than absent. See PaSectionsRouter.tsx and commit 7196730.
 */
const EXEMPT = new Set(['v2-main-pad']);

/**
 * The classes this guard expects to find. Pinned so a broken extractor cannot
 * pass by finding nothing — and so the `cwd-v2-palette` false positive stays
 * caught: if it ever reappears, `v2-palette` shows up here as an extra.
 */
const EXPECTED_CLASSES = [
  'v2-changelog-btn',
  'v2-main-pad',
  'v2-no-access',
  'v2-no-access-body',
  'v2-no-access-meta',
  'v2-no-access-title',
].sort();

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkTsx(full, out);
    else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

/**
 * Every whole `v2-*` token appearing in a string or template literal.
 *
 * Literals only: comments are trivia, not nodes, so prose discussing a class
 * cannot mint one. Whole tokens only: splitting on whitespace means
 * `cwd-v2-palette` is compared entire and fails `^v2-`, rather than matching
 * a suffix of itself.
 */
function renderedV2Classes(): Map<string, string[]> {
  const found = new Map<string, string[]>();

  for (const file of walkTsx(PACKAGE_SRC)) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf-8'),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      ts.ScriptKind.TSX
    );

    const visit = (node: ts.Node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        for (const token of node.text.split(/\s+/)) {
          if (/^v2-[a-z0-9-]+$/.test(token)) {
            const where = found.get(token) ?? [];
            const rel = relative(PACKAGE_SRC, file);
            if (!where.includes(rel)) where.push(rel);
            found.set(token, where);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
  }
  return found;
}

/** Does this stylesheet define a rule for `.cls`, as a whole class token? */
function definesClass(cssPath: string, cls: string): boolean {
  const css = readFileSync(cssPath, 'utf-8');
  // Negative lookahead so `.v2-no-access` does not count as defining
  // `.v2-no-access-title`, and vice versa.
  return new RegExp(`\\.${cls}(?![a-zA-Z0-9_-])`).test(css);
}

describe('v2-* classes rendered by @ronl/pa-cockpit are styled in both stylesheets', () => {
  it('finds exactly the classes it expects to find', () => {
    // Guards the guard. A parse that silently matched nothing would make the
    // coverage assertion below vacuous, and a regression to text-scanning would
    // reintroduce the phantom `v2-palette` from PACommandPalette.tsx's comment.
    expect([...renderedV2Classes().keys()].sort()).toEqual(EXPECTED_CLASSES);
  });

  it('has a rule in dashboard-pa.css and dashboard-v2.css for each', () => {
    const gaps: string[] = [];
    for (const [cls, files] of renderedV2Classes()) {
      if (EXEMPT.has(cls)) continue;
      const where = files.join(', ');
      if (!definesClass(PA_CSS, cls)) {
        gaps.push(
          `.${cls} (rendered by ${where}) has no rule in dashboard-pa.css — pa-demo would render it unstyled`
        );
      }
      if (!definesClass(FE_CSS, cls)) {
        gaps.push(
          `.${cls} (rendered by ${where}) has no rule in dashboard-v2.css — the caseworker host would render it unstyled`
        );
      }
    }
    expect(gaps, gaps.join('\n')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it passes on the untouched tree**

Run: `npx vitest run --no-file-parallelism src/pa-cockpit-class-coverage.test.ts --root packages/frontend`
Expected: `Tests  2 passed (2)`.

If the first test fails listing `v2-palette`, the extractor regressed to matching substrings or reading comments — fix that, do not add it to `EXPECTED_CLASSES`.

- [ ] **Step 3: Mutation-prove it**

```bash
cd /home/steven/Development/ronl-business-api
mkdir -p /tmp/covprobe
cp packages/pa-cockpit/src/components/PADashboardV2/PANoAccessPanel.tsx /tmp/covprobe/panel.tsx
cp packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css /tmp/covprobe/pa.css
cp packages/pa-cockpit/src/components/PADashboardV2/PACommandPalette.tsx /tmp/covprobe/palette.tsx
cp packages/frontend/src/pages/caseworker-v2/dashboard-v2.css /tmp/covprobe/fe.css

# Probe 1 (must go RED): a new class styled in only one sheet.
sed -i 's/className="v2-no-access-title"/className="v2-no-access-title v2-no-access-badge"/' \
  packages/pa-cockpit/src/components/PADashboardV2/PANoAccessPanel.tsx
printf '\n.cwd-v2 .v2-no-access-badge { color: red; }\n' \
  >> packages/frontend/src/pages/caseworker-v2/dashboard-v2.css
npx vitest run --no-file-parallelism src/pa-cockpit-class-coverage.test.ts --root packages/frontend
# Expected: FAIL — first test reports v2-no-access-badge as unexpected, second
# reports no rule in dashboard-pa.css. Both are correct; either alone proves it.
cp /tmp/covprobe/panel.tsx packages/pa-cockpit/src/components/PADashboardV2/PANoAccessPanel.tsx
cp /tmp/covprobe/fe.css packages/frontend/src/pages/caseworker-v2/dashboard-v2.css

# Probe 2 (must stay GREEN): themed values may differ.
sed -i 's/max-width: 60ch;/max-width: 55ch;/' packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css
npx vitest run --no-file-parallelism src/pa-cockpit-class-coverage.test.ts --root packages/frontend
# Expected: PASS. This is as load-bearing as the red probes — a guard that also
# enforced value equality would be red here, against a deliberate divergence.
cp /tmp/covprobe/pa.css packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css

# Probe 3 (must stay GREEN): a comment naming a class is not markup.
sed -i "s|reuses the same \`.cwd-v2-palette\*\`|reuses the same \`.cwd-v2-palette\*\` and \`v2-ghost-class\`|" \
  packages/pa-cockpit/src/components/PADashboardV2/PACommandPalette.tsx
npx vitest run --no-file-parallelism src/pa-cockpit-class-coverage.test.ts --root packages/frontend
# Expected: PASS. A text scan would report v2-ghost-class here.
cp /tmp/covprobe/palette.tsx packages/pa-cockpit/src/components/PADashboardV2/PACommandPalette.tsx

git status --porcelain packages/pa-cockpit packages/frontend/src/pages
# Expected: no output.
rm -rf /tmp/covprobe
```

- [ ] **Step 4: Run the workspace suite and the gates**

```bash
npm test --workspace=@ronl/frontend
npm test --workspace=@ronl/pa-cockpit
npm run type-check
npm run lint
npm run check-format
```

Expected: frontend `Tests 841 passed (841)` (839 before, plus 2); pa-cockpit `368 passed`; gates clean.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pa-cockpit-class-coverage.test.ts
git commit
```

Message: `test(frontend): require every v2-* class the cockpit renders to be styled in both sheets`. Body should say why the copies are required (pa-demo never loads dashboard-v2.css), why value equality is deliberately not asserted, why it parses rather than scans, and record all three probes — including that two of them must stay green.

---

### Task 3: Guard C — the demo's auth adapter

**Files:**

- Create: `packages/pa-demo/src/demo/pa-cockpit-host.auth.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

**Background the implementer needs.** `packages/pa-demo/src/demo/pa-cockpit-host.tsx:37-50` registers an auth adapter through `configurePaCockpit`, and nothing tests it. `packages/frontend/src/pages/pa-cockpit-host.test.ts` tests the equivalent adapter and is the model.

The two adapters differ in exactly two places, and **both differences are correct and must stay**:

|                 | `packages/frontend`                                                         | `packages/pa-demo`                                                            |
| --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `authenticated` | `!!keycloak.authenticated` — keycloak-js types it `authenticated?: boolean` | `keycloak.authenticated` — the shim is `authenticated: true`, already boolean |
| `updateToken`   | `keycloak.updateToken(minValidity ?? 0)` — keycloak-js requires a number    | `keycloak.updateToken(minValidity)` — the shim's parameter is optional        |

The `updateToken` assertion below is the one that would catch the demo silently acquiring the frontend's `?? 0`.

**Why a separate file** rather than extending `pa-cockpit-host.test.ts`: that file's mode-narrowing assertion is pa-demo's headline safety pin, and it should keep exercising an unmocked module graph. Vitest isolates modules per file, so a `vi.mock` here cannot reach it.

**The mock must supply three names.** `pa-cockpit-host.tsx:24` imports `keycloak, { getUser }`, and `DemoRoleContext.tsx:22` — reachable through `DemoSectionRouter` — imports `{ getUser, setDemoRoles }`. Omitting `setDemoRoles` breaks the import graph, not just the assertion.

`./shims/tenant` needs no mock: every export is a function and the module does nothing at import time.

Anything referenced inside a `vi.mock` factory must be created with `vi.hoisted` — `vi.mock` is hoisted above imports, so a plain `const` is in the temporal dead zone when the factory runs. The repo's writing-tests guide says the same.

- [ ] **Step 1: Write the failing test**

Create `packages/pa-demo/src/demo/pa-cockpit-host.auth.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getPaCockpitAuth } from '@ronl/pa-cockpit';

/**
 * Pins the demo's PaCockpitAuth adapter.
 *
 * Mirrors packages/frontend/src/pages/pa-cockpit-host.test.ts. Until this
 * existed, only the frontend's adapter was tested, and the demo's could drift
 * to the frontend's shape — or away from it — with nothing noticing.
 *
 * The two adapters differ in exactly two places and both differences are
 * CORRECT, not drift:
 *
 *   authenticated  frontend needs `!!` because keycloak-js types it
 *                  `authenticated?: boolean`; the shim is already `true`.
 *   updateToken    frontend needs `?? 0` because keycloak-js requires a
 *                  number; the shim's parameter is optional.
 *
 * The updateToken assertion below is what would catch this file silently
 * acquiring the frontend's `?? 0`.
 *
 * Separate from pa-cockpit-host.test.ts on purpose: that file's mode-narrowing
 * assertion is the demo's headline safety pin and should keep running against
 * an unmocked module graph. Vitest isolates modules per file, so the mock here
 * cannot reach it.
 */
const mockKeycloak = vi.hoisted(() => ({
  authenticated: true,
  token: '' as string | undefined,
  updateToken: vi.fn(),
}));
const mockGetUser = vi.hoisted(() => vi.fn());
const mockSetDemoRoles = vi.hoisted(() => vi.fn());

// setDemoRoles is not used by the adapter, but DemoRoleContext.tsx imports it
// and is reachable from the host through DemoSectionRouter. A factory that
// omits it breaks the import graph rather than one assertion.
vi.mock('./shims/keycloak', () => ({
  default: mockKeycloak,
  getUser: mockGetUser,
  setDemoRoles: mockSetDemoRoles,
}));

import keycloak from './shims/keycloak';
// Side-effecting import: registers the host with @ronl/pa-cockpit via
// configurePaCockpit() at module scope, exactly once for this test file.
import './pa-cockpit-host';

describe('the demo pa-cockpit auth adapter', () => {
  it('reads authenticated through to the shim rather than snapshotting it', () => {
    mockKeycloak.authenticated = true;
    expect(getPaCockpitAuth().authenticated).toBe(true);

    mockKeycloak.authenticated = false;
    expect(getPaCockpitAuth().authenticated).toBe(false);
  });

  it('reads the token at call time, not at module load', () => {
    // A plain `token: keycloak.token` passes every other assertion here and
    // then serves a value frozen at import — the same trap the frontend's
    // adapter comment calls out.
    const before = getPaCockpitAuth().token;
    keycloak.token = 'demo-token';
    expect(getPaCockpitAuth().token).not.toBe(before);
    expect(getPaCockpitAuth().token).toBe('demo-token');
  });

  it('delegates getUser to the shim', () => {
    getPaCockpitAuth().getUser();
    expect(mockGetUser).toHaveBeenCalled();
  });

  it('passes minValidity through unchanged, including when omitted', async () => {
    // Deliberately NOT the frontend's `?? 0`. The shim's parameter is
    // optional, so the demo forwards exactly what it was given; if this file
    // ever grows the frontend's default, this assertion fails.
    mockKeycloak.updateToken.mockResolvedValue(false);

    await getPaCockpitAuth().updateToken();
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(undefined);

    await getPaCockpitAuth().updateToken(30);
    expect(mockKeycloak.updateToken).toHaveBeenCalledWith(30);
  });
});
```

- [ ] **Step 2: Run it and confirm it passes**

Run: `npx vitest run --no-file-parallelism src/demo/pa-cockpit-host.auth.test.ts --root packages/pa-demo`
Expected: `Tests  4 passed (4)`.

If it fails with a TDZ / "cannot access before initialization" error, a `const` referenced in the `vi.mock` factory was not wrapped in `vi.hoisted`.

- [ ] **Step 3: Mutation-prove it**

```bash
cd /home/steven/Development/ronl-business-api
mkdir -p /tmp/authprobe
cp packages/pa-demo/src/demo/pa-cockpit-host.tsx /tmp/authprobe/host.tsx

# Probe 1: snapshot the token instead of reading it through a getter
python3 - <<'PY'
import pathlib
p = pathlib.Path('packages/pa-demo/src/demo/pa-cockpit-host.tsx')
s = p.read_text()
s = s.replace("      get token() {\n        return keycloak.token;\n      },", "      token: keycloak.token,")
p.write_text(s)
PY
npx vitest run --no-file-parallelism src/demo/pa-cockpit-host.auth.test.ts --root packages/pa-demo
# Expected: FAIL on "reads the token at call time"
cp /tmp/authprobe/host.tsx packages/pa-demo/src/demo/pa-cockpit-host.tsx

# Probe 2: give the demo the frontend's `?? 0`
sed -i 's/keycloak.updateToken(minValidity)/keycloak.updateToken(minValidity ?? 0)/' \
  packages/pa-demo/src/demo/pa-cockpit-host.tsx
npx vitest run --no-file-parallelism src/demo/pa-cockpit-host.auth.test.ts --root packages/pa-demo
# Expected: FAIL on "passes minValidity through unchanged" — called with 0, expected undefined
cp /tmp/authprobe/host.tsx packages/pa-demo/src/demo/pa-cockpit-host.tsx

git status --porcelain packages/pa-demo/src/demo/pa-cockpit-host.tsx
# Expected: no output.
rm -rf /tmp/authprobe
```

- [ ] **Step 4: Run the workspace suite and the gates**

```bash
npm test --workspace=@ronl/pa-demo
npm run type-check
npm run lint
npm run check-format
```

Expected: pa-demo `Tests 103 passed (103)` (97 baseline + 2 from Task 1 + 4 here); gates clean.

- [ ] **Step 5: Commit**

```bash
git add packages/pa-demo/src/demo/pa-cockpit-host.auth.test.ts
git commit
```

Message: `test(pa-demo): pin the demo's auth adapter, including where it correctly differs`. Body should state that the two differences from the frontend's adapter are correct rather than drift, why the file is separate from `pa-cockpit-host.test.ts`, why the mock supplies `setDemoRoles`, and both probe results.

---

### Task 4: The two comment corrections

**Files:**

- Modify: `packages/pa-cockpit/src/components/PADashboardV2/PACommandPalette.tsx:6-7`
- Modify: `packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css` (at the `.v2-changelog-btn` block, currently line 139, and the `.v2-no-access` block, currently line 1139)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on.

**Background the implementer needs.** `PACommandPalette.tsx:6-7` currently reads:

```
 * Mirrors the caseworker CommandPalette; reuses the same `.cwd-v2-palette*`
 * styles (kept global) plus the `.pac-palette*` skin in dashboard-pa.css.
```

That is false. The component renders `pac-palette-overlay`, `pac-palette`, `pal-empty`, `label`, `mode` and `pal-hint` — nothing else — and `dashboard-pa.css:1050-1082` defines all of them, including the inner `.label`, `.mode`, `.pal-empty` and `.pal-hint`. It reuses nothing from the caseworker stylesheet. The claim is the same defect class as the `v2-main-pad` comments corrected in `7196730`, and worse in effect: it tells a reader that pa-demo depends on a stylesheet pa-demo never loads.

- [ ] **Step 1: Correct the palette header**

Replace lines 6-7 of `packages/pa-cockpit/src/components/PADashboardV2/PACommandPalette.tsx`:

```
 * Mirrors the caseworker CommandPalette; reuses the same `.cwd-v2-palette*`
 * styles (kept global) plus the `.pac-palette*` skin in dashboard-pa.css.
```

with:

```
 * Mirrors the caseworker CommandPalette in behaviour, but shares none of its
 * CSS: every class here is `.pac-palette*`, fully defined at
 * dashboard-pa.css:1050-1082 including the inner .label, .mode, .pal-empty and
 * .pal-hint. It depends on no caseworker stylesheet, which is what lets it
 * render correctly in packages/pa-demo — a workspace that never loads
 * dashboard-v2.css at all. An earlier version of this comment claimed it
 * reused `.cwd-v2-palette*` "kept global"; that was never true and implied a
 * dependency the demo could not satisfy.
```

- [ ] **Step 2: Add the counterpart note to `dashboard-pa.css`**

Immediately above `.pac .v2-changelog-btn` (currently line 139), insert:

```css
/* ── Changelog button ────────────────────────────────────────
   Counterpart: `.cwd-v2 .v2-changelog-btn` (packages/frontend
   caseworker-v2/dashboard-v2.css:158). Byte-identical today, and required
   rather than redundant: packages/pa-demo never imports dashboard-v2.css, so
   without this copy the demo renders the button unstyled.

   The values are free to diverge — packages/frontend's
   src/pa-cockpit-class-coverage.test.ts enforces that every v2-* class a
   package component renders has a rule in BOTH stylesheets, and deliberately
   does not compare declarations. `.v2-no-access` below has already used that
   freedom. */
```

And extend the existing comment above `.pac .v2-no-access` (currently line 1139) so it names the guard. It currently reads:

```
   Mirrors the caseworker `.v2-no-access` styles. If dashboard-v2.css is
   already loaded these are redundant; kept here so the PA cockpit renders
   the panel correctly even when loaded standalone. Scoped under .pac. */
```

Replace with:

```
   Mirrors the caseworker `.v2-no-access` styles (dashboard-v2.css:457-490).
   Not redundant: packages/pa-demo never imports dashboard-v2.css, so this copy
   is the only thing styling the panel there. Scoped under .pac.

   These values have deliberately diverged from the caseworker set — --pac-*
   tokens rather than --v2-*, 60ch rather than 520px, and a border-left accent.
   That is allowed: packages/frontend's src/pa-cockpit-class-coverage.test.ts
   requires only that every class name exists in both stylesheets, never that
   the declarations match. Adding a class here means adding it there too. */
```

- [ ] **Step 3: Verify nothing broke and the coverage guard still passes**

```bash
npx vitest run --no-file-parallelism src/pa-cockpit-class-coverage.test.ts --root packages/frontend
npm test --workspace=@ronl/pa-cockpit
npm run type-check
npm run lint
npm run check-format
```

Expected: coverage guard `Tests 2 passed (2)`; pa-cockpit `368 passed`; gates clean. These are comment-only edits, so any failure means a comment delimiter was mistyped.

- [ ] **Step 4: Commit**

```bash
git add packages/pa-cockpit/src/components/PADashboardV2/PACommandPalette.tsx \
        packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css
git commit
```

Message: `docs(pa-cockpit): correct the palette's CSS claim and name the guard on the v2-* copies`. Body should state what the palette actually renders and where those rules live, why the old claim was worse than merely wrong, and that the stylesheet notes now point at the guard that enforces name coverage while permitting divergence.

---

### Task 5: Close item 4 in the follow-ups list

**Files:**

- Modify: `docs/superpowers/plans/2026-08-27-pa-cockpit-follow-ups.md` (the `## 4. Duplication the branch did not reach` entry)

**Interfaces:**

- Consumes: the outcomes of Tasks 1-4.
- Produces: nothing.

- [ ] **Step 1: Add the Done marker**

Insert a blockquote directly under the `## 4.` heading, in the same shape as items 1, 2 and 9, recording:

- that three of the four are **required** copies, not decay — `packages/pa-demo` never imports `dashboard-v2.css`, so the package must carry its own rules or the demo renders unstyled;
- that 4b was **not duplication**: both adapter differences are correct for their side, and the real gap was that only the frontend's adapter had a test;
- the **fifth item** found during design — `PACommandPalette.tsx:6-7`'s false `.cwd-v2-palette*` claim;
- the three rejected alternatives with their one-line reasons (shared `brand.css` reverses `pa-demo/src/index.css:1-16`; a shared token module couples ESM configs to a CommonJS build; CSS consolidation inverts ownership);
- the guards added, and that Guard B deliberately does not assert value equality;
- the probe results, **including the two that must stay green**.

- [ ] **Step 2: Format and commit**

```bash
npx prettier --write docs/superpowers/plans/2026-08-27-pa-cockpit-follow-ups.md
npm run check-format
git add docs/superpowers/plans/2026-08-27-pa-cockpit-follow-ups.md
git commit
```

Message: `docs: close follow-up item 4`.

---

## Final verification

After Task 5, run the whole suite and every gate:

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

Expected totals: backend 1576, frontend 841, pa-cockpit 368, pa-demo 103, public-site 140 — **3,028**, up from 3,020 by the eight assertions this plan adds.

If a test fails inside a full run, re-run it in isolation before concluding anything: a parallel-only failure may be contention rather than a defect. Use `npm run test:serial --workspace=@ronl/<name>` — `--no-file-parallelism` is Vitest-only and the backend is Jest.

Do not merge or push. Report the branch state and stop.
