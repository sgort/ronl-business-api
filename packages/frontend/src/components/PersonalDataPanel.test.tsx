// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonalDataPanel } from './PersonalDataPanel';
import type { BRPKind, BRPPartner, PersonState, TimelineConfig } from '../types/brp.types';

const emptyConfig = {} as TimelineConfig;

function datum(langFormaat: string) {
  return { type: 'Datum' as const, datum: '2000-01-01', langFormaat };
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
      datum: datum('1 januari 1980'),
    },
    ...overrides,
  };
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
      datum: datum('1 januari 1980'),
    },
    aangaanHuwelijkPartnerschap: {
      datum: datum('15 juni 2005'),
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
      datum: datum('20 maart 2010'),
    },
    ...overrides,
  };
}

describe('PersonalDataPanel', () => {
  it('shows a placeholder when there is no personState', () => {
    render(<PersonalDataPanel personState={null} config={emptyConfig} />);
    expect(screen.getByText('Geen gegevens beschikbaar voor deze datum')).toBeInTheDocument();
  });

  it('renders the core person fields and no partner/children sections when absent', () => {
    render(<PersonalDataPanel personState={makePerson()} config={emptyConfig} />);

    expect(screen.getByText('Wessel Kooyman')).toBeInTheDocument();
    expect(screen.getByText('999992235')).toBeInTheDocument();
    expect(screen.getByText('45 jaar')).toBeInTheDocument();
    expect(screen.getByText('1 januari 1980')).toBeInTheDocument();
    expect(screen.queryByText('Partner')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Kinderen/)).not.toBeInTheDocument();
  });

  it('renders a partner section for each partner', () => {
    const person = makePerson({ partners: [makePartner()] });
    render(<PersonalDataPanel personState={person} config={emptyConfig} />);

    expect(screen.getByText('Partner')).toBeInTheDocument();
    expect(screen.getByText('Marieke Jansen')).toBeInTheDocument();
    expect(screen.getByText('Huwelijk')).toBeInTheDocument();
    expect(screen.getByText('15 juni 2005')).toBeInTheDocument();
  });

  it('renders a children section with count and per-child age, omitting age when undefined', () => {
    const withAge = makeKind({ leeftijd: 12 });
    const withoutAge = makeKind({
      burgerservicenummer: '333333333',
      naam: { voornamen: 'Andere', geslachtsnaam: 'Jansen', voorletters: 'A.' },
      leeftijd: undefined,
    });
    const person = makePerson({ kinderen: [withAge, withoutAge] });

    render(<PersonalDataPanel personState={person} config={emptyConfig} />);

    expect(screen.getByText('Kinderen (2)')).toBeInTheDocument();
    expect(screen.getByText('12 jaar')).toBeInTheDocument();
    expect(screen.getByText('Andere Jansen')).toBeInTheDocument();
  });
});
