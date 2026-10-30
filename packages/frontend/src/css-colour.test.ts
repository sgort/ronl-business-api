import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
// @ts-expect-error -- plain ESM script outside the workspace, no types
import * as colour from '../../../scripts/css-colour/colour.mjs';
// @ts-expect-error -- plain ESM script outside the workspace, no types
import * as equivalence from '../../../scripts/css-colour/check-equivalence.mjs';

/**
 * The colour maths behind the equivalence check and the Flevoland contrast
 * test (#374, step 1). The scripts live in scripts/css-colour; the tests live
 * here so CI runs them with the frontend suite.
 */
type Rgba = { r: number; g: number; b: number; a: number };
const { parseColour, mixSrgb, contrastRatio, deltaE2000, deltaE2000Lab, resolveValue } = colour as {
  parseColour(text: string): Rgba | null;
  mixSrgb(c1: Rgba, p1: number | null, c2: Rgba, p2: number | null): Rgba;
  contrastRatio(fg: Rgba, bg: Rgba): number;
  deltaE2000(c1: Rgba, c2: Rgba): number;
  deltaE2000Lab(l1: number[], l2: number[]): number;
  resolveValue(value: string, env: Map<string, string>): { colours: Rgba[]; rest: string } | null;
};
const { compareStylesheets, collectEnv, defaultTargets, tenantThemes } = equivalence as {
  compareStylesheets(args: {
    before: string;
    after: string;
    envsBefore: Record<string, Map<string, string>>;
    envsAfter: Record<string, Map<string, string>>;
  }): { selector: string; prop: string; env: string; kind: string; detail: string }[];
  collectEnv(cssTexts: string[], tenantTheme: Record<string, string> | null): Map<string, string>;
  defaultTargets(changed: string[]): string[];
  tenantThemes(json: unknown): Record<string, Record<string, string> | null>;
};

const c = (text: string) => parseColour(text) as Rgba;

describe('parseColour', () => {
  it('reads hex in all four lengths', () => {
    expect(c('#0046ad')).toEqual({ r: 0, g: 70, b: 173, a: 1 });
    expect(c('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(c('#0046ad1a').a).toBeCloseTo(0.102, 3);
    expect(c('#0008').a).toBeCloseTo(0.533, 3);
  });

  it('reads rgb() and rgba() in comma and space syntax', () => {
    expect(c('rgba(0, 70, 173, .5)')).toEqual({ r: 0, g: 70, b: 173, a: 0.5 });
    expect(c('rgb(0 70 173 / 50%)')).toEqual({ r: 0, g: 70, b: 173, a: 0.5 });
  });

  it('reads the named colours we use and rejects the rest', () => {
    expect(c('transparent').a).toBe(0);
    expect(c('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(c('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColour('banana')).toBeNull();
  });
});

describe('mixSrgb', () => {
  it('mixes a colour with transparent into an alpha', () => {
    const m = mixSrgb(c('#0046ad'), 10, c('transparent'), null);
    expect(m.r).toBeCloseTo(0);
    expect(m.g).toBeCloseTo(70);
    expect(m.b).toBeCloseTo(173);
    expect(m.a).toBeCloseTo(0.1);
  });

  it('defaults to 50/50', () => {
    const m = mixSrgb(c('#000'), 50, c('#fff'), null);
    expect(m.r).toBeCloseTo(127.5, 0);
    expect(m.a).toBe(1);
  });

  it('scales alpha when the percentages sum below 100', () => {
    expect(mixSrgb(c('#ff0000'), 30, c('#0000ff'), 30).a).toBeCloseTo(0.6);
  });
});

describe('contrastRatio', () => {
  it('matches WCAG for the Flevoland colours', () => {
    expect(contrastRatio(c('#fec612'), c('#ffffff'))).toBeCloseTo(1.6, 1);
    expect(contrastRatio(c('#212121'), c('#fec612'))).toBeGreaterThanOrEqual(10);
    expect(contrastRatio(c('#757575'), c('#ffffff'))).toBeCloseTo(4.6, 1);
    expect(contrastRatio(c('#757575'), c('#f8f8f8'))).toBeCloseTo(4.3, 1);
    expect(contrastRatio(c('#ffffff'), c('#ffffff'))).toBe(1);
  });
});

describe('deltaE2000', () => {
  it('is zero for identical colours', () => {
    expect(deltaE2000(c('#1f2937'), c('#1f2937'))).toBe(0);
  });

  it('matches the Sharma et al. (2005) reference pair', () => {
    expect(deltaE2000Lab([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
  });

  it('puts a one-step change of a dark grey below 1.0', () => {
    expect(deltaE2000(c('#1f2937'), c('#202937'))).toBeLessThan(1);
    expect(deltaE2000(c('#1f2937'), c('#0c1c47'))).toBeGreaterThan(1);
  });
});

describe('resolveValue', () => {
  it('follows var() chains and fallbacks and keeps the rest of the value', () => {
    const env = new Map([['--a', 'var(--b, #e5e7eb)']]);
    const r = resolveValue('1px solid var(--a)', env);
    expect(r?.colours).toEqual([c('#e5e7eb')]);
    expect(r?.rest).toBe('1px solid <c>');
  });

  it('evaluates color-mix()', () => {
    const env = new Map([['--brand', '#0046ad']]);
    const r = resolveValue('color-mix(in srgb, var(--brand) 10%, transparent)', env);
    expect(r?.colours[0].a).toBeCloseTo(0.1);
    expect(r?.rest).toBe('<c>');
  });

  it('gives up on a cycle or an undefined var without fallback', () => {
    expect(resolveValue('var(--a)', new Map([['--a', 'var(--a)']]))).toBeNull();
    expect(resolveValue('var(--missing)', new Map())).toBeNull();
  });
});

describe('compareStylesheets', () => {
  const env = (entries: Record<string, string>) => ({ none: new Map(Object.entries(entries)) });

  it('a hex replaced by a token with the same value passes', () => {
    const e = env({ '--rba-ink': '#1f2937' });
    expect(
      compareStylesheets({
        before: '.x { color: #1f2937; }',
        after: '.x { color: var(--rba-ink); }',
        envsBefore: e,
        envsAfter: e,
      })
    ).toEqual([]);
  });

  it('a colour beyond ΔE 1.0 fails', () => {
    const f = compareStylesheets({
      before: '.x { color: #1f2937; }',
      after: '.x { color: #0c1c47; }',
      envsBefore: env({}),
      envsAfter: env({}),
    });
    expect(f.map((x) => x.kind)).toEqual(['changed']);
  });

  it('a colour within ΔE 1.0 passes', () => {
    expect(
      compareStylesheets({
        before: '.x { border: 1px solid #1f2937; }',
        after: '.x { border: 1px solid #202937; }',
        envsBefore: env({}),
        envsAfter: env({}),
      })
    ).toEqual([]);
  });

  it('themed token in place of a fixed hex fails for another tenant', () => {
    const tokens = ':root { --rba-brand: var(--color-primary, #0046ad); }';
    const envs = {
      none: collectEnv([tokens], null),
      heusden: collectEnv([tokens], { primary: '#00689d' }),
    };
    const f = compareStylesheets({
      before: '.x { color: #0046ad; }',
      after: '.x { color: var(--rba-brand); }',
      envsBefore: envs,
      envsAfter: envs,
    });
    expect(f.map((x) => [x.env, x.kind])).toEqual([['heusden', 'changed']]);
  });

  it('rules under [data-tenant] are ignored for the env', () => {
    const before = collectEnv([':root { --rba-ink: #1f2937; }'], null);
    const after = collectEnv(
      [':root { --rba-ink: #1f2937; } :root[data-tenant="flevoland"] { --rba-ink: #0c1c47; }'],
      null
    );
    expect(after.get('--rba-ink')).toBe('#1f2937');
    expect(
      compareStylesheets({
        before: '.x { color: var(--rba-ink); }',
        after: '.x { color: var(--rba-ink); }',
        envsBefore: { none: before },
        envsAfter: { none: after },
      })
    ).toEqual([]);
  });

  it('an added or removed declaration is reported', () => {
    const f = compareStylesheets({
      before: '.x { color: #fff; } .y { margin: 0; }',
      after: '.x { color: #fff; background: #000; }',
      envsBefore: env({}),
      envsAfter: env({}),
    });
    expect(f.map((x) => `${x.kind} ${x.selector} ${x.prop}`).sort()).toEqual([
      'added .x background',
      'removed .y margin',
    ]);
  });

  it('a new custom property or a [data-tenant] rule is not a finding', () => {
    // A new variable changes nothing until something uses it, and uses are
    // compared resolved; a [data-tenant] rule never applies to other tenants.
    expect(
      compareStylesheets({
        before: ':root { --a: #fff; }',
        after:
          ':root { --a: #fff; --a-fill: var(--a); } :root[data-tenant="flevoland"] { --a: #000; } :root[data-tenant="flevoland"] .x { color: red; }',
        envsBefore: env({}),
        envsAfter: env({}),
      })
    ).toEqual([]);
  });

  it('a new custom property that redefines an existing name is reported', () => {
    // e.g. a new `.pbd { --v2-accent: … }` would recolour that scope only,
    // which the flattened environment cannot see.
    const f = compareStylesheets({
      before: '.x { color: var(--a); }',
      after: '.pbd { --a: #000; } .x { color: var(--a); }',
      envsBefore: { none: new Map([['--a', '#fff']]) },
      envsAfter: { none: new Map([['--a', '#fff']]) },
    });
    expect(f.map((x) => `${x.kind} ${x.selector} ${x.prop}`)).toEqual(['added .pbd --a']);
  });

  it('checks every enabled tenant, Flevoland included, and no disabled one', () => {
    // Flevoland too: without data-tenant (the [data-tenant] rules never enter
    // an environment) its colours must not move either, until the marker is on.
    const themes = tenantThemes({
      tenants: {
        flevoland: { enabled: true, theme: { primary: '#0046ad' } },
        heusden: { enabled: true, theme: { primary: '#00689d' } },
        oldtown: { enabled: false, theme: { primary: '#000000' } },
      },
    });
    expect(themes).toEqual({
      none: null,
      flevoland: { primary: '#0046ad' },
      heusden: { primary: '#00689d' },
    });
  });

  it('an environment missing on one side is skipped, not a crash', () => {
    expect(
      compareStylesheets({
        before: '.x { color: var(--a, #fff); }',
        after: '.x { color: var(--a, #fff); }',
        envsBefore: { none: new Map() },
        envsAfter: { none: new Map(), newtown: new Map() },
      })
    ).toEqual([]);
  });

  it('the default file list leaves out stylesheets nobody loads', () => {
    expect(
      defaultTargets([
        'packages/shared/styles/flevoland/base.css',
        'packages/shared/styles/tokens.css',
        'packages/frontend/src/App.tsx',
      ])
    ).toEqual(['packages/shared/styles/tokens.css']);
  });

  it('two fully transparent colours are equal, whatever their rgb', () => {
    expect(
      compareStylesheets({
        before: '.x { --g: rgb(37 99 235 / 0); }',
        after: '.x { --g: rgb(255 255 255 / 0); }',
        envsBefore: env({}),
        envsAfter: env({}),
      })
    ).toEqual([]);
  });

  it('a non-colour change is reported as changed', () => {
    const f = compareStylesheets({
      before: '.x { border: 1px solid #fff; }',
      after: '.x { border: 2px solid #fff; }',
      envsBefore: env({}),
      envsAfter: env({}),
    });
    expect(f.map((x) => x.kind)).toEqual(['changed']);
  });
});

// ------------------------------------------------------------------
// The Flevoland mapping (#374, step 1): the colours a Flevoland user gets.

const require_ = createRequire(import.meta.url);
const SHARED_STYLES = join(dirname(require_.resolve('@ronl/shared/package.json')), 'styles');
const TOKENS_CSS = readFileSync(join(SHARED_STYLES, 'tokens.css'), 'utf8');
const FLEVOLAND_TOKENS_CSS = readFileSync(join(SHARED_STYLES, 'flevoland', 'tokens.css'), 'utf8');
const TENANTS = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'tenants.json'),
    'utf8'
  )
);

/** What :root resolves to with data-tenant="flevoland" and Flevoland's theme applied. */
function flevolandEnv(): Map<string, string> {
  const env = collectEnv([FLEVOLAND_TOKENS_CSS, TOKENS_CSS], TENANTS.tenants.flevoland.theme);
  postcss.parse(TOKENS_CSS).walkRules(':root[data-tenant="flevoland"]', (rule) => {
    rule.walkDecls((decl) => {
      env.set(decl.prop, decl.value.trim());
    });
  });
  return env;
}

describe('Flevoland contrast', () => {
  const env = flevolandEnv();
  const token = (name: string) => {
    const r = resolveValue(`var(${name})`, env);
    expect(r?.colours, name).toHaveLength(1);
    return (r as { colours: Rgba[] }).colours[0];
  };
  const hex = (name: string) =>
    '#' +
    (['r', 'g', 'b'] as const)
      .map((k) => Math.round(token(name)[k]).toString(16).padStart(2, '0'))
      .join('');

  const TEXT = [
    '--rba-ink-strong',
    '--rba-ink',
    '--rba-ink-2',
    '--rba-ink-3',
    '--rba-ok',
    '--rba-bad',
    '--rba-warn',
  ];
  /** Status text on its own tint (and on cards, via TEXT_ON_CARDS below). */
  const STATUS_TEXT: Record<string, string[]> = {
    '--rba-ok-bg': ['--rba-ok-ink', '--rba-ok-ink-2', '--rba-ok-ink-3'],
    '--rba-warn-bg': ['--rba-warn-ink', '--rba-warn-ink-2', '--rba-warn-ink-3', '--rba-warn-ink-4'],
    '--rba-warn-bg-2': ['--rba-warn-ink'],
    '--rba-bad-bg': ['--rba-bad-ink', '--rba-bad-ink-2', '--rba-bad-ink-3', '--rba-bad-ink-4'],
  };
  const MARKERS = [
    '--rba-accent',
    '--rba-brand',
    '--rba-brand-d',
    '--rba-ok',
    '--rba-bad',
    '--rba-warn',
    '--rba-warn-ink-5',
    '--rba-warn-ink-6',
    '--rba-warn-ink-7',
  ];
  const FILLS = ['--rba-accent-fill', '--rba-warn-fill'];
  const BACKGROUNDS = ['--rba-paper', '--rba-bg'];
  /** Not held to a contrast floor, each for its own reason. */
  const EXEMPT: Record<string, string> = {
    '--rba-rule':
      'decorative separator; WCAG 1.4.11 does not apply to lines that carry no meaning alone',
    '--rba-rule-2': 'decorative separator, as --rba-rule',
    '--rba-idle': 'inactive state; exempt under WCAG 1.4.11',
    '--rba-ink-4':
      'disabled text: checked on --rba-paper only; on --rba-bg 4.3:1, exempt under WCAG 1.4.3',
    '--rba-ink-inverse': 'text on a brand or status fill; those fills are checked as markers',
    '--rba-flevoland-blue': 'equals --rba-brand for Flevoland',
    '--rba-flevoland-blue-d': 'equals --rba-brand-d for Flevoland',
    '--rba-flevoland-pink': 'equals --rba-accent for Flevoland',
    '--rba-ok-line': 'border of a status tint; decorative, the text inside carries the meaning',
    '--rba-warn-line': 'border of a status tint, as --rba-ok-line',
    '--rba-bad-line': 'border of a status tint, as --rba-ok-line',
    '--rba-warn-line-2': 'border of a status tint, as --rba-ok-line',
    '--rba-warn-bg-3': 'highlight behind --pac-ink text (a neutral ink, checked as text)',
  };

  it('text tokens reach 4.5:1 on the page and on cards', () => {
    for (const fg of TEXT) {
      for (const bg of BACKGROUNDS) {
        expect(contrastRatio(token(fg), token(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('marker tokens reach 3:1 on cards', () => {
    for (const fg of MARKERS) {
      expect(contrastRatio(token(fg), token('--rba-paper')), fg).toBeGreaterThanOrEqual(3);
    }
  });

  it('text on the accent and warning fills reaches 4.5:1', () => {
    for (const bg of FILLS) {
      expect(contrastRatio(token('--rba-on-accent-fill'), token(bg)), bg).toBeGreaterThanOrEqual(
        4.5
      );
    }
    expect(
      contrastRatio(token('--rba-on-warn-fill'), token('--rba-warn-fill'))
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('status text reaches 4.5:1 on its tint and on cards', () => {
    for (const [bg, inks] of Object.entries(STATUS_TEXT)) {
      for (const fg of inks) {
        expect(contrastRatio(token(fg), token(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(token(fg), token('--rba-paper')), fg).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('disabled text reaches 4.5:1 on cards', () => {
    expect(contrastRatio(token('--rba-ink-4'), token('--rba-paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('every token is checked or exempt with a reason', () => {
    const checked = new Set([
      ...TEXT,
      ...MARKERS,
      ...FILLS,
      ...BACKGROUNDS,
      ...Object.keys(STATUS_TEXT),
      ...Object.values(STATUS_TEXT).flat(),
      '--rba-on-accent-fill',
      '--rba-on-warn-fill',
    ]);
    const names = [...TOKENS_CSS.matchAll(/^\s*(--rba-[\w-]+)\s*:/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter((n) => !checked.has(n) && !(n in EXEMPT))).toEqual([]);
  });

  it('resolves to the agreed Flevoland values', () => {
    expect({
      ink: hex('--rba-ink'),
      bg: hex('--rba-bg'),
      brandD: hex('--rba-brand-d'),
      accent: hex('--rba-accent'),
      accentFill: hex('--rba-accent-fill'),
      onAccentFill: hex('--rba-on-accent-fill'),
      warn: hex('--rba-warn'),
      warnFill: hex('--rba-warn-fill'),
      idle: hex('--rba-idle'),
    }).toEqual({
      ink: '#0c1c47',
      bg: '#f8f8f8',
      brandD: '#003a8e',
      accent: '#e70077',
      accentFill: '#fec612',
      onAccentFill: '#212121',
      warn: '#85531a',
      warnFill: '#fec612',
      idle: '#bdbdbd',
    });
  });
});
