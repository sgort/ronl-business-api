import { useNavigate } from 'react-router-dom';

import { forgetBoardRequest, rememberBoardRequest } from '../../services/board-request';
import { FLEVOLAND_IDP } from '../../services/identity-providers';

const POST_LOGIN_KEY = 'post_login_redirect';

export type LandingIdp = 'digid' | 'eherkenning' | 'eidas' | typeof FLEVOLAND_IDP;

/** The login starts both landing layouts offer. Each stores its choice and goes to /auth. */
export function useLandingLogin() {
  const navigate = useNavigate();

  /** A board chosen here: where to go after login, and that it was this page's choice. */
  function chooseBoard(target: string | undefined) {
    if (target) {
      sessionStorage.setItem(POST_LOGIN_KEY, target);
      rememberBoardRequest(target, window.location.pathname);
    } else {
      sessionStorage.removeItem(POST_LOGIN_KEY);
      forgetBoardRequest();
    }
  }

  function startMedewerkerLogin(target?: string, usernameHint?: string) {
    try {
      if (target) {
        chooseBoard(target);
      } else {
        forgetBoardRequest();
      }
      if (usernameHint) sessionStorage.setItem('username_hint', usernameHint);
      sessionStorage.setItem('selected_idp', 'medewerker');
    } catch {
      /* sessionStorage unavailable — AuthCallback still defaults sensibly */
    }
    navigate('/auth');
  }

  /**
   * A board opened with the Flevoland account: Entra ID through Keycloak,
   * landing on that board, or on the no-access dialog if Entra does not grant
   * its role.
   */
  function startEntraBoardLogin(target: string) {
    try {
      sessionStorage.removeItem('username_hint');
      chooseBoard(target);
      sessionStorage.setItem('selected_idp', FLEVOLAND_IDP);
    } catch {
      /* non-fatal */
    }
    navigate('/auth');
  }

  function startIdpLogin(idp: LandingIdp, usernameHint?: string) {
    try {
      // A board click stores a redirect and a test-user hint before the user
      // may come back and choose an identity provider instead. Neither belongs
      // to this login: the landing page follows the role Entra/DigiD grants.
      // A hint passed here is this login's own, e.g. a tenant's test citizen.
      chooseBoard(undefined);
      if (usernameHint) sessionStorage.setItem('username_hint', usernameHint);
      else sessionStorage.removeItem('username_hint');
      sessionStorage.setItem('selected_idp', idp);
    } catch {
      /* non-fatal */
    }
    navigate('/auth');
  }

  return { startMedewerkerLogin, startEntraBoardLogin, startIdpLogin };
}
