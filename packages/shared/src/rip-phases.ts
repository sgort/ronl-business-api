/**
 * Minimal cross-package mapping from RIP phase code to Operaton
 * process-definition key. This is the one fact backend and frontend must
 * never author separately — see docs/superpowers/specs/2026-08-10-rip-phase-catalogue-deployment-status-design.md.
 *
 * `processDefinitionKey` is undefined until a phase is modelled as BPMN;
 * fill it in at the same time the process itself is deployed.
 */
export interface RipPhaseKey {
  code: string; // 'R2.1' … 'R6.1'
  stage: string; // 'R2' | 'R3' | 'R4' | 'R5' | 'R6'
  processDefinitionKey?: string;
}

export const RIP_PHASE_KEYS: RipPhaseKey[] = [
  { code: 'R2.1', stage: 'R2', processDefinitionKey: 'RipR21Process' },
  { code: 'R2.2', stage: 'R2', processDefinitionKey: 'RipR22Process' },
  { code: 'R2.3', stage: 'R2', processDefinitionKey: 'RipR23Process' },
  { code: 'R2.4', stage: 'R2', processDefinitionKey: 'RipR24Process' },
  { code: 'R3.1', stage: 'R3', processDefinitionKey: 'RipR31Process' },
  { code: 'R3.2', stage: 'R3', processDefinitionKey: 'RipR32Process' },
  { code: 'R4.1', stage: 'R4', processDefinitionKey: 'RipR41Process' },
  { code: 'R5.1', stage: 'R5', processDefinitionKey: 'RipR51Process' },
  { code: 'R5.2', stage: 'R5', processDefinitionKey: 'RipR52Process' },
  { code: 'R5.3', stage: 'R5' },
  { code: 'R5.4', stage: 'R5', processDefinitionKey: 'RipR54Process' },
  { code: 'R6.1', stage: 'R6', processDefinitionKey: 'RipR61Process' },
];
