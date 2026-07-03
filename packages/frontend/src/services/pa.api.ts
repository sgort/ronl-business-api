/**
 * PA Monitoring API service.
 * Per-resource mock flags (all default false):
 *   VITE_PA_SIGNALS_MOCK=true  → signal/inbox/search fixtures
 *   VITE_PA_DOSSIERS_MOCK=true → dossier fixtures (backend endpoint not yet live)
 *   VITE_PA_AGENDA_MOCK=true   → agenda fixtures
 */

import axios from 'axios';
import keycloak from './keycloak';
import type { Dossier, FeedItem, PlenaryItem, Signal } from '@ronl/shared';
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

async function paPatch<T>(path: string, body: unknown): Promise<T> {
  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(120);
    } catch {
      /* expired */
    }
  }
  const res = await axios.patch<{ success: boolean; data: T }>(`${API_BASE}${path}`, body, {
    headers: keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {},
  });
  return res.data.data;
}

async function paDelete(path: string): Promise<void> {
  if (keycloak.authenticated) {
    try {
      await keycloak.updateToken(120);
    } catch {
      /* expired */
    }
  }
  await axios.delete(`${API_BASE}${path}`, {
    headers: keycloak.token ? { Authorization: `Bearer ${keycloak.token}` } : {},
  });
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
    bron: 'eu',
    subbron: 'ep-rss',
    commissie: 'ITRE',
    rel: 6,
    title: 'Ontwerpverslag ITRE: flexibiliteit en netcapaciteit in de interne energiemarkt',
    src: 'Europees Parlement · Verslag (cie. ITRE) · deze week',
    ref: {
      type: 'Verslag',
      nr: 'A-10-2026-0094',
      url: 'https://www.europarl.europa.eu/doceo/document/A-10-2026-0094_NL.html',
    },
    impact: 'kans',
    impactLabel: 'Kans',
    duiding:
      'Opent ruimte voor flexibele aansluitvoorwaarden in de interne markt. Bruikbaar als EU-onderbouwing voor de energy-hub-pilots richting EZK.',
    status: 'confirmed',
    confirmedBy: 'Sanne Bakker',
    confirmedAt: 'vandaag 09:05',
  },
  {
    id: 'sg8',
    tab: 'europa',
    dossierId: 'stikstof',
    bron: 'eu',
    subbron: 'ep-rss',
    commissie: 'ENVI',
    rel: 7,
    title: 'Aangenomen resolutie over uitvoering van de natuurherstelverordening',
    src: 'Europees Parlement · Aangenomen tekst · gisteren',
    ref: {
      type: 'Aangenomen tekst',
      nr: 'P10_TA(2026)0188',
      url: 'https://www.europarl.europa.eu/doceo/document/TA-10-2026-0188_NL.html',
    },
    impact: 'risico',
    impactLabel: 'Risico',
    duiding:
      'Uitvoeringsdeadlines kunnen de gebiedsgerichte aanpak versnellen én verzwaren. Relevant voor het stikstof-gebiedsperspectief en het natuurherstel rond de randmeren.',
    status: 'confirmed',
    confirmedBy: 'Joost Veenstra',
    confirmedAt: 'vandaag 08:52',
  },
  {
    id: 'sg9',
    tab: 'europa',
    dossierId: null,
    bron: 'eu',
    subbron: 'ep-teksten',
    commissie: 'SANT',
    rel: 5,
    title: 'Verslag over versterking van het Europees gezondheidspersoneel — stand van uitvoering',
    src: 'Europees Parlement · Verslag · Ingediende teksten · gisteren',
    ref: {
      type: 'Verslag',
      nr: 'A-10-2026-0203',
      url: 'https://www.europarl.europa.eu/doceo/document/A-10-2026-0203_NL.html',
    },
    impact: 'kans',
    impactLabel: 'Kans',
    duiding:
      'Bevestigd zonder dossier — staat op de EU-watchlist. Raakt breed arbeidsmarktbeleid; volg de stemming en koppel aan een dossier als dit Flevolands relevant wordt.',
    status: 'confirmed',
    confirmedBy: 'Sanne Bakker',
    confirmedAt: 'gisteren 14:30',
    routing: 'watchlist',
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
  {
    id: 'in5',
    tab: 'regionaal',
    dossierId: 'stikstof',
    bron: 'ob',
    title: 'Waterschapsblad Zuiderzeeland: peilbesluit randmeren',
    src: 'Officiële Bekendmakingen · Waterschapsblad · 2 dgn',
    ref: {
      type: 'Waterschapsblad',
      nr: 'wsb-2026-6620',
      url: 'https://zoek.officielebekendmakingen.nl/wsb-2026-6620.html',
    },
    rel: 4,
    impact: null,
    impactLabel: null,
    duiding: null,
    status: 'candidate',
    aiDraft: null,
  },
  {
    id: 'in6',
    tab: 'europa',
    dossierId: 'energie',
    bron: 'eu',
    subbron: 'ep-rss',
    title: 'Schriftelijke vraag aan de Commissie over het staatssteunkader voor netuitbreiding',
    src: 'Europees Parlement · Schriftelijke vraag · 1 dg',
    ref: {
      type: 'Schriftelijke vraag',
      nr: 'E-002145/2026',
      url: 'https://www.europarl.europa.eu/doceo/document/E-10-2026-002145_NL.html',
    },
    rel: 5,
    impact: 'kans',
    impactLabel: 'Kans',
    duiding:
      'Het antwoord van de Commissie kan staatssteunruimte verduidelijken voor regionale netuitbreiding — volg het en koppel aan het energy-hub-dossier.',
    status: 'ai_drafted',
    aiDraft: {
      rel: 6,
      impact: 'kans',
      impactLabel: 'Kans',
      duiding:
        'Het antwoord van de Commissie kan staatssteunruimte verduidelijken voor regionale netuitbreiding — volg het en koppel aan het energy-hub-dossier.',
    },
  },
  {
    id: 'in7',
    tab: 'europa',
    dossierId: 'energie',
    bron: 'eu',
    subbron: 'ep-teksten',
    commissie: 'ITRE',
    title:
      'Ontwerpverslag over versnelde vergunningverlening voor grensoverschrijdende netinfrastructuur',
    src: 'Europees Parlement · Verslag · Ingediende teksten · 2 u geleden',
    ref: {
      type: 'Verslag',
      nr: 'A-10-2026-0170',
      url: 'https://www.europarl.europa.eu/doceo/document/A-10-2026-0170_NL.html',
    },
    rel: 6,
    impact: 'kans',
    impactLabel: 'Kans',
    duiding:
      'Ontwerpverslag met stemming in zicht — vroeg venster om het Flevolandse energy-hub-verhaal aan de EU-lijn te koppelen vóór de plenaire behandeling.',
    status: 'ai_drafted',
    aiDraft: {
      rel: 7,
      impact: 'kans',
      impactLabel: 'Kans',
      duiding:
        'Ontwerpverslag met stemming in zicht — vroeg venster om het Flevolandse energy-hub-verhaal aan de EU-lijn te koppelen vóór de plenaire behandeling.',
    },
  },
  {
    id: 'in8',
    tab: 'europa',
    dossierId: 'stikstof',
    bron: 'eu',
    subbron: 'ep-teksten',
    commissie: 'ENVI',
    title: 'Ontwerpresolutie over de uitvoering van de natuurherstelverordening in de lidstaten',
    src: 'Europees Parlement · Ontwerpresolutie · Ingediende teksten · 6 u geleden',
    ref: {
      type: 'Ontwerpresolutie',
      nr: 'B-10-2026-0351',
      url: 'https://www.europarl.europa.eu/doceo/document/B-10-2026-0351_NL.html',
    },
    rel: 5,
    impact: 'risico',
    impactLabel: 'Risico',
    duiding:
      'Ontwerpresolutie kan de uitvoeringsdruk op de gebiedsgerichte aanpak vergroten. Volg de amendementen; relevant voor het stikstof-gebiedsperspectief en het natuurherstel rond de randmeren.',
    status: 'ai_drafted',
    aiDraft: {
      rel: 6,
      impact: 'risico',
      impactLabel: 'Risico',
      duiding:
        'Ontwerpresolutie kan de uitvoeringsdruk op de gebiedsgerichte aanpak vergroten. Volg de amendementen; relevant voor het stikstof-gebiedsperspectief en het natuurherstel rond de randmeren.',
    },
  },
  {
    id: 'in9',
    tab: 'europa',
    dossierId: null,
    bron: 'eu',
    subbron: 'ep-teksten',
    commissie: 'AGRI',
    title:
      'Verslag over een toekomstbestendig perspectief voor de landbouw en stikstofreductie in de EU',
    src: 'Europees Parlement · Verslag · Ingediende teksten · 1 dg',
    ref: {
      type: 'Verslag',
      nr: 'A-10-2026-0175',
      url: 'https://www.europarl.europa.eu/doceo/document/A-10-2026-0175_NL.html',
    },
    rel: 5,
    impact: null,
    impactLabel: null,
    duiding: null,
    status: 'candidate',
    aiDraft: null,
  },
];

// ── Tab → connector metadata ─────────────────────────────────────────

const TAB_SOURCES: Record<string, string[]> = {
  politiek: ['tk', 'ob'],
  regionaal: ['ob'],
  // Twee EU-subbronnen: (1) EP plenaire RSS-feed (ep-rss) en (2) EP "Ingediende teksten" (ep-teksten)
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
    let rows = MOCK_CONFIRMED.filter((s) => s.bron === 'tk' || s.bron === 'ob' || s.bron === 'eu');
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

// ── Blanco zoekfunctie — raw cross-source feed + promote/save ────────

/**
 * Free-text search over the raw merged bronfeed (TK + OB), independent of the
 * curated streams. Hits GET /pa/feed. In mock mode, filters the local
 * inbox/confirmed fixtures by title so the band is demoable offline.
 */
/** Sources the raw feed can search. 'both' = every searchable bron at once. */
export type FeedSource = 'both' | 'tk' | 'ob' | 'eu';

export async function fetchFeed(params: {
  q: string;
  source?: FeedSource;
  types?: string[];
  skip?: number;
  top?: number;
}): Promise<{ items: FeedItem[]; total: number | null }> {
  if (SIGNALS_MOCK) {
    const q = params.q.toLowerCase();
    const src = params.source ?? 'both';
    const items: FeedItem[] = [...MOCK_INBOX, ...MOCK_CONFIRMED]
      .filter((s) => s.title.toLowerCase().includes(q))
      .map((s) => ({
        id: s.id,
        title: s.title,
        type: s.ref?.type ?? null,
        number: s.ref?.nr ?? null,
        date: null,
        url: s.ref?.url ?? null,
        source: (s.bron === 'ob' ? 'ob' : s.bron === 'eu' ? 'eu' : 'tk') as FeedItem['source'],
      }))
      .filter((it) => src === 'both' || it.source === src);
    return { items, total: items.length };
  }
  const qs = new URLSearchParams({
    q: params.q,
    source: params.source ?? 'both',
    top: String(params.top ?? 30),
  });
  if (params.types?.length) qs.set('types', params.types.join(','));
  if (params.skip) qs.set('skip', String(params.skip));
  return paGet<{ items: FeedItem[]; total: number | null }>(`/pa/feed?${qs}`);
}

/** "Bewaar als zoekopdracht" → POST /pa/searches (user scope). */
export async function createSavedSearch(input: {
  q: string;
  source?: string[];
  types?: string[];
  dossierId?: string | null;
}): Promise<{ id: string }> {
  if (SIGNALS_MOCK) return { id: `srch-mock-${Date.now()}` };
  return paPost<{ id: string }>('/pa/searches', {
    scope: 'user',
    dossierId: input.dossierId ?? null,
    query: { q: input.q, types: input.types ?? [], source: input.source ?? ['tk', 'ob'] },
    tags: [],
  });
}

/** "Naar inbox" → promote one raw hit into the curation inbox as a candidate. */
export async function promoteToInbox(item: FeedItem): Promise<Signal> {
  if (SIGNALS_MOCK) {
    return {
      id: `sig-${item.source}-${item.id}`,
      tab: item.source === 'ob' ? 'regionaal' : item.source === 'eu' ? 'europa' : 'politiek',
      dossierId: null,
      title: item.title,
      src: `${item.source.toUpperCase()} · ${item.type ?? ''}`,
      bron: item.source,
      ref: item.url ? { type: item.type ?? '', nr: item.number ?? item.id, url: item.url } : null,
      rel: 5,
      impact: null,
      impactLabel: null,
      duiding: null,
      status: 'candidate',
    };
  }
  return paPost<Signal>('/pa/signals', item);
}

/**
 * The bronnen the raw feed can actually search, derived from GET /pa/types
 * (its keys are the sources /pa/feed merges). Drives the source chips so a
 * new source (e.g. eu) appears automatically once the backend exposes it —
 * no dead/hardcoded chip. Falls back to tk+ob if the call fails.
 */
export async function fetchFeedSources(): Promise<string[]> {
  if (SIGNALS_MOCK) return ['tk', 'ob'];
  try {
    const types = await paGet<Record<string, unknown>>('/pa/types');
    const keys = Object.keys(types);
    return keys.length ? keys : ['tk', 'ob'];
  } catch {
    return ['tk', 'ob'];
  }
}

/** Mijn zoekopdrachten: remove a personal saved search. */
export async function deleteSavedSearch(id: string): Promise<void> {
  if (SIGNALS_MOCK) return;
  await paDelete(`/pa/searches/${id}`);
}

/** "↗ team": flip a personal search to tenant scope — only then does it feed the cron. */
export async function promoteSearchToTenant(id: string): Promise<void> {
  if (SIGNALS_MOCK) return;
  await paPatch(`/pa/searches/${id}`, { scope: 'tenant' });
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

export async function triggerCurationCycle(): Promise<{ started: boolean; tenantId: string }> {
  return paPost<{ started: boolean; tenantId: string }>('/pa/curator/run', {});
}

export async function confirmSignal(
  id: string,
  patch?: { duiding?: string; impact?: Signal['impact']; impactLabel?: string; rel?: number }
): Promise<Signal> {
  if (SIGNALS_MOCK) {
    const mock = MOCK_INBOX.find((s) => s.id === id);
    if (!mock) throw new Error(`Mock signal ${id} not found`);
    const confirmed: Signal = { ...mock, status: 'confirmed' as const, ...patch };
    if (!confirmed.dossierId) confirmed.routing = 'watchlist';
    return confirmed;
  }
  return paPost<Signal>(`/pa/signals/${id}/confirm`, patch ?? {});
}

export async function linkSignalDossier(id: string, dossierId: string): Promise<Signal> {
  if (SIGNALS_MOCK) {
    const mock = [...MOCK_CONFIRMED, ...MOCK_INBOX].find((s) => s.id === id);
    if (!mock) throw new Error(`Mock signal ${id} not found`);
    return { ...mock, dossierId, routing: null };
  }
  return paPatch<Signal>(`/pa/signals/${id}`, { dossierId });
}
