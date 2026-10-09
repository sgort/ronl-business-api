// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  applyTenantTheme,
  getDefaultTenantConfig,
  getTenantConfig,
  initializeTenantTheme,
  loadTenantConfigs,
  RESERVED_TENANT_IDS,
  resolveLandingTenant,
  type TenantConfig,
} from './tenant';

const utrechtConfig: TenantConfig = {
  id: 'utrecht',
  name: 'utrecht',
  displayName: 'Gemeente Utrecht',
  organisationType: 'municipality',
  theme: {
    primary: '#111111',
    primaryDark: '#000000',
    primaryLight: '#222222',
    secondary: '#333333',
    accent: '#444444',
  },
  contact: {
    phone: '030',
    email: 'info@utrecht.nl',
    address: 'Stadhuis',
    postalCode: '3500',
    city: 'Utrecht',
  },
  enabled: true,
};

const disabledConfig: TenantConfig = { ...utrechtConfig, id: 'disabled-city', enabled: false };

function mockFetchOnce(payload: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      statusText: ok ? 'OK' : 'Not Found',
      json: () => Promise.resolve(payload),
    })
  );
}

describe('tenant service', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('loadTenantConfigs', () => {
    it('populates the cache and returns the tenant registry on success', async () => {
      mockFetchOnce({ tenants: { utrecht: utrechtConfig }, default: 'utrecht' });

      const result = await loadTenantConfigs();

      expect(result).toEqual({ utrecht: utrechtConfig });
      expect(getTenantConfig('utrecht')).toEqual(utrechtConfig);
      expect(getDefaultTenantConfig()).toEqual(utrechtConfig);
    });

    it('returns {} and leaves the previous cache untouched when the response is not ok', async () => {
      mockFetchOnce({ tenants: { utrecht: utrechtConfig }, default: 'utrecht' });
      await loadTenantConfigs();

      mockFetchOnce({}, false);
      const result = await loadTenantConfigs();

      expect(result).toEqual({});
      expect(getTenantConfig('utrecht')).toEqual(utrechtConfig);
    });

    it('treats a payload without a tenants key as an empty registry', async () => {
      mockFetchOnce({ default: 'utrecht' });

      const result = await loadTenantConfigs();

      expect(result).toEqual({});
      expect(getTenantConfig('utrecht')).toBeNull();
    });

    it('returns {} when fetch itself throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      const result = await loadTenantConfigs();

      expect(result).toEqual({});
    });
  });

  describe('getTenantConfig', () => {
    it('returns null for an unknown tenant id', async () => {
      mockFetchOnce({ tenants: { utrecht: utrechtConfig }, default: 'utrecht' });
      await loadTenantConfigs();

      expect(getTenantConfig('nowhere')).toBeNull();
    });
  });

  describe('getDefaultTenantConfig', () => {
    it('returns null when no default tenant id was set', async () => {
      mockFetchOnce({ tenants: { utrecht: utrechtConfig } });
      await loadTenantConfigs();

      expect(getDefaultTenantConfig()).toBeNull();
    });

    it('returns null when the default tenant id names no loaded tenant', async () => {
      mockFetchOnce({ tenants: { utrecht: utrechtConfig }, default: 'amsterdam' });
      await loadTenantConfigs();

      expect(getDefaultTenantConfig()).toBeNull();
    });
  });

  describe('resolveLandingTenant', () => {
    const single = (id: string, extra: Partial<TenantConfig> = {}): TenantConfig => ({
      ...utrechtConfig,
      id,
      boards: ['caseworker'],
      ...extra,
    });

    beforeEach(async () => {
      mockFetchOnce({
        tenants: {
          utrecht: utrechtConfig,
          amsterdam: single('amsterdam'),
          'den-bosch': single('den-bosch'),
          oldtown: single('oldtown', { enabled: false }),
          multi: single('multi', { boards: ['caseworker', 'woo'] }),
          auth: single('auth'),
        },
        default: 'utrecht',
      });
      await loadTenantConfigs();
    });

    describe('/<id>', () => {
      it('resolves a single-board tenant', () => {
        const r = resolveLandingTenant('/amsterdam', '');
        expect(r).toEqual({ kind: 'single', tenant: expect.objectContaining({ id: 'amsterdam' }) });
      });

      it('accepts a trailing slash and ids with a hyphen', () => {
        expect(resolveLandingTenant('/amsterdam/', '').kind).toBe('single');
        expect(resolveLandingTenant('/den-bosch', '').kind).toBe('single');
      });

      it('wins over ?tenant=', () => {
        const r = resolveLandingTenant('/amsterdam', '?tenant=den-bosch');
        expect(r).toEqual({ kind: 'single', tenant: expect.objectContaining({ id: 'amsterdam' }) });
      });

      it('redirects a mixed-case id to its lower-case path', () => {
        expect(resolveLandingTenant('/Amsterdam', '')).toEqual({
          kind: 'redirect',
          to: '/amsterdam',
        });
      });

      it.each([
        ['an unknown tenant', '/nowhere'],
        ['a disabled tenant', '/oldtown'],
        ['a tenant with several boards', '/multi'],
        ['the default tenant', '/utrecht'],
        ['a reserved id, even when tenants.json lists it', '/auth'],
        ['an inherited object key', '/constructor'],
        ['__proto__', '/__proto__'],
        ['an id that breaks the pattern', '/a'],
        ['an undecodable segment', '/%E0%A4%A'],
      ])('sends %s to /', (_label, path) => {
        expect(resolveLandingTenant(path, '')).toEqual({ kind: 'redirect', to: '/' });
      });
    });

    describe('legacy ?tenant=', () => {
      it('redirects a single-board tenant to /<id>', () => {
        expect(resolveLandingTenant('/', '?tenant=amsterdam')).toEqual({
          kind: 'redirect',
          to: '/amsterdam',
        });
      });

      it('lower-cases the id', () => {
        expect(resolveLandingTenant('/', '?tenant=AMSTERDAM')).toEqual({
          kind: 'redirect',
          to: '/amsterdam',
        });
      });

      it.each([
        ['an unknown tenant', '?tenant=nowhere'],
        ['a disabled tenant', '?tenant=oldtown'],
        ['a tenant with several boards', '?tenant=multi'],
        ['an inherited object key', '?tenant=constructor'],
        ['__proto__', '?tenant=__proto__'],
      ])('shows the default grid for %s', (_label, search) => {
        expect(resolveLandingTenant('/', search)).toEqual({
          kind: 'grid',
          tenant: expect.objectContaining({ id: 'utrecht' }),
        });
      });
    });

    it('shows the default grid on /', () => {
      expect(resolveLandingTenant('/', '')).toEqual({
        kind: 'grid',
        tenant: expect.objectContaining({ id: 'utrecht' }),
      });
    });

    it('reserves the paths the app and the static host already use', () => {
      for (const id of ['auth', 'dashboard', 'assets', 'tenants', 'api', 't']) {
        expect(RESERVED_TENANT_IDS).toContain(id);
      }
    });
  });

  describe('applyTenantTheme', () => {
    it('sets the CSS custom properties on the document root', () => {
      applyTenantTheme(utrechtConfig.theme);

      const root = document.documentElement;
      expect(root.style.getPropertyValue('--color-primary')).toBe(utrechtConfig.theme.primary);
      expect(root.style.getPropertyValue('--color-primary-dark')).toBe(
        utrechtConfig.theme.primaryDark
      );
      expect(root.style.getPropertyValue('--color-primary-light')).toBe(
        utrechtConfig.theme.primaryLight
      );
      expect(root.style.getPropertyValue('--color-secondary')).toBe(utrechtConfig.theme.secondary);
      expect(root.style.getPropertyValue('--color-accent')).toBe(utrechtConfig.theme.accent);
    });

    it('sets the page background when the theme has one', () => {
      applyTenantTheme({ ...utrechtConfig.theme, background: '#eef1ee' });

      expect(document.documentElement.style.getPropertyValue('--color-background')).toBe('#eef1ee');
    });

    it('removes a previous tenant’s background when the theme has none', () => {
      applyTenantTheme({ ...utrechtConfig.theme, background: '#eef1ee' });
      applyTenantTheme(utrechtConfig.theme);

      expect(document.documentElement.style.getPropertyValue('--color-background')).toBe('');
    });
  });

  // The real tenants.json, so a typo in Heusden's entry fails here rather than
  // on the deployed page.
  describe('the real tenants.json', () => {
    beforeEach(async () => {
      const real = JSON.parse(
        readFileSync(resolve(__dirname, '../../public/tenants.json'), 'utf-8')
      );
      mockFetchOnce(real);
      await loadTenantConfigs();
    });

    it('gives Heusden its own single-board page at /heusden', () => {
      expect(resolveLandingTenant('/heusden', '')).toEqual({
        kind: 'single',
        tenant: expect.objectContaining({ id: 'heusden', displayName: 'Gemeente Heusden' }),
      });
    });

    it('sends /Heusden to /heusden', () => {
      expect(resolveLandingTenant('/Heusden', '')).toEqual({ kind: 'redirect', to: '/heusden' });
    });

    it('gives Heusden a page background, and Amsterdam none', () => {
      expect(getTenantConfig('heusden')?.theme.background).toBe('#eef1ee');
      expect(getTenantConfig('amsterdam')?.theme.background).toBeUndefined();
    });
  });

  describe('initializeTenantTheme', () => {
    it('applies the theme and returns true for an enabled tenant already in cache', async () => {
      mockFetchOnce({ tenants: { utrecht: utrechtConfig }, default: 'utrecht' });
      await loadTenantConfigs();

      const result = await initializeTenantTheme('utrecht');

      expect(result).toBe(true);
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe(
        utrechtConfig.theme.primary
      );
    });

    it('loads the tenant configs first when the cache is still empty', async () => {
      // A fresh module instance starts with an empty cache, so the first call
      // has to fetch /tenants.json itself before it can resolve the tenant.
      vi.resetModules();
      const fresh = await import('./tenant');
      mockFetchOnce({ tenants: { utrecht: utrechtConfig }, default: 'utrecht' });

      expect(await fresh.initializeTenantTheme('utrecht')).toBe(true);
      expect(fetch).toHaveBeenCalledWith('/tenants.json');
    });

    it('returns false for a disabled tenant', async () => {
      mockFetchOnce({ tenants: { 'disabled-city': disabledConfig }, default: 'disabled-city' });
      await loadTenantConfigs();

      expect(await initializeTenantTheme('disabled-city')).toBe(false);
    });

    it('returns false when the tenant id is not found', async () => {
      mockFetchOnce({ tenants: { utrecht: utrechtConfig }, default: 'utrecht' });
      await loadTenantConfigs();

      expect(await initializeTenantTheme('nowhere')).toBe(false);
    });
  });
});
