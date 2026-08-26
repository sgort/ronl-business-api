import { describe, it, expect, beforeEach } from 'vitest';
import {
  configurePaCockpit,
  getPaCockpitAuth,
  getPaCockpitTenant,
  __resetPaCockpitHostForTests,
} from './host';

const auth = {
  authenticated: true,
  token: 'tok',
  getUser: () => null,
  updateToken: async () => false,
  logout: async () => {},
};
const tenant = {
  initializeTenantTheme: async () => true,
  loadTenantConfigs: async () => ({}),
  getTenantConfig: () => ({ displayName: 'Provincie Flevoland' }),
  getDefaultTenantConfig: () => null,
};

beforeEach(() => __resetPaCockpitHostForTests());

describe('the PA-Cockpit host contract', () => {
  it('hands back exactly what was registered', () => {
    configurePaCockpit({ auth, tenant });
    expect(getPaCockpitAuth().token).toBe('tok');
    expect(getPaCockpitTenant().getTenantConfig('x')?.displayName).toBe('Provincie Flevoland');
  });

  it('throws a named error when read before configuration', () => {
    // The failure mode this prevents: an undefined auth object surfacing as
    // `Cannot read properties of undefined (reading 'token')` from inside a
    // request helper, three layers from the actual mistake.
    expect(() => getPaCockpitAuth()).toThrow(/configurePaCockpit/);
    expect(() => getPaCockpitTenant()).toThrow(/configurePaCockpit/);
  });

  it('lets a host re-register, so a test can swap services between cases', () => {
    configurePaCockpit({ auth, tenant });
    configurePaCockpit({ auth: { ...auth, token: 'other' }, tenant });
    expect(getPaCockpitAuth().token).toBe('other');
  });
});
