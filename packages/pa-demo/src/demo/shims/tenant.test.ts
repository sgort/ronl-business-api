import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTenantTheme } from './tenant';

// packages/frontend/public/tenants.json, not this package's copy: pa-demo
// no longer vendors tenants.json (it was 18 KB of internal multi-tenant
// config — real contact details, non-public sections — shipped to a public
// site for no runtime reason; nothing in pa-demo ever fetches it). Pointing
// straight at the origin means this guard compares the baked-in literal
// against the actual source of truth, not against a copy that itself needed
// checking.
const frontendPublicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../frontend/public'
);

describe('demo tenant shim', () => {
  beforeEach(() => {
    // A fresh element per test so a previous test's setProperty calls can't
    // leak into the next one's assertions.
    document.documentElement.removeAttribute('style');
  });

  it('applies Flevoland colours via setProperty, not the CSS var() fallback', async () => {
    await initializeTenantTheme();
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--color-primary')).toBe('#0046ad');
    expect(style.getPropertyValue('--color-primary-dark')).toBe('#134F7D');
    expect(style.getPropertyValue('--color-primary-light')).toBe('#4A8FC0');
    expect(style.getPropertyValue('--color-secondary')).toBe('#e70077');
    expect(style.getPropertyValue('--color-accent')).toBe('#F5A623');
  });

  it("resolves to true so the vendored shell's .then() chain runs", async () => {
    expect(await initializeTenantTheme()).toBe(true);
  });

  it("matches the flevoland theme in frontend's tenants.json, so the two cannot silently diverge", () => {
    // The shim bakes these values in literally (see tenant.ts's header for
    // why); this is the guard that the literal still matches the real
    // source of truth it was copied from — packages/frontend's tenants.json,
    // read directly since pa-demo no longer vendors a copy of its own.
    const tenants = JSON.parse(readFileSync(path.join(frontendPublicDir, 'tenants.json'), 'utf-8'));
    const theme = tenants.tenants.flevoland.theme;

    document.documentElement.removeAttribute('style');
    void initializeTenantTheme();
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--color-primary')).toBe(theme.primary);
    expect(style.getPropertyValue('--color-primary-dark')).toBe(theme.primaryDark);
    expect(style.getPropertyValue('--color-primary-light')).toBe(theme.primaryLight);
    expect(style.getPropertyValue('--color-secondary')).toBe(theme.secondary);
    expect(style.getPropertyValue('--color-accent')).toBe(theme.accent);
  });
});
