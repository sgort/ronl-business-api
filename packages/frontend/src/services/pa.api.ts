/**
 * PA Monitoring API service.
 * Per-resource mock flags (all default false):
 *   VITE_PA_SIGNALS_MOCK=true  → signal/inbox/search fixtures
 *   VITE_PA_DOSSIERS_MOCK=true → dossier fixtures (backend endpoint not yet live)
 *   VITE_PA_AGENDA_MOCK=true   → agenda fixtures
 */

import axios from 'axios';
import keycloak from './keycloak';
import type { Dossier, PlenaryItem, Signal } from '@ronl/shared';
import { MOCK_DOSSIERS } from '../pages/public-affairs-v2/pa.data';

const API_BASE = import.meta.env.VITE_API_URL as string;

async function paGet<T>(path: string): Promise<T> {
  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(120);
    } catch {
      /* expired — proceed anyway */
    }
  }
  const res = await axios.get<{ success: boolean; data: T }>(`${API_BASE}${path}`, {
    headers: keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {},
  });
  return res.data.data;
}

async function paPost<T>(path: string, body: unknown): Promise<T> {
  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(120);
    } catch {
      /* expired */
    }
  }
  const res = await axios.post<{ success: boolean; data: T }>(`${API_BASE}${path}`, body, {
    headers: keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {},
  });
  return res.data.data;
}

export const SIGNALS_MOCK = import.meta.env.VITE_PA_SIGNALS_MOCK === 'true';
const DOSSIERS_MOCK = import.meta.env.VITE_PA_DOSSIERS_MOCK === 'true';
const AGENDA_MOCK = import.meta.env.VITE_PA_AGENDA_MOCK === 'true';

// ── Mock fixtures ────────────────────────────────────────────────────

const MOCK_CONFIRMED: Signal[] = [
  {
    id: 'sg1',
    tab: 'politiek',
    dossierId: 'stikstof',
    title: 'Kamervragen over tijdpad herziene stikstofkaart',
    src: 'Tweede Kamer · Kamervraag · vandaag',
    bron: 'tk',
    ref: {
      type: 'Kamervraag',
      nr: '2026Z11842',
      url: 'https://www.tweedekamer.nl/zoeken?q=stikstof+herziene+stikstofkaart&Types=Kamervraag',
    },
    rel: 9,
    impact: 'kans',
    impactLabel: 'Kans',
    duiding:
      'Vergroot de kans dat de kaart eerder politiek besproken wordt. Versnelt het venster voor het Flevolandse perspectief.',
    status: 'confirmed',
    confirmedBy: 'Sanne Bakker',
    confirmedAt: 'vandaag 08:40',
  },
  {
    id: 'sg2',
    tab: 'politiek',
    dossierId: 'lelystad',
    title: 'Motie aangekondigd over heroverweging laagvliegroutes',
    src: 'Tweede Kamer · Motie · gisteren',
    bron: 'tk',
    ref: {
      type: 'Motie',
      nr: '2026D16594',
      url: 'https://www.tweedekamer.nl/zoeken?q=Lelystad+Airport+laagvliegroutes+heroverweging&Types=Motie',
    },
    rel: 8,
    impact: 'risico',
    impactLabel: 'Risico',
    duiding:
      'Kan het afwegingsmoment vervroegen. Risico dat het debat zich versmalt tot routes zonder oog voor regionale economie.',
    status: 'confirmed',
    confirmedBy: 'Sanne Bakker',
    confirmedAt: 'vandaag 08:41',
  },
  {
    id: 'sg4',
    tab: 'regionaal',
    dossierId: 'stikstof',
    title: 'Gebiedsgrenzen stikstof gewijzigd in Noordoostpolder',
    src: 'Officiële Bekendmakingen · Gemeenteblad · 2 dgn',
    bron: 'ob',
    ref: {
      type: 'Gemeenteblad',
      nr: 'gmb-2026-241188',
      url: 'https://zoek.officielebekendmakingen.nl/?q=stikstof+gebiedsgrens+Noordoostpolder&product-area=gemeenteblad',
    },
    rel: 7,
    impact: 'risico',
    impactLabel: 'Risico',
    duiding:
      'Verzwakt de coalitiekracht (kompas 1). Vraagt om bilateraal gesprek vóór het Kamerwerkbezoek.',
    status: 'confirmed',
    confirmedBy: 'Joost Veenstra',
    confirmedAt: 'eergisteren 16:20',
  },
  {
    id: 'sg3',
    tab: 'europa',
    dossierId: 'energie',
    title: 'EU-richtlijn netcapaciteit: concept-herziening gepubliceerd',
    src: 'Europese Commissie · DG ENER · deze week',
    bron: null,
    rel: 6,
    impact: 'kans',
    impactLabel: 'Kans',
    duiding:
      'Biedt op termijn ruimte voor flexibele aansluitvoorwaarden. Relevant als onderbouwing voor de energy-hub-pilots.',
    status: 'confirmed',
  },
  {
    id: 'sg5',
    tab: 'media',
    dossierId: 'lelystad',
    title: 'Landelijk dagblad: "Lelystad Airport, het vliegveld dat maar niet opent"',
    src: 'Traditionele media · opinie · gisteren',
    bron: null,
    rel: 8,
    impact: 'risico',
    impactLabel: 'Risico',
    duiding:
      'Versterkt het frame "vliegveld zonder bestaansrecht". Tegenframe met banen + hinderafspraken nu inzetten.',
    status: 'confirmed',
  },
];

const MOCK_INBOX: Signal[] = [
  {
    id: 'in1',
    tab: 'politiek',
    dossierId: 'stikstof',
    title: 'Motie: reductietempo stikstof koppelen aan landbouwperspectief',
    src: 'Tweede Kamer · Motie · 3 u geleden',
    bron: 'tk',
    ref: {
      type: 'Motie',
      nr: '2026D17021',
      url: 'https://www.tweedekamer.nl/zoeken?q=stikstof+reductietempo+landbouwperspectief&Types=Motie',
    },
    rel: 8,
    impact: 'kans',
    impactLabel: 'Kans',
    duiding: 'Sluit aan op het Flevolandse perspectief: tempo gekoppeld aan verdienmodel.',
    status: 'ai_drafted',
    aiDraft: {
      rel: 8,
      impact: 'kans',
      impactLabel: 'Kans',
      duiding: 'Sluit aan op het Flevolandse perspectief.',
    },
  },
  {
    id: 'in2',
    tab: 'politiek',
    dossierId: 'lelystad',
    title: 'Kamervraag over geluidsnormen en meetmethode Lelystad',
    src: 'Tweede Kamer · Kamervraag · 5 u geleden',
    bron: 'tk',
    ref: {
      type: 'Kamervraag',
      nr: '2026Z11907',
      url: 'https://www.tweedekamer.nl/zoeken?q=Lelystad+Airport+geluidsnormen+meetmethode&Types=Kamervraag',
    },
    rel: 7,
    impact: 'risico',
    impactLabel: 'Risico',
    duiding:
      'Raakt het verschil tussen RIVM-norm en Kamerbrief. Feitenkaart routes hierop aanscherpen.',
    status: 'ai_drafted',
    aiDraft: {
      rel: 7,
      impact: 'risico',
      impactLabel: 'Risico',
      duiding: 'Raakt het verschil tussen RIVM-norm en Kamerbrief.',
    },
  },
  {
    id: 'in3',
    tab: 'regionaal',
    dossierId: 'energie',
    title: 'Provinciaal blad: subsidieregeling netcongestie-pilots gepubliceerd',
    src: 'Officiële Bekendmakingen · Provinciaal blad · 1 dg',
    bron: 'ob',
    ref: {
      type: 'Provinciaal blad',
      nr: 'prb-2026-8841',
      url: 'https://zoek.officielebekendmakingen.nl/?q=netcongestie+subsidieregeling+pilot&product-area=provinciaalblad',
    },
    rel: 6,
    impact: 'kans',
    impactLabel: 'Kans',
    duiding: 'Directe haak voor de energy-hub-pilots.',
    status: 'ai_drafted',
    aiDraft: {
      rel: 6,
      impact: 'kans',
      impactLabel: 'Kans',
      duiding: 'Directe haak voor de energy-hub-pilots.',
    },
  },
  {
    id: 'in4',
    tab: 'politiek',
    dossierId: 'energie',
    title: 'Brief minister EZK over Landelijk Actieprogramma Netcongestie',
    src: 'Tweede Kamer · Brief · 1 dg',
    bron: 'tk',
    ref: {
      type: 'Brief',
      nr: '2026D16777',
      url: 'https://www.tweedekamer.nl/zoeken?q=netcongestie+Landelijk+Actieprogramma+EZK&Types=Brief',
    },
    rel: 5,
    impact: null,
    impactLabel: null,
    duiding: null,
    status: 'candidate',
  },
];

// ── Tab → connector metadata ─────────────────────────────────────────

const TAB_SOURCES: Record<string, string[]> = {
  politiek: ['tk', 'ob'],
  regionaal: ['ob'],
  europa: ['eu'],
  media: [],
};

export const BRON_LABEL: Record<string, string> = {
  tk: 'Tweede Kamer',
  ob: 'Officiële Bekendmakingen',
  eu: 'Europees Parlement',
};

export function paTabConnected(tabId: string): boolean {
  return (TAB_SOURCES[tabId] ?? []).length > 0;
}

export function paTabBronnen(tabId: string): string[] {
  return (TAB_SOURCES[tabId] ?? []).map((b) => BRON_LABEL[b]);
}

const TAG_BY_TAB: Record<string, string> = {
  politiek: 'nl',
  regionaal: 'regio',
  europa: 'eu',
  media: 'media',
};
const TAG_LABEL_BY_TAB: Record<string, string> = {
  politiek: 'Politiek NL',
  regionaal: 'Regionaal',
  europa: 'Europa',
  media: 'Media',
};

export function signalTag(tab: string): string {
  return TAG_BY_TAB[tab] ?? 'nl';
}
export function signalTagLabel(tab: string): string {
  return TAG_LABEL_BY_TAB[tab] ?? tab;
}

// ── Accessors ────────────────────────────────────────────────────────

export async function fetchSignals(params?: {
  tab?: string;
  dossierId?: string;
}): Promise<Signal[]> {
  if (SIGNALS_MOCK) {
    let rows = MOCK_CONFIRMED.filter((s) => s.bron === 'tk' || s.bron === 'ob');
    if (params?.tab) rows = rows.filter((s) => s.tab === params.tab);
    if (params?.dossierId) rows = rows.filter((s) => s.dossierId === params.dossierId);
    return rows.sort((a, b) => b.rel - a.rel);
  }
  const qs = new URLSearchParams({ status: 'confirmed' });
  if (params?.tab) qs.set('tab', params.tab);
  if (params?.dossierId) qs.set('dossierId', params.dossierId);
  return paGet<Signal[]>(`/pa/signals?${qs}`);
}

export async function fetchInbox(params?: { tab?: string; dossierId?: string }): Promise<Signal[]> {
  if (SIGNALS_MOCK) {
    let rows = MOCK_INBOX.slice();
    if (params?.tab) rows = rows.filter((s) => s.tab === params.tab);
    if (params?.dossierId) rows = rows.filter((s) => s.dossierId === params.dossierId);
    return rows;
  }
  const qs = new URLSearchParams({ status: 'candidate,ai_drafted' });
  if (params?.tab) qs.set('tab', params.tab);
  if (params?.dossierId) qs.set('dossierId', params.dossierId);
  return paGet<Signal[]>(`/pa/signals?${qs}`);
}

export interface SavedSearch {
  id: string;
  dossierId: string | null;
  query: { q: string; types: string[]; source: string[] };
  tags: string[];
  scope: 'tenant' | 'user';
}

const MOCK_SEARCHES: SavedSearch[] = [
  {
    id: 'seed-stikstof',
    dossierId: 'stikstof',
    query: { q: 'stikstof OR gebiedsproces OR reductiekader', types: [], source: ['tk', 'ob'] },
    tags: ['stikstof', 'landbouw', 'natuur'],
    scope: 'tenant',
  },
  {
    id: 'seed-lelystad',
    dossierId: 'lelystad',
    query: {
      q: 'Lelystad Airport OR laagvliegroutes OR luchthavenbesluit',
      types: [],
      source: ['tk', 'ob'],
    },
    tags: ['luchtvaart', 'lelystad'],
    scope: 'tenant',
  },
  {
    id: 'seed-energie',
    dossierId: 'energie',
    query: { q: 'netcongestie OR netcapaciteit OR "energy hub"', types: [], source: ['tk', 'ob'] },
    tags: ['energie', 'netcongestie'],
    scope: 'tenant',
  },
  {
    id: 'seed-jeugdzorg',
    dossierId: 'jeugdzorg',
    query: { q: 'jeugdzorg OR hervormingsagenda jeugd', types: [], source: ['tk', 'ob'] },
    tags: ['jeugdzorg', 'zorg'],
    scope: 'tenant',
  },
];

export async function fetchSearches(): Promise<SavedSearch[]> {
  if (SIGNALS_MOCK) return MOCK_SEARCHES;
  const rows = await paGet<
    {
      id: string;
      dossier_id: string | null;
      query: SavedSearch['query'];
      tags: string[];
      scope: 'tenant' | 'user';
    }[]
  >('/pa/searches');
  return rows.map((r) => ({
    id: r.id,
    dossierId: r.dossier_id,
    query: r.query,
    tags: r.tags,
    scope: r.scope,
  }));
}

export async function fetchDossiers(): Promise<Dossier[]> {
  if (DOSSIERS_MOCK) return MOCK_DOSSIERS;
  return paGet<Dossier[]>('/pa/dossiers');
}

export async function fetchDossier(id: string): Promise<Dossier | undefined> {
  if (DOSSIERS_MOCK) return MOCK_DOSSIERS.find((d) => d.id === id);
  try {
    return await paGet<Dossier>(`/pa/dossiers/${id}`);
  } catch {
    return undefined;
  }
}

const MOCK_AGENDA: PlenaryItem[] = [
  {
    id: 'ag01',
    nummer: '2026A03210',
    soort: 'vragenuur',
    soortLabel: 'Mondelinge vragen',
    titel: 'Vragenuur — o.a. tijdpad herziene stikstofkaart',
    iso: '2026-06-10',
    tijd: '14:00',
    commissie: null,
    status: 'uitgevoerd',
    dossier: 'stikstof',
    matchTerm: 'stikstof',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/plenaire_vergaderingen/details/activiteit?id=2026A03210',
    live: null,
  },
  {
    id: 'ag02',
    nummer: '2026A03244',
    soort: 'commissie',
    soortLabel: 'Commissiedebat',
    titel: 'Commissiedebat Luchtvaart',
    iso: '2026-06-11',
    tijd: '10:15',
    commissie: 'cie. Infrastructuur & Waterstaat',
    status: 'uitgevoerd',
    dossier: 'lelystad',
    matchTerm: 'Lelystad Airport',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/commissievergaderingen/details?id=2026A03244',
    live: null,
  },
  {
    id: 'ag03',
    nummer: '2026A03255',
    soort: 'plenair',
    soortLabel: 'Plenair debat',
    titel: 'Debat over netcongestie en verduurzaming van de industrie',
    iso: '2026-06-12',
    tijd: '11:00',
    commissie: null,
    status: 'uitgevoerd',
    dossier: 'energie',
    matchTerm: 'netcongestie',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/plenaire_vergaderingen/details/activiteit?id=2026A03255',
    live: null,
  },
  {
    id: 'ag04',
    nummer: '2026A03301',
    soort: 'commissie',
    soortLabel: 'Commissiedebat',
    titel: 'Commissiedebat Hervormingsagenda Jeugd',
    iso: '2026-06-18',
    tijd: '13:45',
    commissie: 'cie. VWS',
    status: 'uitgevoerd',
    dossier: 'jeugdzorg',
    matchTerm: 'hervormingsagenda jeugd',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/commissievergaderingen/details?id=2026A03301',
    live: null,
  },
  {
    id: 'ag05',
    nummer: '2026A03318',
    soort: 'plenair',
    soortLabel: 'Tweeminutendebat',
    titel: 'Tweeminutendebat Stikstof (VAO)',
    iso: '2026-06-19',
    tijd: '10:00',
    commissie: null,
    status: 'uitgevoerd',
    dossier: 'stikstof',
    matchTerm: 'stikstof',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/plenaire_vergaderingen/details/activiteit?id=2026A03318',
    live: null,
  },
  {
    id: 'ag06',
    nummer: '2026A03362',
    soort: 'vragenuur',
    soortLabel: 'Mondelinge vragen',
    titel: 'Vragenuur',
    iso: '2026-06-24',
    tijd: '14:00',
    commissie: null,
    status: 'uitgevoerd',
    dossier: null,
    matchTerm: null,
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/plenaire_vergaderingen/details/activiteit?id=2026A03362',
    live: null,
  },
  {
    id: 'ag07',
    nummer: '2026A03364',
    soort: 'plenair',
    soortLabel: 'Plenair debat',
    titel: 'Debat over de herziene stikstofkaart',
    iso: '2026-06-24',
    tijd: '15:30',
    commissie: null,
    status: 'gepland',
    dossier: 'stikstof',
    matchTerm: 'stikstof',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/plenaire_vergaderingen/details/activiteit?id=2026A03364',
    live: 'live',
    stream: 'https://debatdirect.tweedekamer.nl/2026-06-24/plenair',
  },
  {
    id: 'ag08',
    nummer: '2026A03365',
    soort: 'plenair',
    soortLabel: 'Stemmingen',
    titel: 'Stemmingen — o.a. moties laagvliegroutes Lelystad',
    iso: '2026-06-24',
    tijd: '17:00',
    commissie: null,
    status: 'gepland',
    dossier: 'lelystad',
    matchTerm: 'laagvliegroutes',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/plenaire_vergaderingen/details/activiteit?id=2026A03365',
    live: 'binnenkort',
    stream: 'https://debatdirect.tweedekamer.nl/2026-06-24/plenair',
  },
  {
    id: 'ag09',
    nummer: '2026A03377',
    soort: 'commissie',
    soortLabel: 'Commissiedebat',
    titel: 'Commissiedebat Netcongestie',
    iso: '2026-06-25',
    tijd: '10:15',
    commissie: 'cie. Economische Zaken & Klimaat',
    status: 'gepland',
    dossier: 'energie',
    matchTerm: 'netcongestie',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/commissievergaderingen/details?id=2026A03377',
    live: null,
  },
  {
    id: 'ag10',
    nummer: '2026A03390',
    soort: 'plenair',
    soortLabel: 'Plenair debat',
    titel: 'Debat over het openingsbesluit Lelystad Airport',
    iso: '2026-06-26',
    tijd: '11:00',
    commissie: null,
    status: 'gepland',
    dossier: 'lelystad',
    matchTerm: 'luchthavenbesluit',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/plenaire_vergaderingen/details/activiteit?id=2026A03390',
    live: null,
  },
  {
    id: 'ag11',
    nummer: '2026A03421',
    soort: 'vragenuur',
    soortLabel: 'Mondelinge vragen',
    titel: 'Vragenuur',
    iso: '2026-07-01',
    tijd: '14:00',
    commissie: null,
    status: 'gepland',
    dossier: null,
    matchTerm: null,
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/plenaire_vergaderingen/details/activiteit?id=2026A03421',
    live: null,
  },
  {
    id: 'ag12',
    nummer: '2026A03433',
    soort: 'commissie',
    soortLabel: 'Commissiedebat',
    titel: 'Commissiedebat Jeugd',
    iso: '2026-07-02',
    tijd: '13:30',
    commissie: 'cie. VWS',
    status: 'gepland',
    dossier: 'jeugdzorg',
    matchTerm: 'jeugdzorg',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/commissievergaderingen/details?id=2026A03433',
    live: null,
  },
  {
    id: 'ag13',
    nummer: '2026A03470',
    soort: 'commissie',
    soortLabel: 'Commissiedebat',
    titel: 'Commissiedebat Luchtvaart',
    iso: '2026-07-09',
    tijd: '10:15',
    commissie: 'cie. Infrastructuur & Waterstaat',
    status: 'geannuleerd',
    dossier: 'lelystad',
    matchTerm: 'Lelystad Airport',
    url: 'https://www.tweedekamer.nl/debat_en_vergadering/commissievergaderingen/details?id=2026A03470',
    live: null,
  },
];

export async function fetchAgenda(): Promise<PlenaryItem[]> {
  if (AGENDA_MOCK) return MOCK_AGENDA;
  return paGet<PlenaryItem[]>('/pa/agenda');
}

export async function confirmSignal(
  id: string,
  patch?: { duiding?: string; impact?: Signal['impact']; impactLabel?: string; rel?: number }
): Promise<Signal> {
  if (SIGNALS_MOCK) {
    const mock = MOCK_INBOX.find((s) => s.id === id);
    if (!mock) throw new Error(`Mock signal ${id} not found`);
    return { ...mock, status: 'confirmed' as const, ...patch };
  }
  return paPost<Signal>(`/pa/signals/${id}/confirm`, patch ?? {});
}
