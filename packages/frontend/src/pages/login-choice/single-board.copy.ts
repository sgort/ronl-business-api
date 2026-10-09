// Copy for the single-board landing page, keyed on TenantConfig.organisationType.
// The preview rows and KPIs are illustrative text in the decorative board preview, not live data.
import type { OrganisationType } from '../../services/tenant';

export interface SingleBoardCopy {
  title: string;
  lede: string;
  note: string;
  preview: {
    nav2: string;
    kpis: [string, string, boolean?][];
    rows: [string, string, string, '' | 'late' | 'mine', string][];
  };
  points: [string, string][];
}

export const SINGLE_BOARD_COPY: Record<Exclude<OrganisationType, 'province'>, SingleBoardCopy> = {
  municipality: {
    title: 'Uw werkvoorraad, overzichtelijk op één plek.',
    lede: 'Behandel aanvragen, meldingen en vergunningen vanuit één dashboard: taken, termijnen en dossiers per zaak — met een assistent die meekijkt bij de toetsing.',
    note: 'Met het account van uw werkplek',
    preview: {
      nav2: 'Actieve zaken',
      kpis: [
        ['14', 'open taken'],
        ['3', 'termijn < 2 dagen', true],
        ['6', 'wacht op aanvrager'],
      ],
      rows: [
        ['Omgevingsvergunning — kap 2 iepen', 'Z-2026-04187', 'Termijn verloopt', 'late', '2 dgn'],
        [
          'Melding openbare ruimte — losliggende tegels',
          'Z-2026-04203',
          'Mijn taak',
          'mine',
          '5 dgn',
        ],
        ['Subsidie buurtinitiatief', 'Z-2026-04110', 'Toetsing', '', '9 dgn'],
        ['Evenementenvergunning stadspark', 'Z-2026-03988', 'Advies gevraagd', '', '12 dgn'],
      ],
    },
    points: [
      [
        'Werkvoorraad',
        'Al uw taken en zaken in één lijst, gesorteerd op termijn. Wat vandaag aandacht vraagt, staat bovenaan.',
      ],
      [
        'Zaakdossier',
        'Aanvraag, documenten, correspondentie en besluiten per zaak bij elkaar — zonder te zoeken in losse systemen.',
      ],
      [
        'Assistent',
        'Toetst een aanvraag op volledigheid en de geldende regels, en legt uit waarom. U beslist.',
      ],
    ],
  },
  national: {
    title: 'Aanvragen, wijzigingen en bezwaren in één werkvoorraad.',
    lede: 'Behandel dossiers vanuit één dashboard: wettelijke termijnen, ontbrekende gegevens en vervolgstappen per burger — met een assistent die de berekening en de regels toelicht.',
    note: 'Met het account van uw werkplek',
    preview: {
      nav2: 'Actieve dossiers',
      kpis: [
        ['22', 'open taken'],
        ['5', 'Awb-termijn < 3 dagen', true],
        ['8', 'wacht op gegevens'],
      ],
      rows: [
        [
          'Bezwaar — terugvordering huurtoeslag 2025',
          'T-2026-118402',
          'Termijn verloopt',
          'late',
          '1 dag',
        ],
        ['Wijziging inkomen — zorgtoeslag', 'T-2026-120117', 'Mijn taak', 'mine', '4 dgn'],
        ['Aanvraag kinderopvangtoeslag', 'T-2026-119876', 'Gegevens opgevraagd', '', '10 dgn'],
        ['Herbeoordeling kindgebonden budget', 'T-2026-117551', 'Toetsing', '', '15 dgn'],
      ],
    },
    points: [
      [
        'Werkvoorraad',
        'Taken per dossier op wettelijke termijn. Bezwaren en spoedzaken vallen direct op.',
      ],
      [
        'Dossier per burger',
        'Aanvragen, wijzigingen, berekeningen en brieven in één tijdlijn — zodat u het hele verhaal ziet.',
      ],
      [
        'Assistent',
        'Licht de berekening en toepasselijke regels toe en signaleert ontbrekende gegevens. U beslist.',
      ],
    ],
  },
  commercial: {
    title: 'Al je claims en aanvragen, helder op een rij.',
    lede: 'Handel schadeclaims, polisaanvragen en wijzigingen af vanuit één dashboard. Je ziet direct wat er speelt per klant en wat als eerste moet — met een assistent die meedenkt bij de beoordeling.',
    note: 'Met het account van je werkplek',
    preview: {
      nav2: 'Lopende claims',
      kpis: [
        ['18', 'open taken'],
        ['4', 'SLA < 1 dag', true],
        ['7', 'wacht op klant'],
      ],
      rows: [
        ['Schadeclaim — waterschade keuken', 'C-2026-55210', 'SLA verloopt', 'late', '< 1 dag'],
        ['Polisaanvraag woonverzekering', 'A-2026-30984', 'Mijn taak', 'mine', '3 dgn'],
        ['Claim autoruit — expertise', 'C-2026-55174', 'Bij expert', '', '6 dgn'],
        ['Wijziging dekking inboedel', 'W-2026-11402', 'Beoordeling', '', '8 dgn'],
      ],
    },
    points: [
      [
        'Werkvoorraad',
        'Claims en aanvragen op volgorde van SLA. Wat vandaag af moet, staat bovenaan.',
      ],
      [
        'Klantdossier',
        'Polis, claimhistorie, documenten en contactmomenten per klant op één plek.',
      ],
      [
        'Assistent',
        'Beoordeelt een claim op dekking en volledigheid en laat zien waarom. Jij beslist.',
      ],
    ],
  },
};
