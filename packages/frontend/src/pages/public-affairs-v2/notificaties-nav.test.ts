import { describe, it, expect } from 'vitest';
import { PA_MODES, findPaModeForSection, allStaticSections } from './modes.config';

describe('Notificaties nav entry', () => {
  it('sits directly under Zoekcriteria and above Curatiepijplijn in Beheer → Monitoring', () => {
    const beheer = PA_MODES.find((m) => m.id === 'beheer');
    const monitoringGroup = beheer?.groups.find((g) => g.label === 'Monitoring');
    const ids = monitoringGroup?.items.map((i) => i.id);
    expect(ids).toEqual(['bronnen', 'zoekcriteria', 'notificaties', 'curatie-spec']);
  });

  it('resolves through findPaModeForSection', () => {
    expect(findPaModeForSection('notificaties')).toBe('beheer');
  });

  it('is included in allStaticSections (⌘K palette)', () => {
    const ids = allStaticSections().map((s) => s.id);
    expect(ids).toContain('notificaties');
  });
});
