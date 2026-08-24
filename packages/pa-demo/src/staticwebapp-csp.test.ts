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
const csp: string = JSON.parse(readFileSync(configPath, 'utf-8')).globalHeaders[
  'Content-Security-Policy'
];

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
