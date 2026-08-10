import { describe, expect, it } from 'vitest';
import {
  getPhaseDeployStatus,
  ripPhaseByCode,
  RIP_PHASES,
  RIP_STAGES,
  type RipPhase,
} from './rip-phases.catalog';

describe('RIP_PHASES catalogue', () => {
  it('has exactly nine phases in R2.1…R5.2 order', () => {
    expect(RIP_PHASES.map((p) => p.code)).toEqual([
      'R2.1',
      'R2.2',
      'R2.3',
      'R2.4',
      'R3.1',
      'R3.2',
      'R4.1',
      'R5.1',
      'R5.2',
    ]);
  });

  it('has four stages matching the phase codes', () => {
    expect(RIP_STAGES.map((s) => s.code)).toEqual(['R2', 'R3', 'R4', 'R5']);
  });

  it('only R2.1 carries a processDefinitionKey', () => {
    expect(ripPhaseByCode('R2.1')?.processDefinitionKey).toBe('RipPhase1Process');
    for (const code of ['R2.2', 'R2.3', 'R2.4', 'R3.1', 'R3.2', 'R4.1', 'R5.1', 'R5.2']) {
      expect(ripPhaseByCode(code)?.processDefinitionKey).toBeUndefined();
    }
  });

  it('marks only R5.2 as beyond (no process model even planned)', () => {
    expect(ripPhaseByCode('R5.2')?.beyond).toBe(true);
    for (const code of ['R2.1', 'R2.2', 'R2.3', 'R2.4', 'R3.1', 'R3.2', 'R4.1', 'R5.1']) {
      expect(ripPhaseByCode(code)?.beyond).toBeUndefined();
    }
  });
});

describe('getPhaseDeployStatus', () => {
  const withKey: RipPhase = { ...ripPhaseByCode('R2.1')! };
  const withoutKey: RipPhase = { ...ripPhaseByCode('R2.2')! };
  const beyond: RipPhase = { ...ripPhaseByCode('R5.2')! };

  it('is gedeployed when the phase has a key and it is in the deployed set', () => {
    expect(getPhaseDeployStatus(withKey, new Set(['RipPhase1Process']))).toBe('gedeployed');
  });

  it('is ontwerp when the phase has a key but it is not in the deployed set', () => {
    expect(getPhaseDeployStatus(withKey, new Set())).toBe('ontwerp');
  });

  it('is ontwerp when the phase has no key and is not beyond', () => {
    expect(getPhaseDeployStatus(withoutKey, new Set())).toBe('ontwerp');
  });

  it('is onbekend when the phase is beyond, regardless of the deployed set', () => {
    expect(getPhaseDeployStatus(beyond, new Set(['RipPhase1Process']))).toBe('onbekend');
  });
});
