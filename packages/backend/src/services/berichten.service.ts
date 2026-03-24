export interface BerichtItem {
  id: string;
  subject: string;
  preview: string;
  content: string | null;
  type: 'announcement' | 'maintenance' | 'update';
  status: 'published';
  audience: 'all';
  sender: { id: string; name: string };
  publishedAt: string;
  expiresAt: string | null;
  priority: 'low' | 'normal' | 'high';
  isRead: boolean;
  action: { label: string; url: string } | null;
}

const SEED: BerichtItem[] = [
  {
    id: 'bericht-001',
    subject: 'Nieuwe versie: kapvergunningproces v2.1.0',
    preview:
      'Het kapvergunningproces is bijgewerkt. De medewerkersbeoordeling verloopt nu via een apart taakformulier.',
    content:
      '<p>Versie 2.1.0 bevat een herstructurering van het BPMN-subprocess voor kapvergunningen. De casusbeoordeling door een medewerker vereist nu altijd een expliciete claimstap voordat het formulier kan worden ingevuld. Zie de releasenotes voor details.</p>',
    type: 'update',
    status: 'published',
    audience: 'all',
    sender: { id: 'ontwikkelteam', name: 'Ontwikkelteam RONL' },
    publishedAt: '2026-03-06T09:30:00Z',
    expiresAt: null,
    priority: 'normal',
    isRead: false,
    action: {
      label: 'Bekijk releasenotes',
      url: 'https://iou-architectuur.open-regels.nl/ronl-business-api/',
    },
  },
  {
    id: 'bericht-002',
    subject: 'Gepland onderhoud — zondag 15 maart 22:00–23:00',
    preview:
      'Het portaal kan zondag 15 maart tussen 22:00 en 23:00 tijdelijk minder goed bereikbaar zijn vanwege onderhoudswerkzaamheden.',
    content:
      '<p>Op zondag 15 maart voeren wij onderhoudswerkzaamheden uit. Het portaal is tussen 22:00 en 23:00 mogelijk tijdelijk niet beschikbaar. Zorg dat u lopende werkzaamheden voor die tijd hebt opgeslagen.</p>',
    type: 'maintenance',
    status: 'published',
    audience: 'all',
    sender: { id: 'beheer', name: 'Beheerteam' },
    publishedAt: '2026-03-09T10:00:00Z',
    expiresAt: '2026-03-16T00:00:00Z',
    priority: 'high',
    isRead: false,
    action: null,
  },
  {
    id: 'bericht-003',
    subject: 'DigiD-koppeling succesvol gevalideerd in acceptatieomgeving',
    preview:
      'De DigiD-authenticatiestroom is succesvol getest in de ACC-omgeving. Uitrol naar productie volgt op 17 maart.',
    content:
      '<p>Na uitgebreide tests in de acceptatieomgeving is de DigiD-koppeling goedgekeurd door de testcoördinator. De uitrol naar productie staat gepland voor 17 maart 2026. Medewerkers hoeven geen actie te ondernemen.</p>',
    type: 'announcement',
    status: 'published',
    audience: 'all',
    sender: { id: 'projectleider', name: 'Projectleider Digitale Toegang' },
    publishedAt: '2026-03-05T14:15:00Z',
    expiresAt: null,
    priority: 'normal',
    isRead: true,
    action: null,
  },
  {
    id: 'bericht-004',
    subject: 'Welkom in MijnOmgeving',
    preview:
      'Op dit portaal vindt u publieke updates, nieuws en meldingen over gemeentelijke dienstverlening.',
    content:
      '<p>Welkom op het medewerkersportaal van MijnOmgeving. Op deze pagina verschijnen algemene berichten en mededelingen die voor alle medewerkers zichtbaar zijn.</p>',
    type: 'announcement',
    status: 'published',
    audience: 'all',
    sender: { id: 'system', name: 'MijnOmgeving' },
    publishedAt: '2026-01-06T08:00:00Z',
    expiresAt: null,
    priority: 'normal',
    isRead: true,
    action: null,
  },
];

export function getBerichtenItems(
  limit: number = 10,
  offset: number = 0
): { items: BerichtItem[]; total: number } {
  const all = SEED;
  return {
    items: all.slice(offset, offset + limit),
    total: all.length,
  };
}

export function getBerichtById(id: string): BerichtItem | null {
  return SEED.find((b) => b.id === id) ?? null;
}
