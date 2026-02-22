export interface BRPDatum {
  type: 'Datum';
  datum: string; // YYYY-MM-DD
  langFormaat: string;
}

export interface BRPWaardetabel {
  code: string;
  omschrijving: string;
}

export interface BRPNaam {
  voornamen: string;
  geslachtsnaam: string;
  voorletters: string;
  volledigeNaam?: string;
}

export interface BRPGeboorte {
  land: BRPWaardetabel;
  plaats: BRPWaardetabel;
  datum: BRPDatum;
}

export interface BRPPartner {
  burgerservicenummer: string;
  geslacht: BRPWaardetabel;
  soortVerbintenis: BRPWaardetabel;
  naam: BRPNaam;
  geboorte: BRPGeboorte;
  aangaanHuwelijkPartnerschap: {
    datum: BRPDatum;
    land: BRPWaardetabel;
    plaats: BRPWaardetabel;
  };
}

export interface BRPKind {
  burgerservicenummer: string;
  leeftijd?: number;
  naam: BRPNaam;
  geboorte: BRPGeboorte;
}

export interface PersonState {
  burgerservicenummer: string;
  leeftijd: number;
  naam: BRPNaam;
  geboorte: BRPGeboorte;
  partners?: BRPPartner[];
  kinderen?: BRPKind[];
}

export interface BRPEvent {
  id: string;
  type: BRPEventType;
  date: Date;
  label: string;
  description: string;
}

export interface BRPPersonHistoricalData {
  bsn: string;
  events: BRPEvent[];
  earliestDate: Date;
  latestDate: Date;
}

export interface TimelineConfig {
  displayFields: {
    person: string[];
    partner: string[];
    children: string[];
  };
}

export interface BRPDatum {
  type: 'Datum';
  datum: string; // YYYY-MM-DD
  langFormaat: string;
}

export interface BRPWaardetabel {
  code: string;
  omschrijving: string;
}

export interface BRPNaam {
  aanduidingNaamgebruik?: {
    code: string;
    omschrijving: string;
  };
  voornamen: string;
  geslachtsnaam: string;
  voorletters: string;
  volledigeNaam?: string;
}

export interface BRPGeboorte {
  land: BRPWaardetabel;
  plaats: BRPWaardetabel;
  datum: BRPDatum;
}

export interface BRPPartner {
  burgerservicenummer: string;
  geslacht: BRPWaardetabel;
  soortVerbintenis: BRPWaardetabel;
  naam: BRPNaam;
  geboorte: BRPGeboorte;
  aangaanHuwelijkPartnerschap: {
    datum: BRPDatum;
    land: BRPWaardetabel;
    plaats: BRPWaardetabel;
  };
}

export interface BRPKind {
  burgerservicenummer: string;
  leeftijd?: number;
  naam: BRPNaam;
  geboorte: BRPGeboorte;
}

export interface PersonState {
  burgerservicenummer: string;
  leeftijd: number;
  naam: BRPNaam;
  geboorte: BRPGeboorte;
  partners?: BRPPartner[];
  kinderen?: BRPKind[];
}

export interface BRPPersonenResponse {
  type: string;
  personen: PersonState[];
}

export type BRPEventType = 'birth' | 'marriage' | 'divorce' | 'death' | 'address_change';

export interface BRPEvent {
  id: string;
  type: BRPEventType;
  date: Date;
  label: string;
  description: string;
}

export interface BRPPersonHistoricalData {
  bsn: string;
  events: BRPEvent[];
  earliestDate: Date;
  latestDate: Date;
  currentState: PersonState | null;
}

export interface TimelineConfig {
  displayFields: {
    person: string[];
    partner: string[];
    children: string[];
  };
}
