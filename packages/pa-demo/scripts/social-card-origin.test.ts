import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SITE_ORIGIN, originForMode, rewriteSocialCardOrigin } from './social-card-origin';

// The real shell, not a fixture. A fixture would keep passing after someone
// edited index.html into a shape the rewrite no longer matches, which is the
// only interesting way this can break.
const indexHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
  'utf-8'
);

describe('originForMode', () => {
  it('maps each build mode to its own origin', () => {
    expect(originForMode('development')).toBe('http://localhost:5176');
    expect(originForMode('acceptance')).toBe('https://acc.plato.open-regels.nl');
    expect(originForMode('production')).toBe('https://plato.open-regels.nl');
  });

  it('falls back to production for an unknown mode', () => {
    // A typo'd --mode should ship a card pointing at the real site rather than
    // emitting a localhost URL into a deployed page.
    expect(originForMode('acceptence')).toBe(SITE_ORIGIN.production);
    expect(originForMode('')).toBe(SITE_ORIGIN.production);
  });
});

describe('rewriteSocialCardOrigin', () => {
  it('rewrites both og:url and og:image for an acceptance build', () => {
    const out = rewriteSocialCardOrigin(indexHtml, SITE_ORIGIN.acceptance);

    expect(out).toContain('content="https://acc.plato.open-regels.nl/"');
    expect(out).toContain('content="https://acc.plato.open-regels.nl/og-pa-demo.png"');
    expect(out).not.toContain('content="https://plato.open-regels.nl/"');
    expect(out).not.toContain('content="https://plato.open-regels.nl/og-pa-demo.png"');
  });

  it('rewrites both for a development build', () => {
    const out = rewriteSocialCardOrigin(indexHtml, SITE_ORIGIN.development);

    expect(out).toContain('content="http://localhost:5176/"');
    expect(out).toContain('content="http://localhost:5176/og-pa-demo.png"');
  });

  it('leaves a production build byte-identical', () => {
    expect(rewriteSocialCardOrigin(indexHtml, SITE_ORIGIN.production)).toBe(indexHtml);
  });

  it('does not touch og:image:width, og:image:height or twitter:card', () => {
    // The negative case that matters: a sloppier rewrite (a global replace on
    // the bare hostname, say) would corrupt neighbouring tags while still
    // making the two positive assertions above pass.
    const out = rewriteSocialCardOrigin(indexHtml, SITE_ORIGIN.acceptance);

    expect(out).toContain('<meta property="og:image:width" content="1200" />');
    expect(out).toContain('<meta property="og:image:height" content="630" />');
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it('rewrites the two URLs and nothing else in the document', () => {
    const out = rewriteSocialCardOrigin(indexHtml, SITE_ORIGIN.acceptance);
    const changed = indexHtml
      .split('\n')
      .filter((line, i) => line !== out.split('\n')[i])
      .map((l) => l.trim());

    expect(changed).toEqual([
      '<meta property="og:url" content="https://plato.open-regels.nl/" />',
      '<meta property="og:image" content="https://plato.open-regels.nl/og-pa-demo.png" />',
    ]);
  });
});

describe('index.html social card block', () => {
  // Cheap, and it catches a bad merge that drops half the block — the card
  // then renders as a bare link with no image and nothing fails at build time.
  it('carries every tag a summary_large_image preview needs', () => {
    for (const tag of [
      'property="og:image"',
      'property="og:image:width"',
      'property="og:image:height"',
      'property="og:image:alt"',
      'name="twitter:card"',
      'property="og:url"',
      'property="og:title"',
      'name="description"',
    ]) {
      expect(indexHtml).toContain(tag);
    }
  });

  it('points og:image at a file that exists in public/', () => {
    // Guards the rename case: changing the asset's filename in one place only
    // yields a 404 that no build step notices.
    const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
    const match = indexHtml.match(/property="og:image" content="[^"]*\/([^/"]+)"/);

    expect(match).not.toBeNull();
    expect(() => readFileSync(join(publicDir, match![1]))).not.toThrow();
  });

  it('authors the absolute URLs against the production origin', () => {
    // The rewrite replaces this exact string. If index.html is ever authored
    // against ACC instead, every build would silently ship ACC URLs.
    expect(indexHtml).toContain(`content="${SITE_ORIGIN.production}/"`);
    expect(indexHtml).toContain(`content="${SITE_ORIGIN.production}/og-pa-demo.png"`);
  });
});
