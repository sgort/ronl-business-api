import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import postcss from 'postcss';

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
/** Flevoland IT's delivery (#374): tokens loaded through TOKENS_CSS, base styles not yet. */
const FLEVOLAND_TOKENS_CSS = join(SHARED_ROOT, 'styles', 'flevoland', 'tokens.css');
const FLEVOLAND_BASE_CSS = join(SHARED_ROOT, 'styles', 'flevoland', 'base.css');
const COCKPIT_SRC = dirname(require_.resolve('@ronl/pa-cockpit/styles.css'));
const FRONTEND_SRC = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(FRONTEND_SRC, '..', '..', '..');

/** The stylesheets that may use tokens: every package that renders the RBA palette. */
const CSS_ROOTS = [FRONTEND_SRC, COCKPIT_SRC, join(REPO_ROOT, 'packages', 'pa-demo', 'src')];

/** The token names the file must define. Pinned so a broken extractor cannot pass. */
const EXPECTED_TOKENS = [
  '--rba-accent',
  '--rba-accent-fill',
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
  '--rba-ink-inverse',
  '--rba-ok',
  '--rba-on-accent-fill',
  '--rba-paper',
  '--rba-rule',
  '--rba-rule-2',
  '--rba-warn',
  '--rba-warn-fill',
];

/** The rule for Flevoland's colours (#374, step 1); the only tenant rule allowed. */
const FLEVOLAND_SELECTOR = ':root[data-tenant="flevoland"]';

/** Flevoland's palette tokens; the Flevoland block must use their semantic tokens instead. */
const FLEVOLAND_PALETTE =
  /^--flevoland-color-(blue|yellow|neutral|red|green|orange|cyan|purple)-\d+$/;

/** The one palette reference allowed: Flevoland's file has no semantic token for an inactive state. */
const PALETTE_EXCEPTIONS: Record<string, string> = {
  '--rba-idle': 'var(--flevoland-color-neutral-400)',
};

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function definedTokens(css: string): string[] {
  return [...stripComments(css).matchAll(/(--rba-[\w-]+)\s*:/g)].map((m) => m[1]);
}

/** Custom properties declared directly in the rules with exactly this selector, in order. */
function ruleDecls(css: string, selector: string): [string, string][] {
  const out: [string, string][] = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector !== selector) return;
    rule.each((node) => {
      if (node.type === 'decl' && node.prop.startsWith('--'))
        out.push([node.prop, node.value.trim()]);
    });
  });
  return out;
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
  const rootTokens = ruleDecls(tokensCss, ':root').map(([name]) => name);
  const defined = new Set(rootTokens);

  it('the token file defines exactly the expected tokens', () => {
    expect([...defined].sort()).toEqual(EXPECTED_TOKENS);
  });

  it('defines every token once', () => {
    expect(rootTokens).toHaveLength(defined.size);
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

describe('Flevoland tokens', () => {
  const SHARED_STYLES = join(SHARED_ROOT, 'styles');

  it("the shared token file imports Flevoland's tokens first", () => {
    const css = stripComments(readFileSync(TOKENS_CSS, 'utf8'));
    const importAt = css.search(/^@import '\.\/flevoland\/tokens\.css';$/m);
    expect(importAt).toBeGreaterThanOrEqual(0);
    expect(importAt).toBeLessThan(css.indexOf(':root'));
  });

  it("Flevoland's token file defines only --flevoland-* on :root", () => {
    const css = stripComments(readFileSync(FLEVOLAND_TOKENS_CSS, 'utf8'));
    const names = [...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(100);
    expect(names.filter((n) => !n.startsWith('--flevoland-'))).toEqual([]);
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    expect(selectors).toEqual([':root']);
  });

  it("Flevoland's base styles are kept but loaded by nobody", () => {
    expect(statSync(FLEVOLAND_BASE_CSS).isFile()).toBe(true);
    const sources = [...CSS_ROOTS, SHARED_STYLES]
      .flatMap((dir) => sourceFiles(dir))
      // Tests name the path without loading it.
      .filter((file) => file !== FLEVOLAND_BASE_CSS && !/\.test\.tsx?$/.test(file));
    const loaders = sources.filter((file) =>
      stripComments(readFileSync(file, 'utf8')).includes('flevoland/base.css')
    );
    expect(loaders).toEqual([]);
  });

  it('every var(--flevoland-*) a stylesheet uses is defined', () => {
    const defined = new Set(
      [
        ...stripComments(readFileSync(FLEVOLAND_TOKENS_CSS, 'utf8')).matchAll(
          /(--flevoland-[\w-]+)\s*:/g
        ),
      ].map((m) => m[1])
    );
    const files = [...CSS_ROOTS.flatMap(cssFiles), TOKENS_CSS];
    const uses = files.flatMap((file) =>
      [...stripComments(readFileSync(file, 'utf8')).matchAll(/var\(\s*(--flevoland-[\w-]+)/g)].map(
        (m) => ({
          file: relative(REPO_ROOT, file).split('\\').join('/'),
          token: m[1],
        })
      )
    );
    expect(uses.length).toBeGreaterThan(10);
    expect(uses.filter((u) => !defined.has(u.token))).toEqual([]);
  });

  const overrides = ruleDecls(readFileSync(TOKENS_CSS, 'utf8'), FLEVOLAND_SELECTOR);

  it('the Flevoland block overrides only defined tokens, once each', () => {
    const names = overrides.map(([name]) => name);
    expect(names.length).toBeGreaterThan(10);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => !EXPECTED_TOKENS.includes(n))).toEqual([]);
  });

  it("the Flevoland block points only at Flevoland's semantic tokens", () => {
    const wrong = overrides.filter(([name, value]) => {
      if (PALETTE_EXCEPTIONS[name] === value) return false;
      const m = /^var\((--flevoland-color-[\w-]+)\)$/.exec(value);
      return !m || FLEVOLAND_PALETTE.test(m[1]);
    });
    expect(wrong).toEqual([]);
  });

  it('the Flevoland block is the only [data-tenant] rule in our stylesheets', () => {
    const files = [...CSS_ROOTS.flatMap(cssFiles), TOKENS_CSS];
    const selectors = files.flatMap((file) => {
      const found: string[] = [];
      postcss.parse(readFileSync(file, 'utf8')).walkRules((rule) => {
        if (rule.selector.includes('data-tenant')) found.push(rule.selector);
      });
      return found;
    });
    expect(selectors.length).toBeGreaterThan(0);
    expect(selectors.filter((sel) => sel !== FLEVOLAND_SELECTOR)).toEqual([]);
  });
});

/**
 * Accent and warning backgrounds (#374, step 1). For Flevoland the accent
 * fill is yellow with dark text and warning fills are yellow too, while small
 * markers keep pink or brown (yellow fails 3:1 there). So every background in
 * an accent or warning colour is a deliberate choice: either a -fill token,
 * with the text colour on it set in the same rule (inheriting white onto
 * yellow is the failure), or a marker listed here with its reason.
 */
const ACCENT_MARKERS: Record<string, string> = {
  '.cwd-v2 .cwp-st.running .cwp-st-dot': 'status dot, no text',
  '.cwd-v2 .cwp-st.gateway .cwp-st-dot': 'gateway diamond marker, no text',
  '.cwd-v2 .v2-taken-step.running::before': 'step marker, no text',
  '.cwd-v2 .bg-amber': 'legend dot in RegelSimulatie, no text',
  '.pbd .pb-prio.action': '12px priority dot',
  '.pbd .pb-prio.geel, .pbd .pb-prio.risk': '12px priority dot',
  '.pbd .pb-health.geel': '9px health dot',
  '.lcp .wdot.geel': 'status dot',
  '.wood .w-led.geel': 'status light, no text',
  '.pac .pac-rail-live': '7px live dot',
  '.pac .pac-prog-fill': 'thin progress bar',
  '.pac .pac-ritme-col li::before': '6px bullet',
  '.pac .pac-ag-live.soon .pac-ag-live-dot': 'live dot',
  '.pac .pac-cspec .cs-lg .sw.man': 'legend swatch',
  '.pac .pac-cspec-flow .side-chain .chain-conn': '2px connector line',
  '.pac .pac-cspec-flow .arm': '2px connector line',
};

/** A plain accent or warning colour (not a tint, not a -fill token). */
const ACCENT_OR_WARN =
  /^var\(--(rba-accent|v2-accent|pac-accent|rba-warn|pb-amber|v2-amber|w-amber)\s*[,)]/;

describe('accent and warning backgrounds', () => {
  const rules = CSS_ROOTS.flatMap(cssFiles).flatMap((file) => {
    const found: { selector: string; background: string; color: string | null }[] = [];
    postcss.parse(readFileSync(file, 'utf8')).walkRules((rule) => {
      const decls = rule.nodes.filter((n) => n.type === 'decl') as postcss.Declaration[];
      const color = decls.find((d) => d.prop === 'color')?.value ?? null;
      for (const d of decls) {
        if (d.prop === 'background' || d.prop === 'background-color') {
          found.push({
            selector: rule.selector.replace(/\s+/g, ' '),
            background: d.value.trim(),
            color,
          });
        }
      }
    });
    return found;
  });

  it('every plain accent or warning background is a listed marker', () => {
    const plain = rules.filter((r) => ACCENT_OR_WARN.test(r.background));
    expect(plain.length).toBeGreaterThan(5);
    expect(plain.map((r) => r.selector).filter((s) => !(s in ACCENT_MARKERS))).toEqual([]);
  });

  it('every listed marker still exists', () => {
    const selectors = new Set(rules.map((r) => r.selector));
    expect(Object.keys(ACCENT_MARKERS).filter((s) => !selectors.has(s))).toEqual([]);
  });

  const STATE = /:(hover|focus|focus-visible|active)$/;
  // A -fill token as the background; --rba-on-accent-fill is the text colour, not a fill.
  const fills = rules.filter((r) =>
    /var\(--(?![\w-]*on-accent)[\w-]*-fill(-d)?\b/.test(r.background)
  );

  it('every accent or warning fill sets the text colour on it in the same rule', () => {
    expect(fills.length).toBeGreaterThan(10);
    expect(
      fills
        .filter((r) => !STATE.test(r.selector))
        .filter((r) => !r.color || !r.color.includes('on-accent-fill'))
        .map((r) => r.selector)
    ).toEqual([]);
  });

  // A :hover rule outranks variant classes (.pac-btn:hover beats .pac-btn-ghost),
  // so a text colour there would override every variant's own; the base rule
  // already sets it.
  it('a hover or focus state of a fill takes its text colour from the base rule', () => {
    const states = fills.filter((r) => STATE.test(r.selector));
    expect(states.filter((r) => r.color !== null).map((r) => r.selector)).toEqual([]);
    const base = new Map(rules.map((r) => [r.selector, r.color]));
    expect(
      states
        .filter((r) => !base.get(r.selector.replace(STATE, ''))?.includes('on-accent-fill'))
        .map((r) => r.selector)
    ).toEqual([]);
  });

  // The pulsing dot sits on the yellow live badge; white would be 1.6:1 there.
  it('the live dot on the live badge takes the text colour on the fill', () => {
    const dot = rules.find((r) => r.selector === '.pac .pac-ag-live-dot');
    expect(dot?.background).toBe('var(--rba-on-accent-fill)');
  });
});

/** Stylesheets and TS sources: anything that could load a stylesheet. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(css|tsx?)$/.test(name) ? [path] : [];
  });
}
