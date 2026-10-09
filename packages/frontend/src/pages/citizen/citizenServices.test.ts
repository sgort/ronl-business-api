import { describe, expect, it } from 'vitest';
import { CITIZEN_SERVICES } from '@ronl/shared';
import { CITIZEN_SERVICE_UI } from './citizenServiceUi';

// The registry (@ronl/shared) decides which services exist and where; this
// map only gives them a face. They must name the same services: one without
// the other is a card that cannot render, or UI for nothing.
describe('citizen services', () => {
  it('the UI map and the registry cover the same service ids', () => {
    expect(Object.keys(CITIZEN_SERVICE_UI).sort()).toEqual(
      CITIZEN_SERVICES.map((s) => s.id).sort()
    );
  });

  it('keeps each service in its scope (#344)', () => {
    expect(Object.fromEntries(CITIZEN_SERVICES.map((s) => [s.id, s.scope]))).toEqual({
      zorgtoeslag: 'cross-tenant',
      vergunningen: 'own-tenant',
      subsidies: 'own-tenant',
      heusdenpas: 'own-tenant',
    });
  });
});
