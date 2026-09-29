/**
 * The Awb phases a caseworker process moves through, in order. Phases 4 and 5
 * are one step because the kapvergunning subprocess handles treatment and
 * decision together. The code is what `ronl:awbPhase` carries in the BPMN;
 * the name is the stepper's label.
 */
export const AWB_PHASES = [
  { code: '1', name: 'Rechtsbetrekking' },
  { code: '2', name: 'Ontvangst' },
  { code: '3', name: 'Ontvankelijkheid' },
  { code: '4+5', name: 'Behandeling en besluit' },
  { code: '6', name: 'Bekendmaking' },
  { code: '7', name: 'Betaling' },
  { code: '8', name: 'Ketenproces' },
  { code: 'archivering', name: 'Archivering' },
] as const;

export type AwbPhaseCode = (typeof AWB_PHASES)[number]['code'];
