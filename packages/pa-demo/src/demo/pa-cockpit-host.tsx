/**
 * What packages/pa-demo supplies to @ronl/pa-cockpit.
 *
 * The same five seams packages/frontend fills (see its
 * src/pages/pa-cockpit-host.tsx) — the two services registered through
 * configurePaCockpit, plus the four React seams and the mode set on
 * PaCockpitHost. The difference is entirely in what is passed: every value
 * below is a demo implementation that guarantees this public build has no
 * session, no backend and no assistant.
 *
 * These are the same five files this package used to plant as re-export
 * overlays inside its old vendor directory (services/keycloak.ts, services/tenant.ts,
 * components/SessionExpiryWarning.tsx, components/PADashboardV2/PADock.tsx and
 * .../PASectionRouter.tsx), positioned so the vendored copy's relative imports
 * would resolve to them without editing a vendored file. The host contract was
 * discovered by that trick; passing the same values as data is what lets the
 * copy go.
 *
 * `modes` is buildAllowedModes(PA_MODES), not PA_MODES: this is a public site,
 * and the package makes the narrowing a required prop precisely so a host like
 * this one cannot forget it. See allowed-modes.ts and sections.allow.ts.
 */
import { configurePaCockpit, PA_MODES, type PaCockpitHost } from '@ronl/pa-cockpit';
import keycloak, { getUser } from './shims/keycloak';
import {
  initializeTenantTheme,
  loadTenantConfigs,
  getTenantConfig,
  getDefaultTenantConfig,
} from './shims/tenant';
import SessionExpiryWarning from './shims/SessionExpiryWarning';
import PADock from './shims/PADock';
import DemoSectionRouter from './DemoSectionRouter';
import DemoChangelogPanel from './changelog/DemoChangelogPanel';
import { buildAllowedModes } from './allowed-modes';

configurePaCockpit({
  // Getters, not snapshots — mirrors packages/frontend's adapter. Nothing
  // here ever changes (the shim has no token to refresh), but the shape is
  // the contract, and a demo that quietly diverged from it would stop being
  // evidence that the contract works.
  auth: {
    get authenticated() {
      return keycloak.authenticated;
    },
    get token() {
      return keycloak.token;
    },
    getUser,
    updateToken: (minValidity) => keycloak.updateToken(minValidity),
    logout: async (options) => {
      await keycloak.logout(options);
    },
  },
  tenant: { initializeTenantTheme, loadTenantConfigs, getTenantConfig, getDefaultTenantConfig },
});

export const demoCockpitHost: PaCockpitHost = {
  modes: buildAllowedModes(PA_MODES),
  SectionRouter: DemoSectionRouter,
  Dock: PADock,
  SessionExpiryWarning,
  ChangelogPanel: DemoChangelogPanel,
  // No onLogin or onLogout: plato is public and unauthenticated, so there is no
  // session to begin or end. Their absence is what removes the login controls and
  // makes the avatar inert — see the cockpit's render rules. Do not add a no-op
  // callback here; a no-op would restore a control that does nothing, which is
  // the defect this replaced.
};
