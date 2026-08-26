export type FeitThemaKey = 'welvaart' | 'economie' | 'ruimte' | 'groen' | 'energie';

export interface FeitThema {
  key: FeitThemaKey;
  label: string;
  kleur: string;
}

export interface FeitMonitor {
  thema: FeitThemaKey;
  naam: string;
  icon: string;
  url: string;
  desc: string;
  dossiers: string[];
  bijgewerkt: string;
}

export const FEITEN_HUB = 'https://feitelijkflevoland.nl/monitoren.aspx';

export const FEITEN_THEMAS: FeitThema[] = [
  { key: 'welvaart', label: 'Brede welvaart & leefbaarheid', kleur: '#0046ad' },
  { key: 'economie', label: 'Economie & werk', kleur: '#8a6d00' },
  { key: 'ruimte', label: 'Wonen, ruimte & mobiliteit', kleur: '#b0103c' },
  { key: 'groen', label: 'Landbouw, natuur & water', kleur: '#2f8f4e' },
  { key: 'energie', label: 'Klimaat & energie', kleur: '#e70077' },
];

export const FEITEN_MONITOREN: FeitMonitor[] = [
  {
    thema: 'welvaart',
    naam: 'Monitor Brede Welvaart',
    icon: 'bredewelvaart.png',
    url: 'https://feitelijkflevoland.nl/content/monitor-brede-welvaart',
    desc: 'Beeld van hoe het met de provincie, gemeenten en haar inwoners gaat.',
    dossiers: [],
    bijgewerkt: '2025',
  },
  {
    thema: 'welvaart',
    naam: 'Inwonerspeiling Brede Welvaart',
    icon: 'inwonerspeiling.png',
    url: 'https://feitelijkflevoland.nl/dashboard/images/inwonerspeiling2024.pdf',
    desc: 'Hoe Flevolanders hun brede welvaart zelf ervaren — de eerste peiling.',
    dossiers: [],
    bijgewerkt: '2025',
  },
  {
    thema: 'welvaart',
    naam: 'Voorzieningenmonitor Flevoland',
    icon: 'voorzieningenmonitor.png',
    url: 'https://data.flevoland.nl/voorzieningenmonitor_flevoland/',
    desc: 'Het voorzieningenniveau van Flevoland — nu en in de toekomst.',
    dossiers: [],
    bijgewerkt: '2024',
  },
  {
    thema: 'welvaart',
    naam: 'Monitor Positieve Gezondheid',
    icon: 'positievegezondheid.png',
    url: 'https://feitelijkflevoland.nl/dashboard/positieve-gezondheid',
    desc: "Een bredere kijk op gezondheid, uitgewerkt in zes thema's.",
    dossiers: ['jeugdzorg'],
    bijgewerkt: '2024',
  },
  {
    thema: 'economie',
    naam: 'Monitor Economisch Programma',
    icon: 'economischprogramma.png',
    url: 'https://feitelijkflevoland.nl/dashboard/dashboard/economie',
    desc: 'Voortgang op de doelen en waarden van het Economisch Programma.',
    dossiers: ['energie'],
    bijgewerkt: '2025',
  },
  {
    thema: 'economie',
    naam: 'Werkgelegenheidsonderzoek',
    icon: 'werkgelegenheidsonderzoek.png',
    url: 'https://feitelijkflevoland.nl/dashboard/werkgelegenheidsonderzoek-2024/samenvatting',
    desc: 'Uitkomsten van het jaarlijkse werkgelegenheidsonderzoek van de provincie.',
    dossiers: ['lelystad', 'energie'],
    bijgewerkt: '2025',
  },
  {
    thema: 'ruimte',
    naam: 'Monitor Wonen',
    icon: 'wonen.png',
    url: 'https://monitorwonen-flevoland.hub.arcgis.com/',
    desc: 'Stand van zaken en de toekomstige woningbouwplannen in Flevoland.',
    dossiers: [],
    bijgewerkt: '2025',
  },
  {
    thema: 'ruimte',
    naam: 'Programma Mobiliteit & Ruimte',
    icon: 'mobiliteitenruimte.png',
    url: 'https://feitelijkflevoland.nl/dashboard/programma-mobiliteit-en-ruimte/',
    desc: 'Voortgang op de tien mobiliteitsdoelen van het programma.',
    dossiers: ['lelystad'],
    bijgewerkt: '2025',
  },
  {
    thema: 'ruimte',
    naam: 'Omgevingsvisie FlevolandStraks',
    icon: 'omgevingsvisie.png',
    url: 'https://feitelijkflevoland.nl/dashboard/monitor-omgevingsvisie-2023',
    desc: 'Voortgang van de zeven opgaven bij de Omgevingsvisie.',
    dossiers: ['stikstof', 'energie'],
    bijgewerkt: '2025',
  },
  {
    thema: 'groen',
    naam: 'Kennishub Landelijk Gebied',
    icon: 'kennishub.png',
    url: 'https://kennishub-landelijkgebied-flevoland.hub.arcgis.com/',
    desc: 'Stand van zaken en ontwikkelingen in het Flevolandse landelijke gebied.',
    dossiers: ['stikstof'],
    bijgewerkt: '2025',
  },
  {
    thema: 'groen',
    naam: 'Monitor Landschap',
    icon: 'landschap.png',
    url: 'https://monitor-landschap-flevoland.hub.arcgis.com/',
    desc: 'Hoe het landschap verandert en of gewaardeerde elementen behouden blijven.',
    dossiers: ['stikstof', 'oostvaarders'],
    bijgewerkt: '2024',
  },
  {
    thema: 'groen',
    naam: 'Monitor Waterprogramma',
    icon: 'waterprogramma.png',
    url: 'https://kaart.flevoland.nl/monitorwaterprogramma/',
    desc: 'Monitoring van doelstellingen en activiteiten van het waterbeleid.',
    dossiers: ['stikstof'],
    bijgewerkt: '2025',
  },
  {
    thema: 'energie',
    naam: 'Voortgangsrapportage Klimaat en Energie 2025',
    icon: 'klimaatenenergie.png',
    url: 'https://feitelijkflevoland.nl/dashboard/rapportage-klimaat-en-energie-2025/1--inleiding',
    desc: 'De belangrijkste trends en ontwikkelingen rondom klimaat en energie.',
    dossiers: ['energie'],
    bijgewerkt: '2025',
  },
  {
    thema: 'energie',
    naam: 'Regionale Energie Strategie (RES 1.0)',
    icon: 'regionaleenergiestrategie.png',
    url: 'https://feitelijkflevoland.nl/dashboard/monitor-res-flevoland/',
    desc: 'Voortgang van de Flevolandse Regionale Energie Strategie.',
    dossiers: ['energie'],
    bijgewerkt: '2024',
  },
];
