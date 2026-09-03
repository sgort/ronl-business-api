import { describe, expect, it } from 'vitest';
import {
  getPhaseDeployStatus,
  previousModelledPhase,
  ripPhaseByCode,
  skippedPhasesBefore,
  RIP_PHASES,
  RIP_STAGES,
  type RipPhase,
} from './rip-phases.catalog';

// Every phase carries a process definition key now: R5.3 was the last holdout
// and is deployed as RipR53Process (sheet 3-9-2026). `beyond` still exists as a
// capability but no real phase uses it, so the fixture below synthesises one.
const UNMODELLED_CODES: string[] = [];

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
    expect(ripPhaseByCode('R2.3')?.processDefinitionKey).toBe('RipR23Process');
    expect(ripPhaseByCode('R2.4')?.processDefinitionKey).toBe('RipR24Process');
    expect(ripPhaseByCode('R3.1')?.processDefinitionKey).toBe('RipR31Process');
    expect(ripPhaseByCode('R3.2')?.processDefinitionKey).toBe('RipR32Process');
    expect(ripPhaseByCode('R4.1')?.processDefinitionKey).toBe('RipR41Process');
    expect(ripPhaseByCode('R5.1')?.processDefinitionKey).toBe('RipR51Process');
    expect(ripPhaseByCode('R5.2')?.processDefinitionKey).toBe('RipR52Process');
    expect(ripPhaseByCode('R5.4')?.processDefinitionKey).toBe('RipR54Process');
    expect(ripPhaseByCode('R6.1')?.processDefinitionKey).toBe('RipR61Process');
    for (const code of UNMODELLED_CODES) {
      expect(ripPhaseByCode(code)?.processDefinitionKey).toBeUndefined();
    }
  });

  it('marks no phase as beyond — every one of the twelve is modelled', () => {
    for (const phase of RIP_PHASES) {
      expect(phase.beyond).toBeUndefined();
      expect(phase.processDefinitionKey).toBeDefined();
    }
  });

  it('every phase resolves to a real stage', () => {
    const stageCodes = new Set(RIP_STAGES.map((s) => s.code));
    for (const phase of RIP_PHASES) {
      expect(stageCodes.has(phase.stage)).toBe(true);
    }
  });
});

describe('previousModelledPhase / skippedPhasesBefore', () => {
  it('is the immediate predecessor for every ordinary phase', () => {
    expect(previousModelledPhase('R2.2')?.code).toBe('R2.1');
    expect(previousModelledPhase('R3.1')?.code).toBe('R2.4');
    expect(previousModelledPhase('R5.2')?.code).toBe('R5.1');
    expect(previousModelledPhase('R6.1')?.code).toBe('R5.4');
  });

  it('is undefined for the first phase, which has nothing to be ready for', () => {
    expect(previousModelledPhase('R2.1')).toBeUndefined();
    expect(skippedPhasesBefore('R2.1')).toEqual([]);
  });

  it('resolves R5.4 to R5.3, which is modelled now', () => {
    // R5.4's entry criterion reads "Oplevering areaal na R5.3". R5.3 used to be
    // `beyond` -- no sheet, no BPMN, no observable exit -- so it was stepped
    // over. RipR53Process is deployed and its "Ja, oplevering areaal" end event
    // IS that exit, so R5.4 follows R5.3 directly.
    expect(previousModelledPhase('R5.4')?.code).toBe('R5.3');
  });

  it('names no skipped phase anywhere, now that every phase is modelled', () => {
    for (const phase of RIP_PHASES) {
      expect(skippedPhasesBefore(phase.code)).toEqual([]);
    }
  });

  it('reports no skip for any phase other than R5.4', () => {
    for (const phase of RIP_PHASES) {
      if (phase.code === 'R5.4') continue;
      expect(skippedPhasesBefore(phase.code)).toEqual([]);
    }
  });

  it('every phase after the first resolves to a predecessor that is not beyond', () => {
    for (const phase of RIP_PHASES.slice(1)) {
      const prev = previousModelledPhase(phase.code);
      expect(prev).toBeDefined();
      expect(prev?.beyond).toBeUndefined();
    }
  });
});

describe('getPhaseDeployStatus', () => {
  const withKey: RipPhase = { ...ripPhaseByCode('R2.1')! };
  // Synthesised, because no real phase can play this role any more: every
  // phase in the catalogue now either carries a processDefinitionKey or is
  // `beyond` (R5.3), and `beyond` short-circuits to 'onbekend' before the key
  // is consulted. The branch is still reachable in practice -- a phase
  // catalogued ahead of its BPMN being deployed sits in exactly this state --
  // so the fixture is built rather than deleted along with the coverage.
  const withoutKey: RipPhase = { ...ripPhaseByCode('R6.1')!, processDefinitionKey: undefined };
  // Synthesised for the same reason as `withoutKey`: R5.3 was the last `beyond`
  // phase and is modelled now, so no real phase exercises this branch.
  const beyond: RipPhase = {
    ...ripPhaseByCode('R5.3')!,
    beyond: true,
    processDefinitionKey: undefined,
  };

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
