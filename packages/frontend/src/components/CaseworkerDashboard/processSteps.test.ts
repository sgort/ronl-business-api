import { describe, expect, it } from 'vitest';
import { activityTypeLabel, AUTOMATED_TYPES, EXCLUDED_VARS, humanizeKey } from './processSteps';

describe('activityTypeLabel', () => {
  it('maps a known Operaton activity type to its Dutch label', () => {
    expect(activityTypeLabel('userTask')).toBe('Gebruikerstaak');
    expect(activityTypeLabel('businessRuleTask')).toBe('Beslissing');
  });

  it('falls back to the raw type for an unknown activity type', () => {
    expect(activityTypeLabel('someNewType')).toBe('someNewType');
  });
});

describe('AUTOMATED_TYPES', () => {
  it('contains the non-human activity types and excludes userTask', () => {
    expect(AUTOMATED_TYPES.has('serviceTask')).toBe(true);
    expect(AUTOMATED_TYPES.has('externalTask')).toBe(true);
    expect(AUTOMATED_TYPES.has('userTask')).toBe(false);
  });
});

describe('EXCLUDED_VARS', () => {
  it('includes the internal-plumbing variable names', () => {
    expect(EXCLUDED_VARS).toContain('municipality');
    expect(EXCLUDED_VARS).toContain('initiator');
  });
});

describe('humanizeKey', () => {
  it('splits camelCase and capitalizes the first letter', () => {
    expect(humanizeKey('edocsWorkspaceId')).toBe('Edocs Workspace Id');
  });

  it('replaces underscores and hyphens with spaces', () => {
    expect(humanizeKey('some_snake-key')).toBe('Some snake key');
  });

  it('leaves an already-lowercase single word capitalized', () => {
    expect(humanizeKey('status')).toBe('Status');
  });
});
