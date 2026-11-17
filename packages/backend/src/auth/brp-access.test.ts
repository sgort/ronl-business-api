import { brpAccess } from './brp-access';

// #319, decided 16-17 November 2026: a citizen may look up only their own
// record, at assurance level hoog; a brp-raadpleger (every caseworker, through
// the caseworker composite) may look up anyone, at substantieel -- the level
// Entra ID logins carry.
const citizen = (overrides: Record<string, unknown> = {}) => ({
  roles: ['citizen'],
  assuranceLevel: 'hoog' as const,
  bsn: '999990019',
  ...overrides,
});
const raadpleger = (assuranceLevel: string) => ({
  roles: ['caseworker', 'brp-raadpleger'],
  assuranceLevel: assuranceLevel as never,
});

describe('brpAccess: brp-raadpleger', () => {
  it('may look up anyone at substantieel', () => {
    expect(brpAccess(raadpleger('substantieel'), ['999990019', '999992235'])).toEqual({
      allowed: true,
      via: 'brp-raadpleger',
    });
  });

  it('may look up anyone at hoog', () => {
    expect(brpAccess(raadpleger('hoog'), ['999992235'])).toEqual({
      allowed: true,
      via: 'brp-raadpleger',
    });
  });

  it('is refused below substantieel', () => {
    expect(brpAccess(raadpleger('midden'), ['999992235'])).toMatchObject({
      allowed: false,
      code: 'INSUFFICIENT_ASSURANCE',
    });
  });

  it('needs no bsn claim of its own', () => {
    expect(brpAccess(raadpleger('substantieel'), ['999992235']).allowed).toBe(true);
  });
});

describe('brpAccess: own record', () => {
  it('allows a lookup of only the caller’s own BSN at hoog', () => {
    expect(brpAccess(citizen(), ['999990019'])).toEqual({ allowed: true, via: 'own-record' });
  });

  it('allows the own BSN listed twice', () => {
    expect(brpAccess(citizen(), ['999990019', '999990019']).allowed).toBe(true);
  });

  it.each([['substantieel'], ['midden'], ['basis'], [undefined]])(
    'is refused at assurance level %s',
    (assuranceLevel) => {
      expect(brpAccess(citizen({ assuranceLevel }), ['999990019'])).toMatchObject({
        allowed: false,
        code: 'INSUFFICIENT_ASSURANCE',
      });
    }
  );

  it('is refused without a bsn claim', () => {
    expect(brpAccess(citizen({ bsn: undefined }), ['999990019'])).toMatchObject({
      allowed: false,
      code: 'BSN_CLAIM_MISSING',
    });
  });

  it('is refused for someone else’s BSN', () => {
    expect(brpAccess(citizen(), ['999992235'])).toMatchObject({
      allowed: false,
      code: 'BRP_SUBJECT_MISMATCH',
    });
  });

  it('is refused for a list mixing the own BSN with someone else’s', () => {
    expect(brpAccess(citizen(), ['999990019', '999992235'])).toMatchObject({
      allowed: false,
      code: 'BRP_SUBJECT_MISMATCH',
    });
  });

  // A query that is not by BSN (a search by name, address, ...) can return
  // anyone, so it is not a lookup of the caller's own record.
  it.each([[undefined], [[]], ['999990019'], [[999990019]]])(
    'is refused when the query names no BSN list (%p)',
    (requested) => {
      expect(brpAccess(citizen(), requested)).toMatchObject({
        allowed: false,
        code: 'BRP_SUBJECT_MISMATCH',
      });
    }
  );

  it('applies to any caller without the role, not only citizens', () => {
    expect(
      brpAccess({ roles: ['woo-coordinatie'], assuranceLevel: 'hoog' }, ['999990019'])
    ).toMatchObject({ allowed: false, code: 'BSN_CLAIM_MISSING' });
  });

  it('treats a missing roles claim as no role', () => {
    expect(brpAccess({ assuranceLevel: 'hoog', bsn: '999990019' } as never, ['999990019'])).toEqual(
      { allowed: true, via: 'own-record' }
    );
  });
});
