/**
 * Supplies the cockpit its session callbacks.
 *
 * This exists as a component rather than living in pa-cockpit-host.tsx because
 * onLogin needs useNavigate, and neither of the two obvious homes can call it:
 * App.tsx renders <BrowserRouter> itself, so App's body is outside router
 * context, and pa-cockpit-host.tsx is a plain module, not a component. A
 * component rendered as the route is the only place with the context.
 *
 * The login protocol is this app's house convention, not the cockpit's — the
 * same two sessionStorage keys are written by LoginChoice, WooDashboard,
 * InfraBoardDashboard and CaseworkerDashboardV2, and read back by AuthCallback.
 * It moved out of the package so the package stops naming this app's routes and
 * IdP vocabulary.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PADashboardV2, type PaCockpitHost } from '@ronl/pa-cockpit';
import keycloak from '../services/keycloak';
import { paCockpitHost } from './pa-cockpit-host';

export default function PaCockpitRoute() {
  const navigate = useNavigate();

  const host = useMemo<PaCockpitHost>(
    () => ({
      ...paCockpitHost,
      onLogin: () => {
        sessionStorage.setItem('selected_idp', 'medewerker');
        sessionStorage.setItem('post_login_redirect', '/dashboard/public-affairs');
        navigate('/auth');
      },
      onLogout: () => {
        if (keycloak.authenticated) {
          keycloak.logout({ redirectUri: window.location.origin + '/' });
        }
      },
    }),
    [navigate]
  );

  return <PADashboardV2 host={host} />;
}
