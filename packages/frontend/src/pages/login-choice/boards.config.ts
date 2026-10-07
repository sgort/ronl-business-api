import { INFRA_GATE_ROLE } from '../infra-board/modes.config';
import { WOO_GATE_ROLE } from '../woo/modes.config';

export type BoardId = 'caseworker' | 'public-affairs' | 'infra-board' | 'woo';
export type PreviewKind = 'case' | 'pa' | 'infra' | 'woo';

export interface BoardEntry {
  id: BoardId;
  role: string;
  route: string;
  roleLabel: string;
  title: string;
  preview: PreviewKind;
  blurb: string;
  testUser: string;
  /**
   * The Entra ID app role that grants `role` (scripts/keycloak-entra-idp.json).
   * Set, the card offers "Flevoland-account" and the no-access dialog names it.
   * Woo has none until Flevoland IT creates one.
   */
  entraRole?: string;
}

export const BOARDS: BoardEntry[] = [
  {
    id: 'caseworker',
    role: 'caseworker',
    route: '/dashboard/caseworker',
    roleLabel: 'Caseworker',
    title: 'Caseworker',
    preview: 'case',
    blurb:
      'Persoonlijke werkvoorraad voor zaakbehandelaars: taken, claims en ' +
      'deadlines per zaak — met een ingebouwde assistent voor snelle toetsing.',
    testUser: 'test-caseworker-flevoland',
    entraRole: 'IOU_USERS',
  },
  {
    id: 'public-affairs',
    role: 'public-affairs',
    route: '/dashboard/public-affairs',
    roleLabel: 'Public Affairs',
    title: 'PA-Cockpit',
    preview: 'pa',
    blurb:
      'Bestuurlijk overzicht van dossiers en issues: een kompas dat prioriteit ' +
      'en momentum weegt, zodat het bestuur op tijd kan bijsturen.',
    testUser: 'test-pa-flevoland',
    entraRole: 'IOU_PA',
  },
  {
    id: 'infra-board',
    role: INFRA_GATE_ROLE,
    route: '/dashboard/infra-board',
    roleLabel: 'Programma & Projecten',
    title: 'Infra-board',
    preview: 'infra',
    blurb:
      'Portfoliosturing op infrastructuurprojecten: fase-swimlanes, status ' +
      'per project en RIP-beheer — van planvorming tot oplevering.',
    testUser: 'test-infra-flevoland',
    entraRole: 'IOU_INFRA',
  },
  {
    id: 'woo',
    role: WOO_GATE_ROLE,
    route: '/dashboard/woo',
    roleLabel: 'Bestuur & Verantwoording',
    title: 'Woo-dashboard',
    preview: 'woo',
    blurb:
      'Sturing op de Wet open overheid: compliance, doorlooptijden, ' +
      'procesknelpunten en actieve openbaarmaking — met stoplichten en een ' +
      'benchmark op "Woo in cijfers".',
    testUser: 'test-woo-flevoland',
  },
];
