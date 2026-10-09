/**
 * The services a citizen can apply for on the dashboard (#344), one entry
 * each: the process it starts and whose case it becomes.
 *
 * - own-tenant: offered only when the process is deployed under the citizen's
 *   own tenant, so the case lands at their own organisation.
 * - cross-tenant: offered to every citizen when the process is deployed under
 *   one tenant, which handles the case for any channel (Zorgtoeslag at Dienst
 *   Toeslagen).
 *
 * The backend derives the dashboard's cards and checks every start against
 * this list; labels, icons and forms are the frontend's. Data only: this
 * package holds no logic (scripts/check-shared-declarations.mjs).
 */
export const CITIZEN_SERVICES = [
  { id: 'zorgtoeslag', processKey: 'AwbZorgtoeslagProcess', scope: 'cross-tenant' },
  { id: 'vergunningen', processKey: 'AwbShellProcess', scope: 'own-tenant' },
  { id: 'subsidies', processKey: 'ThuisbatterijSubsidieAanvraagProcess', scope: 'own-tenant' },
  { id: 'heusdenpas', processKey: 'HeusdenpasAanvraagProcess', scope: 'own-tenant' },
] as const;

export type CitizenServiceId = (typeof CITIZEN_SERVICES)[number]['id'];
export type CitizenServiceScope = (typeof CITIZEN_SERVICES)[number]['scope'];
