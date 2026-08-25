import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Parsed from the source of truth Vite copies into dist/, so this guards the
// header that actually ships.
const configPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'staticwebapp.config.json'
);
const swaConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
const csp: string = swaConfig.globalHeaders['Content-Security-Policy'];

function cspDirective(name: string): string[] {
  const part = csp
    .split(';')
    .map((s) => s.trim())
    .find((d) => d === name || d.startsWith(`${name} `));
  return part ? part.slice(name.length).trim().split(/\s+/).filter(Boolean) : [];
}

describe('pa-demo Content-Security-Policy', () => {
  it('permits no outbound connection beyond the site itself', () => {
    // plato calls nothing. Where public-site lists the API origins because it
    // genuinely uses them, listing none here is what makes "no Live" a rule
    // the browser enforces rather than a UI convention.
    expect(cspDirective('connect-src')).toEqual(["'self'"]);
  });

  it('names no backend origin in any directive', () => {
    expect(csp).not.toContain('api.open-regels.nl');
    expect(csp).not.toContain('acc.api.open-regels.nl');
  });

  it('still allows the inline styles the cockpit CSS needs', () => {
    expect(cspDirective('style-src')).toContain("'unsafe-inline'");
  });

  it('refuses to be framed', () => {
    expect(cspDirective('frame-ancestors')).toEqual(["'none'"]);
  });
});

describe('pa-demo navigationFallback', () => {
  it('serves .png as a real file rather than rewriting it to the SPA shell', () => {
    // The social card lives at /og-pa-demo.png. Without this exclusion the
    // navigationFallback rewrites it to index.html, and the scraper gets a
    // 200 with an HTML body where it expected an image — no error anywhere,
    // just a link preview with no picture. Proven once already on this site:
    // a request for a nonexistent .json returned 200 serving the SPA shell,
    // which briefly looked like a file leak.
    const exclude: string[] = swaConfig.navigationFallback.exclude;

    expect(exclude.some((p) => /\bpng\b/.test(p))).toBe(true);
  });
});
