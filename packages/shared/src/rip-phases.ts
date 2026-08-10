/**
 * Minimal cross-package mapping from RIP phase code to Operaton
 * process-definition key. This is the one fact backend and frontend must
 * never author separately — see docs/superpowers/specs/2026-08-10-rip-phase-catalogue-deployment-status-design.md.
 *
 * `processDefinitionKey` is undefined until a phase is modelled as BPMN;
 * fill it in at the same time the process itself is deployed.
 */
export interface RipPhaseKey {
  code: string; // 'R2.1' … 'R5.2'
  stage: string; // 'R2' | 'R3' | 'R4' | 'R5'
  processDefinitionKey?: string;
}

export const RIP_PHASE_KEYS: RipPhaseKey[] = [
  { code: 'R2.1', stage: 'R2', processDefinitionKey: 'RipPhase1Process' },
  { code: 'R2.2', stage: 'R2' },
  { code: 'R2.3', stage: 'R2' },
  { code: 'R2.4', stage: 'R2' },
  { code: 'R3.1', stage: 'R3' },
  { code: 'R3.2', stage: 'R3' },
  { code: 'R4.1', stage: 'R4' },
  { code: 'R5.1', stage: 'R5' },
  { code: 'R5.2', stage: 'R5' },
];
