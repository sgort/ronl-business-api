import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8')
);

describe('@ronl/pa-cockpit scaffold', () => {
  // This assertion used to be the opposite: `toBe('1.0.0')`, on the reasoning
  // that a package compiled into two apps which carry their own CalVer needs no
  // version of its own. #152 overruled that, and this file was not updated with
  // it — so the first release that included a pa-cockpit change failed here
  // rather than shipping, on v2026.09.10.
  //
  // Why the bump wins: the package is `private: true` and consumed as
  // `"@ronl/pa-cockpit": "*"`, so its version constrains nothing at install
  // time. What it does is record WHICH pa-cockpit code a frontend or pa-demo
  // release contains — for the lockfile, and for the SBOM, audit and provenance
  // tooling that reads it. Pinned at 1.0.0 it sat through 49 commits saying
  // nothing, while `packages/shared` was bumped for a single devDependency
  // range.
  //
  // So the rule this now pins is /bump-release's: the version is a release
  // version, moved only by a release that includes a `packages/pa-cockpit/**`
  // change, and left to lag at the last one that did otherwise. Do not re-pin
  // it to a literal — that is the change this test exists to catch.
  it('carries a release version rather than a pin', () => {
    expect(pkg.version).toMatch(/^\d{4}\.\d{2}\.\d+$/);
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
