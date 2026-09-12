import { describe, it, expect, beforeEach } from 'vitest';
import { forceMockMode } from './main-helpers';
// The real predicate every cockpit service branches on, read through the
// package's public surface — not a restatement of it here.
import { isPaMock } from '@ronl/pa-cockpit';

describe('forced mock mode', () => {
  beforeEach(() => localStorage.clear());

  it('is mock with no key set, from the build-time default', () => {
    expect(isPaMock()).toBe(true);
  });

  it('overrides an inherited live key', () => {
    // Another Open Regels app on the same origin could have left '0' behind.
    localStorage.setItem('paV2.mock', '0');
    expect(isPaMock()).toBe(false);
    forceMockMode();
    expect(isPaMock()).toBe(true);
  });

  it('survives a storage failure without throwing', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('storage disabled');
    };
    expect(() => forceMockMode()).not.toThrow();
    Storage.prototype.setItem = original;
  });
});
