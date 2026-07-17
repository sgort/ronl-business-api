/**
 * Shared helpers for rendering a process instance's activity history
 * (Operaton /history/activity-instance) as a human-readable step timeline.
 * Used by both the V2 task inbox and the RIP Fase 1 WIP viewer.
 */

/** Dutch labels for the Operaton activity types we care to distinguish. */
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  userTask: 'Gebruikerstaak',
  serviceTask: 'Servicetaak',
  externalTask: 'Externe taak',
  scriptTask: 'Script',
  businessRuleTask: 'Beslissing',
  startEvent: 'Start',
  endEvent: 'Einde',
  exclusiveGateway: 'Keuze',
  parallelGateway: 'Splitsing',
  intermediateCatchEvent: 'Wachtmoment',
};

export const activityTypeLabel = (type: string): string => ACTIVITY_TYPE_LABELS[type] ?? type;

/** Automated steps the caseworker doesn't act on directly — styled subtly. */
export const AUTOMATED_TYPES = new Set([
  'serviceTask',
  'externalTask',
  'scriptTask',
  'businessRuleTask',
]);

/** Process variables that are internal plumbing, not meaningful to caseworkers. */
export const EXCLUDED_VARS = [
  'municipality',
  'organisationType',
  'initiator',
  'applicantId',
  'assuranceLevel',
  'roleResult',
  'routingResult',
];

/** Turn a process-variable key (edocsWorkspaceId, psDate) into a readable label. */
export const humanizeKey = (key: string): string => {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};
