import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss, { type Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';
// @ts-expect-error -- plain ESM script outside the workspace, no types
import { collectEnv, compareStylesheets } from '../../../scripts/css-colour/check-equivalence.mjs';
// @ts-expect-error -- plain JS config, no types
import config from '../tailwind.config.js';

/**
 * Tailwind's colour scales follow the tenant (#374, step 1). The scales point
 * at CSS variables whose defaults are Tailwind's own values, so every tenant
 * but Flevoland renders exactly as before; :root[data-tenant="flevoland"]
 * maps them onto Flevoland's colours by role.
 */
const SRC = dirname(fileURLToPath(import.meta.url));
const PALETTE_CSS = readFileSync(join(SRC, 'styles', 'tailwind-palette.css'), 'utf8');

const SCALES = ['gray', 'slate', 'red', 'green', 'blue', 'amber', 'orange', 'yellow'] as const;
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const PAIRS = SCALES.flatMap((scale) => SHADES.map((shade) => [scale, shade] as const));

function declarations(selector: string): Map<string, string> {
  const out = new Map<string, string>();
  postcss.parse(PALETTE_CSS).walkRules(selector, (rule) => {
    rule.walkDecls((d) => {
      out.set(d.prop, d.value.trim());
    });
  });
  return out;
}

describe('Tailwind palette', () => {
  const defaults = declarations(':root');
  const flevoland = declarations(':root[data-tenant="flevoland"]');

  it("defaults are Tailwind's own values", () => {
    const palette = colors as unknown as Record<string, Record<string, string>>;
    for (const [scale, shade] of PAIRS) {
      expect(defaults.get(`--twc-${scale}-${shade}`)?.toLowerCase(), `${scale}-${shade}`).toBe(
        palette[scale][shade].toLowerCase()
      );
    }
    expect(defaults.size).toBe(PAIRS.length);
  });

  it('the config maps every shade to its variable', () => {
    const configured = (config as { theme: { extend: { colors: Record<string, unknown> } } }).theme
      .extend.colors as Record<string, Record<string, string>>;
    for (const [scale, shade] of PAIRS) {
      expect(configured[scale]?.[shade], `${scale}-${shade}`).toBe(`var(--twc-${scale}-${shade})`);
    }
  });

  it("the Flevoland block covers every variable and points only at Flevoland's colour tokens", () => {
    expect([...flevoland.keys()].sort()).toEqual([...defaults.keys()].sort());
    for (const [name, value] of flevoland) {
      expect(value, name).toMatch(/^var\(--flevoland-color-[\w-]+\)$/);
    }
  });

  // The real proof that nothing changes for other tenants: compile the app's
  // Tailwind CSS with this config and with the scales left on Tailwind's own
  // values, and compare every declaration with the equivalence check. It
  // catches what a class-name scan cannot: opacity utilities and /alpha
  // modifiers in any form, defaults Tailwind derives from a colour (the ring
  // colour from blue-500), and classes built at runtime.
  it('the compiled Tailwind CSS is unchanged for other tenants', async () => {
    const root = join(SRC, '..');
    const extend = (config as { theme: { extend: Record<string, unknown> } }).theme.extend;
    const withContent = (extendWith: Record<string, unknown>): Config => ({
      ...config,
      content: (config as { content: string[] }).content.map((glob: string) => join(root, glob)),
      theme: { ...(config as { theme: object }).theme, extend: extendWith },
    });
    const { colors: extendColors, ...rest } = extend as { colors: Record<string, unknown> };
    const plainColors = Object.fromEntries(
      Object.entries(extendColors).filter(([name]) => !(SCALES as readonly string[]).includes(name))
    );
    const entry = readFileSync(join(SRC, 'index.css'), 'utf8');
    const compile = async (cfg: Config) =>
      (await postcss([tailwindcss(cfg)]).process(entry, { from: join(SRC, 'index.css') })).css;
    const plain = await compile(withContent({ ...rest, colors: plainColors }));
    const remapped = await compile(withContent(extend));

    // Tailwind's gradient positions are set per class; empty means none.
    const env = collectEnv([PALETTE_CSS], null);
    env.set('--tw-gradient-from-position', '');
    env.set('--tw-gradient-via-position', '');
    env.set('--tw-gradient-to-position', '');
    const envs = { none: env };
    const findings = compareStylesheets({
      before: plain,
      after: remapped,
      envsBefore: envs,
      envsAfter: envs,
    }).filter(
      // Tailwind drops its --tw-*-opacity helpers for var() colours; the
      // colours they fed are compared through their fallbacks.
      (f: { kind: string; prop: string }) =>
        !(f.kind === 'removed' && /^--tw-[\w-]*opacity$/.test(f.prop))
    );
    expect(remapped).toContain('var(--twc-gray-400)');
    expect(findings).toEqual([]);
  }, 60_000);

  // The legacy opacity utilities (bg-opacity-50) work on whatever colour the
  // element has, so the compiled comparison above cannot see one landing on a
  // remapped scale. The /alpha form (bg-white/75) is compiled per colour and is
  // covered there; the legacy form is not used.
  it('no legacy opacity utilities', () => {
    const tsx = execFileSync('git', ['ls-files', '*.ts', '*.tsx', 'index.html'], {
      cwd: join(SRC, '..'),
      encoding: 'utf8',
    })
      .split('\n')
      .filter((file) => file && !file.includes('.test.'));
    const uses = tsx.flatMap((file) =>
      [
        ...readFileSync(join(SRC, '..', file), 'utf8').matchAll(
          /\b(bg|text|border|divide|ring|placeholder)-opacity-\d+/g
        ),
      ].map((m) => `${file}: ${m[0]}`)
    );
    expect(uses).toEqual([]);
  });

  it('App loads the palette after the tokens', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
    const tokens = app.indexOf("import '@ronl/shared/styles/tokens.css';");
    const palette = app.indexOf("import './styles/tailwind-palette.css';");
    expect(tokens).toBeGreaterThanOrEqual(0);
    expect(palette).toBeGreaterThan(tokens);
  });
});
