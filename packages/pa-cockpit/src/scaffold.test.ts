import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8')
);

describe('@ronl/pa-cockpit scaffold', () => {
  it('is pinned at 1.0.0 — it is compiled into two apps that carry their own CalVer', () => {
    expect(pkg.version).toBe('1.0.0');
  });

  it('ships source rather than a build', () => {
    expect(pkg.exports['.']).toBe('./src/index.ts');
    expect(pkg.main).toBeUndefined();
  });

  it('keeps React as a peer so the two hosts cannot end up with two copies', () => {
    expect(pkg.peerDependencies.react).toBeDefined();
    expect(pkg.dependencies?.react).toBeUndefined();
  });
});
