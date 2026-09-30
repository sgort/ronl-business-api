// @vitest-environment node
/**
 * The link-preview tags in index.html, per build mode.
 *
 * Crawlers do not run JavaScript, so the Open Graph and Twitter tags live in
 * the static index.html and Vite fills their %VITE_*% placeholders at build
 * time from the mode's .env file. This loads each mode's env through Vite's
 * own loadEnv -- the parser the build uses, trimming included -- and fills
 * the template the same way Vite does. The real built files are checked
 * again after every deploy build by scripts/check-og.mjs.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { loadEnv } from 'vite';

const ROOT = resolve(__dirname, '..');
const TEMPLATE = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');

/** index.html as `vite build --mode <mode>` writes it: a %NAME% whose NAME is set is replaced. */
function built(mode: string): string {
  // loadEnv lets process.env override the mode file (how CI stamps
  // VITE_BUILD_SHA), and Vitest has already put the test mode's VITE_*
  // values there -- so set them aside, or every mode would read the test file.
  const inherited = Object.keys(process.env).filter((k) => k.startsWith('VITE_'));
  const saved = Object.fromEntries(inherited.map((k) => [k, process.env[k]]));
  for (const k of inherited) delete process.env[k];
  let env: Record<string, string>;
  try {
    env = loadEnv(mode, ROOT, 'VITE_');
  } finally {
    Object.assign(process.env, saved);
  }
  return TEMPLATE.replace(/%(\S+?)%/g, (whole, name: string) => (name in env ? env[name] : whole));
}

const meta = (html: string, attr: 'name' | 'property', key: string): string | undefined => {
  const tag = new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(
    html
  );
  return tag?.[1];
};

describe.each([
  {
    mode: 'production',
    site: 'https://publiek.open-regels.nl',
    robots: 'index, follow',
    title: 'Waar komt deze regel vandaan?',
  },
  {
    mode: 'acceptance',
    site: 'https://acc.publiek.open-regels.nl',
    robots: 'noindex, nofollow',
    title: '[ACC] Waar komt deze regel vandaan?',
  },
  {
    mode: 'development',
    site: 'http://localhost:5175',
    robots: 'noindex, nofollow',
    title: '[DEV] Waar komt deze regel vandaan?',
  },
  {
    mode: 'test',
    site: 'http://localhost:5175',
    robots: 'noindex, nofollow',
    title: '[DEV] Waar komt deze regel vandaan?',
  },
])('index.html built for $mode', ({ mode, site, robots, title }) => {
  const html = built(mode);

  it('leaves no placeholder unfilled', () => {
    expect(html).not.toMatch(/%VITE_/);
  });

  it('points og:image at the absolute URL of the one card, on this environment', () => {
    expect(meta(html, 'property', 'og:image')).toBe(`${site}/og-open-regels.png`);
  });

  it('gives og:url and the canonical link this environment’s address', () => {
    expect(meta(html, 'property', 'og:url')).toBe(`${site}/`);
    expect(html).toContain(`<link rel="canonical" href="${site}/" />`);
  });

  it('sets robots for this environment', () => {
    expect(meta(html, 'name', 'robots')).toBe(robots);
  });

  it('titles the card, with the environment prefix and its space intact', () => {
    expect(meta(html, 'property', 'og:title')).toBe(title);
  });
});

describe('index.html link-preview tags', () => {
  const html = built('production');

  it('carries the fixed Dutch copy and the card metadata', () => {
    expect(meta(html, 'property', 'og:description')).toBe(
      'Zoek in de regels, producten, processen en begrippen van de overheid — en volg elk begrip terug naar de wettekst.'
    );
    expect(meta(html, 'property', 'og:type')).toBe('website');
    expect(meta(html, 'property', 'og:site_name')).toBe('Open Regels Nederland');
    expect(meta(html, 'property', 'og:locale')).toBe('nl_NL');
    expect(meta(html, 'property', 'og:image:width')).toBe('1200');
    expect(meta(html, 'property', 'og:image:height')).toBe('630');
    expect(meta(html, 'property', 'og:image:alt')).toBe(
      'Open Regels Nederland — publieke kennisbank van Provincie Flevoland'
    );
    expect(meta(html, 'name', 'twitter:card')).toBe('summary_large_image');
  });

  it('keeps the existing title', () => {
    expect(html).toContain('<title>Open Regels Nederland — publieke kennisbank</title>');
  });

  it('ships the card image at the size the tags declare', () => {
    const png = readFileSync(resolve(ROOT, 'public', 'og-open-regels.png'));
    // PNG signature, and the 1200×630 the tags declare (IHDR width/height).
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  });
});
