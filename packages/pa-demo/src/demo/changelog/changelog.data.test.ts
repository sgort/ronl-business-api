import { describe, it, expect } from 'vitest';
import { DEMO_CHANGELOG } from './changelog.data';

describe('the demo changelog', () => {
  it('covers every release with a version, a date, a heading and at least one item', () => {
    // No hard-coded count: the entries are re-derived from the cockpit's own
    // commit history (Step 3) and will grow with each release.
    expect(DEMO_CHANGELOG.length).toBeGreaterThan(0);
    for (const release of DEMO_CHANGELOG) {
      expect(release.version).toMatch(/\d{4}\.\d{2}/);
      expect(release.date).toBeTruthy();
      expect(release.title).toBeTruthy();
      expect(release.items.length).toBeGreaterThan(0);
    }
  });

  it('runs newest first', () => {
    const versions = DEMO_CHANGELOG.map((r) => r.version);
    expect(versions).toEqual([...versions].sort().reverse());
  });

  it("names nothing on the bundle gate's forbidden list", () => {
    // This copy ships in a public bundle. check-bundle.mjs fails the build on
    // these, but it runs at build time — this fails in a second instead.
    const text = JSON.stringify(DEMO_CHANGELOG).toLowerCase();
    for (const forbidden of [
      'keycloak-js',
      'msal',
      'oidc-client',
      'react-ga',
      'gtag(',
      'api.open-regels.nl',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
