import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

/**
 * The shared design tokens (#374 item 3): every `var(--rba-*)` a stylesheet
 * uses must be defined in @ronl/shared's styles/tokens.css, and both hosts
 * must load that file.
 *
 * The failure this catches is silent. A misspelled custom property, or one
 * the token file never defined, is not a CSS error: the declaration falls back
 * to its inherited or initial value and the element just renders in the wrong
 * colour. The same goes for a host that forgets to load the token file — every
 * surface variable that points at a token goes blank in that host only.
 *
 * Reading sibling workspaces' stylesheets is a dev-time filesystem read, as in
 * pa-cockpit-class-coverage.test.ts; nothing reaches the bundle.
 */
const require_ = createRequire(import.meta.url);

const SHARED_ROOT = dirname(require_.resolve('@ronl/shared/package.json'));
const TOKENS_CSS = join(SHARED_ROOT, 'styles', 'tokens.css');
const COCKPIT_SRC = dirname(require_.resolve('@ronl/pa-cockpit/styles.css'));
const FRONTEND_SRC = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(FRONTEND_SRC, '..', '..', '..');

/** The stylesheets that may use tokens: every package that renders the RBA palette. */
const CSS_ROOTS = [FRONTEND_SRC, COCKPIT_SRC, join(REPO_ROOT, 'packages', 'pa-demo', 'src')];

/** The token names the file must define. Pinned so a broken extractor cannot pass. */
const EXPECTED_TOKENS = [
  '--rba-accent',
  '--rba-bad',
  '--rba-bg',
  '--rba-brand',
  '--rba-brand-d',
  '--rba-flevoland-blue',
  '--rba-flevoland-blue-d',
  '--rba-flevoland-pink',
  '--rba-idle',
  '--rba-ink',
  '--rba-ink-2',
  '--rba-ink-3',
  '--rba-ink-4',
  '--rba-ok',
  '--rba-paper',
  '--rba-rule',
  '--rba-rule-2',
  '--rba-warn',
];

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function definedTokens(css: string): string[] {
  return [...stripComments(css).matchAll(/(--rba-[\w-]+)\s*:/g)].map((m) => m[1]);
}

function usedTokens(css: string): string[] {
  return [...stripComments(css).matchAll(/var\(\s*(--rba-[\w-]+)/g)].map((m) => m[1]);
}

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith('.css') ? [path] : [];
  });
}

describe('extractors', () => {
  it('ignores tokens named in comments', () => {
    const css = '/* var(--rba-typo) and --rba-typo: red */ .a { color: var(--rba-ink); }';
    expect(usedTokens(css)).toEqual(['--rba-ink']);
    expect(definedTokens(css)).toEqual([]);
  });
});

describe('shared design tokens', () => {
  const tokensCss = readFileSync(TOKENS_CSS, 'utf8');
  const defined = new Set(definedTokens(tokensCss));

  it('the token file defines exactly the expected tokens', () => {
    expect([...defined].sort()).toEqual(EXPECTED_TOKENS);
  });

  it('defines every token once', () => {
    expect(definedTokens(tokensCss)).toHaveLength(defined.size);
  });

  it('every var(--rba-*) a stylesheet uses is defined in the token file', () => {
    const uses = CSS_ROOTS.flatMap(cssFiles).flatMap((file) =>
      usedTokens(readFileSync(file, 'utf8')).map((token) => ({
        file: relative(REPO_ROOT, file).split('\\').join('/'),
        token,
      }))
    );
    // The surfaces' own variables point at the tokens; finding none means the
    // extractor or CSS_ROOTS is broken, not that everything is fine.
    expect(uses.length).toBeGreaterThan(20);
    expect(uses.filter((u) => !defined.has(u.token))).toEqual([]);
  });

  it('the caseworker app loads the token file', () => {
    const app = readFileSync(join(FRONTEND_SRC, 'App.tsx'), 'utf8');
    expect(app).toMatch(/^import '@ronl\/shared\/styles\/tokens\.css';$/m);
  });

  it("the cockpit's stylesheet entry loads the token file, so pa-demo gets it too", () => {
    const entry = readFileSync(join(COCKPIT_SRC, 'styles.css'), 'utf8');
    expect(stripComments(entry)).toMatch(/^@import '@ronl\/shared\/styles\/tokens\.css';$/m);
  });
});
