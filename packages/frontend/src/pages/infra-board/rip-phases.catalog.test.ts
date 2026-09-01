import { describe, expect, it } from 'vitest';
import {
  getPhaseDeployStatus,
  ripPhaseByCode,
  RIP_PHASES,
  RIP_STAGES,
  type RipPhase,
} from './rip-phases.catalog';

const UNMODELLED_CODES = [
  'R2.3',
  'R2.4',
  'R3.1',
  'R3.2',
  'R4.1',
  'R5.1',
  'R5.2',
  'R5.3',
  'R5.4',
  'R6.1',
];

describe('RIP_PHASES catalogue', () => {
  it('has exactly twelve phases in R2.1…R6.1 order', () => {
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
      'R5.3',
      'R5.4',
      'R6.1',
    ]);
  });

  it('has five stages matching the phase codes', () => {
    expect(RIP_STAGES.map((s) => s.code)).toEqual(['R2', 'R3', 'R4', 'R5', 'R6']);
  });

  it('only the modelled phases carry a processDefinitionKey', () => {
    expect(ripPhaseByCode('R2.1')?.processDefinitionKey).toBe('RipR21Process');
    expect(ripPhaseByCode('R2.2')?.processDefinitionKey).toBe('RipR22Process');
    for (const code of UNMODELLED_CODES) {
      expect(ripPhaseByCode(code)?.processDefinitionKey).toBeUndefined();
    }
  });

  it('marks only R5.3 as beyond (no process model even planned)', () => {
    expect(ripPhaseByCode('R5.3')?.beyond).toBe(true);
    const notBeyond = [
      'R2.1',
      'R2.2',
      'R2.3',
      'R2.4',
      'R3.1',
      'R3.2',
      'R4.1',
      'R5.1',
      'R5.2',
      'R5.4',
      'R6.1',
    ];
    for (const code of notBeyond) {
      expect(ripPhaseByCode(code)?.beyond).toBeUndefined();
    }
  });

  it('every phase resolves to a real stage', () => {
    const stageCodes = new Set(RIP_STAGES.map((s) => s.code));
    for (const phase of RIP_PHASES) {
      expect(stageCodes.has(phase.stage)).toBe(true);
    }
  });
});

describe('getPhaseDeployStatus', () => {
  const withKey: RipPhase = { ...ripPhaseByCode('R2.1')! };
  const withoutKey: RipPhase = { ...ripPhaseByCode('R2.3')! };
  const beyond: RipPhase = { ...ripPhaseByCode('R5.3')! };

  it('is gedeployed when the phase has a key and it is in the deployed set', () => {
    expect(getPhaseDeployStatus(withKey, new Set(['RipR21Process']))).toBe('gedeployed');
  });

  it('is ontwerp when the phase has a key but it is not in the deployed set', () => {
    expect(getPhaseDeployStatus(withKey, new Set())).toBe('ontwerp');
  });

  it('is ontwerp when the phase has no key and is not beyond', () => {
    expect(getPhaseDeployStatus(withoutKey, new Set())).toBe('ontwerp');
  });

  it('is onbekend when the phase is beyond, regardless of the deployed set', () => {
    expect(getPhaseDeployStatus(beyond, new Set(['RipR21Process']))).toBe('onbekend');
  });
});

describe('kredietBeslisser', () => {
  it('is set for every phase with krediet: true', () => {
    expect(ripPhaseByCode('R2.3')?.kredietBeslisser).toBe('Infra-overleg');
    expect(ripPhaseByCode('R2.4')?.kredietBeslisser).toBe('Infra-overleg');
    expect(ripPhaseByCode('R3.2')?.kredietBeslisser).toBe('Infra-overleg');
    expect(ripPhaseByCode('R4.1')?.kredietBeslisser).toBe('Concerndirecteur');
    expect(ripPhaseByCode('R5.2')?.kredietBeslisser).toBe(
      'AO of Concerndirecteur (afhankelijk van drempel)'
    );
    expect(ripPhaseByCode('R5.4')?.kredietBeslisser).toBe(
      'AO of Concerndirecteur (afhankelijk van drempel)'
    );
  });

  it('is undefined for every phase with krediet: false', () => {
    for (const code of ['R2.1', 'R2.2', 'R3.1', 'R5.1', 'R5.3', 'R6.1']) {
      expect(ripPhaseByCode(code)?.kredietBeslisser).toBeUndefined();
    }
  });
});
