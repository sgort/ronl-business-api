import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The deployed Content-Security-Policy lives in the SWA config that Vite copies
// into dist/. Parse it straight from the source of truth so this test guards the
// value that actually ships.
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

describe('public-site Content-Security-Policy', () => {
  it('allows organisation logos from the RONL knowledge-graph host (api.open-regels.triply.cc)', () => {
    // Regelcatalogus org-card logos are <img src> pointing at TriplyDB. Without
    // this host in img-src the browser blocks every logo and each card falls back
    // to an initials badge.
    expect(cspDirective('img-src')).toContain('https://api.open-regels.triply.cc');
  });
});
