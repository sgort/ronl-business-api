// packages/public-site/src/pages/herkomst/herkomstTrail.test.ts
import { describe, it, expect } from 'vitest';
import { nextTrail } from './herkomstTrail';

describe('nextTrail', () => {
  it('pushes a new id onto the end of the trail', () => {
    expect(nextTrail(['leeftijd'], 'geboortedatum')).toEqual(['leeftijd', 'geboortedatum']);
  });

  it('is a no-op when the id is already at the end of the trail', () => {
    expect(nextTrail(['leeftijd', 'geboortedatum'], 'geboortedatum')).toEqual([
      'leeftijd',
      'geboortedatum',
    ]);
  });
});
