// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTenantTheme,
  getDefaultTenantConfig,
  getTenantConfig,
  initializeTenantTheme,
  loadTenantConfigs,
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
  features: { zorgtoeslag: true, vergunningen: true, subsidies: true, meldingen: true, dvtp: true },
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
