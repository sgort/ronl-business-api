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
    site: 'https://mijn.open-regels.nl',
    image: 'og-image-prod.png',
    robots: 'index, follow',
    title: 'Vier borden voor het werk van de provincie',
  },
  {
    mode: 'acceptance',
    site: 'https://acc.mijn.open-regels.nl',
    image: 'og-image-acc.png',
    robots: 'noindex, nofollow',
    title: '[ACC] Vier borden voor het werk van de provincie',
  },
  {
    mode: 'development',
    site: 'http://localhost:5173',
    image: 'og-image-acc.png',
    robots: 'noindex, nofollow',
    title: '[DEV] Vier borden voor het werk van de provincie',
  },
  {
    mode: 'test',
    site: 'http://localhost:5173',
    image: 'og-image-acc.png',
    robots: 'noindex, nofollow',
    title: '[DEV] Vier borden voor het werk van de provincie',
  },
])('index.html built for $mode', ({ mode, site, image, robots, title }) => {
  const html = built(mode);

  it('leaves no placeholder unfilled', () => {
    expect(html).not.toMatch(/%VITE_/);
  });

  it('points og:image at the absolute URL of this environment’s card', () => {
    expect(meta(html, 'property', 'og:image')).toBe(`${site}/${image}`);
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
    expect(meta(html, 'name', 'description')).toBe(
      'Vier borden voor het werk van de provincie: Caseworker, PA-Cockpit, Infra-board en Woo-dashboard. Log in met uw Flevoland-account.'
    );
    expect(meta(html, 'property', 'og:description')).toBe(
      'Zaakbehandeling, bestuurlijke afstemming, projectsturing en Woo-verantwoording in één werkomgeving van Provincie Flevoland.'
    );
    expect(meta(html, 'property', 'og:type')).toBe('website');
    expect(meta(html, 'property', 'og:site_name')).toBe('ronl. werkomgeving');
    expect(meta(html, 'property', 'og:locale')).toBe('nl_NL');
    expect(meta(html, 'property', 'og:image:type')).toBe('image/png');
    expect(meta(html, 'property', 'og:image:width')).toBe('1200');
    expect(meta(html, 'property', 'og:image:height')).toBe('630');
    expect(meta(html, 'property', 'og:image:alt')).toBe(
      'ronl. werkomgeving — vier borden voor het werk van Provincie Flevoland'
    );
    expect(meta(html, 'name', 'twitter:card')).toBe('summary_large_image');
  });

  it('keeps the existing title', () => {
    expect(html).toContain('<title>ronl. werkomgeving</title>');
  });

  it('ships both card images, and both cards of every tenant page', () => {
    const tenantCards = ['amsterdam', 'toeslagen', 'unive'].flatMap((id) => [
      `og-image-${id}-prod.png`,
      `og-image-${id}-acc.png`,
    ]);
    for (const f of ['og-image-prod.png', 'og-image-acc.png', ...tenantCards]) {
      const png = readFileSync(resolve(ROOT, 'public', f));
      // PNG signature, and the 1200×630 the tags declare (IHDR width/height).
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    }
  });
});
