import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The Keycloak login theme takes Flevoland's colours from a copy of their
 * token file (#400; design:
 * docs/superpowers/specs/2026-10-31-keycloak-theme-flevoland-colours-design.md).
 *
 * Keycloak serves the theme itself, outside our build, so the theme cannot
 * import from @ronl/shared. It carries a committed copy instead, written by
 * `npm run sync:keycloak-tokens`. These tests keep that copy equal to its
 * source, make sure the theme loads it before login.css, and check that
 * login.css only uses tokens the copy defines — an undefined custom property
 * is not a CSS error, the colour just silently drops out.
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCE = join(REPO, 'packages/shared/styles/flevoland/tokens.css');
const THEME = join(REPO, 'keycloak-themes/ronl/login');
const COPY = join(THEME, 'resources/css/flevoland-tokens.css');
const LOGIN_CSS = join(THEME, 'resources/css/login.css');
const THEME_PROPERTIES = join(THEME, 'theme.properties');

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

/** Custom properties a stylesheet uses through var(). */
const used = (css: string) =>
  new Set([...css.matchAll(/var\(\s*(--flevoland-[\w-]+)/g)].map((m) => m[1]));

/** Custom properties a stylesheet defines. */
const defined = (css: string) =>
  new Set([...css.matchAll(/(--flevoland-[\w-]+)\s*:/g)].map((m) => m[1]));

/** Flevoland's palette names (section 1a of their file): a hue and a shade. */
const PALETTE = /^--flevoland-color-(blue|yellow|neutral|red|green|orange|cyan|purple)-\d+$/;

describe('Keycloak login theme', () => {
  it('carries an unchanged copy of the Flevoland token file', () => {
    expect(
      read(COPY) === read(SOURCE),
      'keycloak-themes/ronl/login/resources/css/flevoland-tokens.css differs from ' +
        'packages/shared/styles/flevoland/tokens.css: run `npm run sync:keycloak-tokens`'
    ).toBe(true);
  });

  it('loads the token copy before login.css', () => {
    const styles = /^styles\s*=\s*(.*)$/m.exec(read(THEME_PROPERTIES))?.[1].trim().split(/\s+/);
    expect(styles).toEqual(['css/flevoland-tokens.css', 'css/login.css']);
  });

  it('takes its colours from the Flevoland tokens', () => {
    expect(
      [...used(read(LOGIN_CSS))].filter((t) => t.startsWith('--flevoland-color-')).length
    ).toBeGreaterThan(0);
  });

  it('uses only tokens the copy defines', () => {
    const tokens = defined(read(COPY));
    expect([...used(read(LOGIN_CSS))].filter((t) => !tokens.has(t))).toEqual([]);
  });

  it("uses Flevoland's semantic tokens, never their palette", () => {
    expect([...used(read(LOGIN_CSS))].filter((t) => PALETTE.test(t))).toEqual([]);
  });
});
