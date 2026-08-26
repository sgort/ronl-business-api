/**
 * What packages/frontend supplies to @ronl/pa-cockpit.
 *
 * These five were the cockpit's only imports outside its own tree before it
 * became a package; the overlay files packages/pa-demo used to keep alongside
 * its vendored copy were the same five. Extraction turned that discovered
 * contract into a type.
 */
import keycloak, { getUser } from '../services/keycloak';
import {
  initializeTenantTheme,
  loadTenantConfigs,
  getTenantConfig,
  getDefaultTenantConfig,
} from '../services/tenant';
import { configurePaCockpit, PA_MODES, type PaCockpitHost } from '@ronl/pa-cockpit';
import PASectionRouter from '../components/PADashboardV2/PASectionRouter';
import PADock from '../components/PADashboardV2/PADock';
import SessionExpiryWarning from '../components/SessionExpiryWarning';
import ChangelogPanel from './ChangelogPanel';

configurePaCockpit({
  // Getters, not snapshots: keycloak.token is replaced on every refresh, so a
  // plain `token: keycloak.token` would freeze the value captured at module load
  // and every request after the first refresh would send a stale bearer.
  auth: {
    get authenticated() {
      return !!keycloak.authenticated;
    },
    get token() {
      return keycloak.token;
    },
    getUser,
    updateToken: (minValidity) => keycloak.updateToken(minValidity ?? 0),
    logout: async (options) => {
      await keycloak.logout(options);
    },
  },
  tenant: { initializeTenantTheme, loadTenantConfigs, getTenantConfig, getDefaultTenantConfig },
});

export const paCockpitHost: PaCockpitHost = {
  modes: PA_MODES,
  SectionRouter: PASectionRouter,
  Dock: PADock,
  SessionExpiryWarning,
  ChangelogPanel,
};
