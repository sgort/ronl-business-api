/**
 * Keycloak identity-provider aliases the frontend sends as `idpHint`.
 *
 * `entra-flevoland` must match the provider scripts/keycloak-add-entra-idp.sh
 * creates in the realm, and the redirect URI registered in Flevoland's Entra
 * app registration embeds it too — renaming it means changing all three.
 *
 * Kept in a module of its own so the landing page can name it without
 * importing keycloak-js.
 */
export const FLEVOLAND_IDP = 'entra-flevoland';
