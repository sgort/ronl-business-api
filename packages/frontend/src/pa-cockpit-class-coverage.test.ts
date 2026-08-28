import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  // Strip CSS comments before matching. Both stylesheets already narrate in
  // `/* ... */` comments — e.g. "Counterpart: `.cwd-v2 .v2-changelog-btn`"
  // and "Mirrors the caseworker `.v2-no-access` styles" — and a class named
  // only in that prose must not count as a rule, or deleting the real rule
  // while the comment survives would leave this guard green on the comment
  // alone. Same reason renderedV2Classes() reads only string/template
  // literals on the .tsx side rather than scanning raw text: comments
  // describe code, they are not code. CSS comments do not nest, so a
  // non-greedy global replace is exact, not just an approximation.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Negative lookahead so `.v2-no-access` does not count as defining
  // `.v2-no-access-title`, and vice versa.
  return new RegExp(`\\.${cls}(?![a-zA-Z0-9_-])`).test(withoutComments);
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

  it('does not count a class named only inside a CSS comment as defined', () => {
    // Pins the comment strip in definesClass(). Both stylesheets already
    // narrate real rules in prose comments — dashboard-pa.css says things
    // like "Counterpart: `.cwd-v2 .v2-changelog-btn`" and "Mirrors the
    // caseworker `.v2-no-access` styles" — so without the strip, deleting
    // the real rule while the comment survives would leave this guard green
    // on the comment alone. This fails if the `.replace(/\/\*[\s\S]*?\*\//g,
    // '')` line in definesClass() is removed, because the raw regex would
    // then match the class name inside the comment text below.
    const tmpDir = mkdtempSync(join(tmpdir(), 'pa-cockpit-class-coverage-'));
    const tmpCss = join(tmpDir, 'fixture.css');
    writeFileSync(
      tmpCss,
      '/* .v2-comment-only-class is documented here but never defined */\n' +
        '.v2-something-else { color: red; }\n'
    );
    expect(definesClass(tmpCss, 'v2-comment-only-class')).toBe(false);
  });
});
