import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BRPKind, BRPPartner, PersonState } from '../types/brp.types';
import {
  calculateHistoricalState,
  extractEvents,
  getHistoricalStateForDate,
  getPersonTimeline,
} from './brp.timeline';

const mockGetPersonByBSN = vi.hoisted(() => vi.fn());

vi.mock('./brp.api', () => ({ brpApi: { getPersonByBSN: mockGetPersonByBSN } }));

function datum(date: string) {
  return { type: 'Datum' as const, datum: date, langFormaat: date };
}

function makePartner(overrides: Partial<BRPPartner> = {}): BRPPartner {
  return {
    burgerservicenummer: '111111111',
    geslacht: { code: 'V', omschrijving: 'Vrouw' },
    soortVerbintenis: { code: 'H', omschrijving: 'Huwelijk' },
    naam: { voornamen: 'Marieke', geslachtsnaam: 'Jansen', voorletters: 'M.' },
    geboorte: {
      land: { code: 'NL', omschrijving: 'Nederland' },
      plaats: { code: 'UT', omschrijving: 'Utrecht' },
      datum: datum('1980-01-01'),
    },
    aangaanHuwelijkPartnerschap: {
      datum: datum('2005-06-15'),
      land: { code: 'NL', omschrijving: 'Nederland' },
      plaats: { code: 'UT', omschrijving: 'Utrecht' },
    },
    ...overrides,
  };
}

function makeKind(overrides: Partial<BRPKind> = {}): BRPKind {
  return {
    burgerservicenummer: '222222222',
    naam: { voornamen: 'Kind', geslachtsnaam: 'Jansen', voorletters: 'K.' },
    geboorte: {
      land: { code: 'NL', omschrijving: 'Nederland' },
      plaats: { code: 'UT', omschrijving: 'Utrecht' },
      datum: datum('2010-03-20'),
    },
    ...overrides,
  };
}

function makePerson(overrides: Partial<PersonState> = {}): PersonState {
  return {
    burgerservicenummer: '999992235',
    leeftijd: 45,
    naam: {
      voornamen: 'Wessel',
      geslachtsnaam: 'Kooyman',
      voorletters: 'W.',
      volledigeNaam: 'Wessel Kooyman',
    },
    geboorte: {
      land: { code: 'NL', omschrijving: 'Nederland' },
      plaats: { code: 'UT', omschrijving: 'Utrecht' },
      datum: datum('1980-01-01'),
    },
    ...overrides,
  };
}

describe('calculateHistoricalState', () => {
  it('returns null when the target date is before birth', () => {
    const person = makePerson();
    expect(calculateHistoricalState(person, new Date('1970-01-01'))).toBeNull();
  });

  it('recalculates age at the target date', () => {
    const person = makePerson({
      geboorte: { ...makePerson().geboorte, datum: datum('2000-01-01') },
    });

    const result = calculateHistoricalState(person, new Date('2010-01-01'));

    expect(result?.leeftijd).toBe(10);
  });

  it('excludes partners married after the target date and drops the field when none remain', () => {
    const person = makePerson({
      partners: [
        makePartner({
          aangaanHuwelijkPartnerschap: {
            ...makePartner().aangaanHuwelijkPartnerschap,
            datum: datum('2015-01-01'),
          },
        }),
      ],
    });

    const result = calculateHistoricalState(person, new Date('2010-01-01'));

    expect(result).not.toHaveProperty('partners');
  });

  it('keeps partners married on or before the target date', () => {
    const person = makePerson({ partners: [makePartner()] }); // married 2005-06-15

    const result = calculateHistoricalState(person, new Date('2010-01-01'));

    expect(result?.partners).toHaveLength(1);
  });

  it('excludes children born after the target date and drops the field when none remain', () => {
    const person = makePerson({ kinderen: [makeKind()] }); // born 2010-03-20

    const result = calculateHistoricalState(person, new Date('2005-01-01'));

    expect(result).not.toHaveProperty('kinderen');
  });

  it('keeps children born on or before the target date with a recalculated age', () => {
    const person = makePerson({ kinderen: [makeKind()] }); // born 2010-03-20

    const result = calculateHistoricalState(person, new Date('2020-03-20'));

    expect(result?.kinderen).toHaveLength(1);
    expect(result?.kinderen?.[0].leeftijd).toBe(10);
  });
});

describe('extractEvents', () => {
  it('always includes a birth event using the full name when available', () => {
    const events = extractEvents(makePerson());

    const birth = events.find((e) => e.id === 'birth');
    expect(birth).toMatchObject({
      type: 'birth',
      label: 'Geboren',
      description: 'Geboorte Wessel Kooyman',
    });
  });

  it('adds a marriage event per partner', () => {
    const events = extractEvents(makePerson({ partners: [makePartner()] }));

    const marriage = events.find((e) => e.id === 'marriage-0');
    expect(marriage).toMatchObject({
      type: 'marriage',
      label: 'Getrouwd',
      description: 'Huwelijk met Marieke Jansen',
    });
  });

  it('adds one birth event per child on a unique date', () => {
    const events = extractEvents(makePerson({ kinderen: [makeKind()] }));

    const childBirth = events.find((e) => e.id === 'child-birth-222222222');
    expect(childBirth).toMatchObject({
      label: 'Kind geboren',
      description: 'Geboorte Kind Jansen',
    });
  });

  it('groups twins born on the same date into one event', () => {
    const twinA = makeKind({
      burgerservicenummer: 'a',
      naam: { voornamen: 'Anna', geslachtsnaam: 'Jansen', voorletters: 'A.' },
    });
    const twinB = makeKind({
      burgerservicenummer: 'b',
      naam: { voornamen: 'Bram', geslachtsnaam: 'Jansen', voorletters: 'B.' },
    });

    const events = extractEvents(makePerson({ kinderen: [twinA, twinB] }));

    const grouped = events.find((e) => e.id.startsWith('child-birth-2010'));
    expect(grouped).toMatchObject({
      label: 'Kinderen geboren (tweeling)',
      description: 'Geboorte Anna, Bram',
    });
  });

  it('sorts events chronologically regardless of input order', () => {
    const person = makePerson({
      partners: [makePartner()], // 2005-06-15
      kinderen: [makeKind()], // 2010-03-20
    });

    const events = extractEvents(person);

    const dates = events.map((e) => e.date.getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
    expect(events[0].id).toBe('birth'); // 1980, earliest
  });
});

describe('getPersonTimeline', () => {
  beforeEach(() => {
    mockGetPersonByBSN.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the person is not found', async () => {
    mockGetPersonByBSN.mockResolvedValue(null);

    expect(await getPersonTimeline('999992235')).toBeNull();
  });

  it('builds a timeline with events and a 2-year pre-birth start date', async () => {
    mockGetPersonByBSN.mockResolvedValue(makePerson());

    const result = await getPersonTimeline('999992235');

    expect(result?.bsn).toBe('999992235');
    expect(result?.events.some((e) => e.id === 'birth')).toBe(true);
    expect(result?.earliestDate.getUTCFullYear()).toBe(1978); // birth year 1980 - 2
  });

  it('returns null and logs when the lookup throws', async () => {
    mockGetPersonByBSN.mockRejectedValue(new Error('brp down'));

    expect(await getPersonTimeline('999992235')).toBeNull();
  });
});

describe('getHistoricalStateForDate', () => {
  beforeEach(() => {
    mockGetPersonByBSN.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the person is not found', async () => {
    mockGetPersonByBSN.mockResolvedValue(null);

    expect(await getHistoricalStateForDate('999992235', new Date('2010-01-01'))).toBeNull();
  });

  it('delegates to calculateHistoricalState for the fetched person', async () => {
    mockGetPersonByBSN.mockResolvedValue(makePerson());

    const result = await getHistoricalStateForDate('999992235', new Date('2010-01-01'));

    expect(result?.leeftijd).toBe(30);
  });

  it('returns null and logs when the lookup throws', async () => {
    mockGetPersonByBSN.mockRejectedValue(new Error('brp down'));

    expect(await getHistoricalStateForDate('999992235', new Date('2010-01-01'))).toBeNull();
  });
});
