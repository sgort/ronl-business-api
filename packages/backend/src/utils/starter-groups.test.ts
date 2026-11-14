/**
 * Unit tests for the candidate-starter helpers: who may start a process, as the
 * BPMN model declares it, and whether the process has a start form to start it
 * with. Pure functions over BPMN XML, so tested directly.
 */
export {};

import { hasStartForm, mayStart, parseStarterGroups } from './starter-groups';

/** A minimal process as the LDE Modeler writes it, with the camunda prefix. */
const bpmn = (processAttrs: string, body = '') => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P" isExecutable="true" ${processAttrs}>
    ${body}
  </bpmn:process>
</bpmn:definitions>`;

describe('parseStarterGroups', () => {
  it('reads one group', () => {
    expect(parseStarterGroups(bpmn('camunda:candidateStarterGroups="caseworker"'), 'P')).toEqual([
      'caseworker',
    ]);
  });

  it('splits on commas, trims, and drops empty entries', () => {
    expect(
      parseStarterGroups(bpmn('camunda:candidateStarterGroups=" caseworker , ,HR "'), 'P')
    ).toEqual(['caseworker', 'HR']);
  });

  it('is null when the attribute is absent', () => {
    expect(parseStarterGroups(bpmn(''), 'P')).toBeNull();
  });

  it('is null when the attribute names no group', () => {
    expect(parseStarterGroups(bpmn('camunda:candidateStarterGroups=""'), 'P')).toBeNull();
    expect(parseStarterGroups(bpmn('camunda:candidateStarterGroups=" , "'), 'P')).toBeNull();
  });
});

describe('hasStartForm', () => {
  it('is true for a top-level start event with a form', () => {
    expect(
      hasStartForm(bpmn('', '<bpmn:startEvent id="S" camunda:formRef="intake-form" />'), 'P')
    ).toBe(true);
  });

  it('is false for a top-level start event without one', () => {
    expect(hasStartForm(bpmn('', '<bpmn:startEvent id="S" />'), 'P')).toBe(false);
  });

  it('ignores a form on a start event inside a subprocess', () => {
    const body = `<bpmn:startEvent id="S" />
      <bpmn:subProcess id="Sub">
        <bpmn:startEvent id="SubStart" camunda:formRef="inner-form" />
      </bpmn:subProcess>`;
    expect(hasStartForm(bpmn('', body), 'P')).toBe(false);
  });
});

describe('mayStart', () => {
  it('allows anyone when the process declares no starter groups', () => {
    expect(mayStart(['caseworker'], null)).toBe(true);
    expect(mayStart([], null)).toBe(true);
  });

  it('allows a user with one of the declared groups as a role', () => {
    expect(mayStart(['citizen', 'caseworker'], ['caseworker'])).toBe(true);
  });

  it('refuses a user with none of them', () => {
    expect(mayStart(['citizen'], ['caseworker'])).toBe(false);
    expect(mayStart([], ['caseworker'])).toBe(false);
  });

  it('compares group names case-sensitively, as Keycloak roles are', () => {
    expect(mayStart(['Caseworker'], ['caseworker'])).toBe(false);
  });
});

describe('a file with more than one process', () => {
  // A collaboration: two pools, each its own process. Operaton returns the whole
  // deployed file for either definition, so each must read its own process.
  const twoPools = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="D">
  <bpmn:process id="A" camunda:candidateStarterGroups="caseworker">
    <bpmn:startEvent id="SA" camunda:formRef="a-form" />
  </bpmn:process>
  <bpmn:process id="B" camunda:candidateStarterGroups="hr-medewerker">
    <bpmn:startEvent id="SB" />
  </bpmn:process>
</bpmn:definitions>`;

  it('reads the starter groups of the process with the given key', () => {
    expect(parseStarterGroups(twoPools, 'A')).toEqual(['caseworker']);
    expect(parseStarterGroups(twoPools, 'B')).toEqual(['hr-medewerker']);
  });

  it('reads the start form of the process with the given key', () => {
    expect(hasStartForm(twoPools, 'A')).toBe(true);
    expect(hasStartForm(twoPools, 'B')).toBe(false);
  });

  it('finds nothing for a key the file does not contain', () => {
    expect(parseStarterGroups(twoPools, 'C')).toBeNull();
    expect(hasStartForm(twoPools, 'C')).toBe(false);
  });
});
