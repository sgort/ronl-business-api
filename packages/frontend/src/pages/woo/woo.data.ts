/**
 * Woo-dashboard — fictitious dataset + filter helpers.
 * All figures are illustrative. Peildatum: 3 juli 2026.
 *
 * PATCHED (feat/woo-dashboard follow-up):
 *   · WOO_REGISTER is now the full 218 rows, deterministically generated.
 *   · Added WOO_FILTERS + wooDefaultFilters/wooAnyActive/wooFilterRows so the
 *     rail dropdowns actually filter the Verzoekenregister.
 */

export interface WooKpi {
  id: string;
  label: string;
  value: string;
  target: string;
  status: 'groen' | 'geel' | 'rood' | 'neutral';
  hint: string;
  delta: string;
}
export interface WooMaand {
  m: string;
  in: number;
  uit: number;
}
export interface WooAfdeling {
  naam: string;
  n: number;
  optijd: number;
}
export interface WooOnderwerp {
  naam: string;
  n: number;
}
export interface WooBron {
  naam: string;
  pct: number;
  color: string;
}
export interface WooDistributie {
  b: string;
  n: number;
}
export interface WooAgeing {
  b: string;
  n: number;
  kleur: string;
}
export interface WooStap {
  k: string;
  naam: string;
  dagen: number;
  actief: number;
  bottleneck?: boolean;
}
export interface WooCategorie {
  naam: string;
  n: number;
  actief: boolean;
}
export interface WooBesluit {
  naam: string;
  n: number;
  color: string;
}
export interface WooRegisterRow {
  id: string;
  ontvangen: string;
  termijn: string;
  afdeling: string;
  onderwerp: string;
  bron: string;
  status: string;
  dagen: number;
  besluit: string;
  bezwaar: boolean;
  verdaagd: boolean;
}
export interface WooSuggestie {
  eyebrow: string;
  text: string;
}

export const WOO_USER = {
  name: 'Ravi de Wit',
  initials: 'RW',
  loa: 'hoog',
  role: 'Woo-coördinator',
};
export const WOO_TENANT = { displayName: 'Provincie Flevoland' };
export const WOO_PEILDATUM = '3 juli 2026';
export const WOO_JAAR = 2026;

export const WOO_KPIS: WooKpi[] = [
  {
    id: 'open',
    label: 'Open Woo-verzoeken',
    value: '34',
    target: '< 30',
    status: 'geel',
    hint: 'Verzoeken nog in behandeling',
    delta: '+5 t.o.v. Q1',
  },
  {
    id: 'ontvangen',
    label: 'Ontvangen dit jaar',
    value: '218',
    target: '—',
    status: 'neutral',
    hint: 'Jan–jun 2026',
    delta: '+12% j-o-j',
  },
  {
    id: 'afgehandeld',
    label: 'Afgehandeld dit jaar',
    value: '191',
    target: '—',
    status: 'neutral',
    hint: 'Met en zonder formeel besluit',
    delta: '88% van instroom',
  },
  {
    id: 'optijd',
    label: 'Op tijd afgehandeld',
    value: '87%',
    target: '> 90%',
    status: 'geel',
    hint: 'Binnen wettelijke termijn',
    delta: '−3 pnt t.o.v. 2025',
  },
  {
    id: 'doorloop',
    label: 'Gem. doorlooptijd',
    value: '31 dgn',
    target: '< 28 dgn',
    status: 'rood',
    hint: 'Ontvangst tot besluit',
    delta: '+4 dgn j-o-j',
  },
  {
    id: 'verdaging',
    label: 'Verdagingen gebruikt',
    value: '62',
    target: '—',
    status: 'neutral',
    hint: '28% van afgehandelde verzoeken',
    delta: '',
  },
  {
    id: 'bezwaar',
    label: 'Bezwaren aanhangig',
    value: '9',
    target: '—',
    status: 'geel',
    hint: 'In behandeling bij bezwaarcommissie',
    delta: '',
  },
  {
    id: 'rechtszaak',
    label: 'Rechtszaken · dwangsommen',
    value: '3 · 1',
    target: '0',
    status: 'rood',
    hint: 'Lopende beroepen · opgelegde dwangsom',
    delta: '',
  },
];

export const WOO_MAAND: WooMaand[] = [
  { m: 'Jan', in: 38, uit: 31 },
  { m: 'Feb', in: 34, uit: 33 },
  { m: 'Mrt', in: 41, uit: 35 },
  { m: 'Apr', in: 36, uit: 34 },
  { m: 'Mei', in: 33, uit: 30 },
  { m: 'Jun', in: 36, uit: 28 },
];

export const WOO_AFDELING: WooAfdeling[] = [
  { naam: 'Bestuur & Directie', n: 52, optijd: 79 },
  { naam: 'Infrastructuur & Mobiliteit', n: 47, optijd: 84 },
  { naam: 'Ruimte & Wonen', n: 38, optijd: 91 },
  { naam: 'Natuur & Landbouw', n: 29, optijd: 90 },
  { naam: 'Economie & Europa', n: 24, optijd: 88 },
  { naam: 'Bedrijfsvoering & HR', n: 18, optijd: 94 },
  { naam: 'Vergunningen & Handhaving', n: 10, optijd: 96 },
];

export const WOO_ONDERWERP: WooOnderwerp[] = [
  { naam: 'Aanbesteding & inkoop', n: 41 },
  { naam: 'Infrastructuurprojecten', n: 38 },
  { naam: 'Subsidies', n: 31 },
  { naam: 'Milieu & stikstof', n: 28 },
  { naam: 'Bestuurlijke besluiten', n: 26 },
  { naam: 'Vergunningen', n: 21 },
  { naam: 'Personeel', n: 17 },
  { naam: 'Overig', n: 16 },
];

export const WOO_BRON: WooBron[] = [
  { naam: 'Journalist', pct: 41, color: '#0046ad' },
  { naam: 'Burger', pct: 28, color: '#1f7a8c' },
  { naam: 'Bedrijf', pct: 14, color: '#e5b700' },
  { naam: 'NGO', pct: 9, color: '#3fa535' },
  { naam: 'Politiek', pct: 5, color: '#e70077' },
  { naam: 'Advocaat', pct: 3, color: '#9333a8' },
];

export const WOO_HERHAAL = {
  herhaalverzoekers: 14,
  aandeelHerhaal: 22,
  topAantal: 7,
  topNaam: 'Regionaal dagblad (redactie)',
};

export const WOO_TIJDIGHEID = {
  slaPct: 87,
  gem: 31,
  mediaan: 24,
  teLaat: 21,
  gemDagenTeLaat: 12,
  jur: 11,
  bo: 8,
};

export const WOO_DISTRIBUTIE: WooDistributie[] = [
  { b: '0–14', n: 47 },
  { b: '15–28', n: 78 },
  { b: '29–42', n: 41 },
  { b: '43–56', n: 16 },
  { b: '57+', n: 9 },
];

export const WOO_AGEING: WooAgeing[] = [
  { b: 'Binnen termijn', n: 13, kleur: 'groen' },
  { b: 'Termijn < 5 dgn', n: 9, kleur: 'geel' },
  { b: 'Over termijn', n: 8, kleur: 'rood' },
  { b: 'Verdaagd (loopt)', n: 4, kleur: 'blauw' },
];

export const WOO_STAPPEN: WooStap[] = [
  { k: '01', naam: 'Ontvangen', dagen: 0.5, actief: 34 },
  { k: '02', naam: 'Geregistreerd', dagen: 1.2, actief: 31 },
  { k: '03', naam: 'Toegewezen', dagen: 2.4, actief: 28 },
  { k: '04', naam: 'Informatie zoeken', dagen: 11.8, actief: 22, bottleneck: true },
  { k: '05', naam: 'Juridische toets', dagen: 6.3, actief: 15 },
  { k: '06', naam: 'Lakken / redactie', dagen: 4.1, actief: 9 },
  { k: '07', naam: 'Besluit', dagen: 2.7, actief: 6 },
  { k: '08', naam: 'Publicatie', dagen: 1.4, actief: 4 },
  { k: '09', naam: 'Gesloten', dagen: 0.0, actief: 0 },
];
export const WOO_PROCES = { overdrachten: 4.2, reworkPct: 14, bottleneck: 'Informatie zoeken' };

export const WOO_PUBLICATIE = {
  geimplementeerd: 9,
  totaalCategorieen: 17,
  gepubliceerd: 1284,
  tijdigPct: 76,
  weergaven: 48200,
};

export const WOO_CATEGORIEEN: WooCategorie[] = [
  { naam: 'Wetten & alg. regels', n: 42, actief: true },
  { naam: 'Bereikbaarheidsgegevens', n: 8, actief: true },
  { naam: 'Organisatie & werkwijze', n: 61, actief: true },
  { naam: 'Raadsstukken / Statenstukken', n: 318, actief: true },
  { naam: 'Bestuursstukken', n: 204, actief: true },
  { naam: 'Convenanten', n: 27, actief: true },
  { naam: 'Jaarplannen & jaarverslagen', n: 34, actief: true },
  { naam: 'Subsidieverplichtingen', n: 156, actief: true },
  { naam: 'Woo-verzoeken & besluiten', n: 191, actief: true },
  { naam: 'Onderzoeksrapporten', n: 0, actief: false },
  { naam: 'Beschikkingen', n: 0, actief: false },
  { naam: 'Klachtoordelen', n: 0, actief: false },
];

export const WOO_BESLUIT: WooBesluit[] = [
  { naam: 'Volledige openbaarmaking', n: 84, color: '#3fa535' },
  { naam: 'Gedeeltelijke openbaarmaking', n: 79, color: '#0046ad' },
  { naam: 'Geweigerd', n: 18, color: '#b0103c' },
  { naam: 'Reeds openbaar', n: 10, color: '#1f7a8c' },
];

export const WOO_BEZWAAR = {
  ontvangen: 22,
  gegrond: 6,
  ongegrond: 11,
  lopend: 5,
  beroepen: 4,
  uitspraken: 2,
  dwangsommen: 1,
  gemUitzonderingen: 2.3,
};

/* ── Verzoekenregister — volledige 218 regels ───────────────────────────────
   Deterministisch gegenereerd (seeded PRNG) zodat elke sessie identiek is, en
   gewogen naar de afdelings-, onderwerp- en bronverdelingen hierboven.
   Vervang deze generator door de echte query zodra het bord op een API draait. */
function buildRegister(): WooRegisterRow[] {
  let s = 0x9e3779b9;
  const rnd = (): number => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (weighted: [string, number][]): string => {
    const tot = weighted.reduce((a, w) => a + w[1], 0);
    let r = rnd() * tot;
    for (const [v, w] of weighted) {
      if ((r -= w) <= 0) return v;
    }
    return weighted[0][0];
  };
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const cum = [0, 31, 59, 90, 120, 151]; // jan–jun 2026, day-of-year offsets
  const fromDoy = (doy: number): string => {
    let m = 5;
    while (m > 0 && doy < cum[m]) m--;
    return `${pad2(doy - cum[m] + 1)}-${pad2(m + 1)}`;
  };
  const PEIL_DOY = cum[5] + 30 + 3; // ~3 jul als referentie voor open verzoeken

  const AFD: [string, number][] = [
    ['Bestuur & Directie', 52],
    ['Infrastructuur & Mobiliteit', 47],
    ['Ruimte & Wonen', 38],
    ['Natuur & Landbouw', 29],
    ['Economie & Europa', 24],
    ['Bedrijfsvoering & HR', 18],
    ['Vergunningen & Handhaving', 10],
  ];
  const OND: [string, number][] = [
    ['Aanbesteding', 41],
    ['Infrastructuurprojecten', 38],
    ['Subsidies', 31],
    ['Milieu & stikstof', 28],
    ['Bestuurlijke besluiten', 26],
    ['Vergunningen', 21],
    ['Personeel', 17],
    ['Overig', 16],
  ];
  const BRON: [string, number][] = [
    ['Journalist', 41],
    ['Burger', 28],
    ['Bedrijf', 14],
    ['NGO', 9],
    ['Politiek', 5],
    ['Advocaat', 3],
  ];
  const OPEN_STATES = [
    'In behandeling',
    'Informatie zoeken',
    'Juridische toets',
    'Lakken / redactie',
  ];
  const BESLUIT: [string, number][] = [
    ['Volledig', 84],
    ['Gedeeltelijk', 79],
    ['Geweigerd', 18],
    ['Reeds openbaar', 10],
  ];

  const N = 218;
  const rows: WooRegisterRow[] = [];
  for (let i = 0; i < N; i++) {
    const doy = Math.min(150, Math.floor((i / N) * 151 + rnd() * 10));
    const ontvangen = fromDoy(doy);
    const termijn = fromDoy(Math.min(180, doy + 28));
    const afdeling = pick(AFD),
      onderwerp = pick(OND),
      bron = pick(BRON);

    const roll = rnd();
    let status: string, dagen: number, besluit: string;
    if (roll < 0.84) {
      status = 'Gesloten';
      dagen = 12 + Math.floor(rnd() * 34);
      besluit = pick(BESLUIT);
    } else if (roll < 0.96) {
      status = OPEN_STATES[Math.floor(rnd() * OPEN_STATES.length)];
      dagen = Math.max(1, PEIL_DOY - doy);
      besluit = '—';
    } else {
      status = 'Over termijn';
      dagen = 44 + Math.floor(rnd() * 18);
      besluit = '—';
    }
    const verdaagd = rnd() < 0.28;
    const bezwaar = status === 'Gesloten' && rnd() < 0.14;
    rows.push({
      id: '',
      ontvangen,
      termijn,
      afdeling,
      onderwerp,
      bron,
      status,
      dagen,
      besluit,
      bezwaar,
      verdaagd,
    });
  }
  rows.forEach((r, i) => {
    r.id = `WOO-2026-${String(105 + i).padStart(5, '0')}`;
  });
  const key = (dd: string) => {
    const [d, m] = dd.split('-').map(Number);
    return cum[m - 1] + d;
  };
  rows.sort((a, b) => key(a.ontvangen) - key(b.ontvangen));
  return rows;
}

export const WOO_REGISTER: WooRegisterRow[] = buildRegister();

/* ── Rail-filters (bepalen het Verzoekenregister) ───────────────────────────── */
export interface WooFilterDef {
  id: string;
  label: string;
  opts: string[];
}
export const WOO_FILTERS: WooFilterDef[] = [
  { id: 'jaar', label: 'Jaar', opts: ['2026', '2025', '2024'] },
  { id: 'kwartaal', label: 'Kwartaal', opts: ['Alle', 'Q1', 'Q2', 'Q3', 'Q4'] },
  {
    id: 'afdeling',
    label: 'Afdeling',
    opts: [
      'Alle afdelingen',
      'Bestuur & Directie',
      'Infrastructuur & Mobiliteit',
      'Ruimte & Wonen',
      'Natuur & Landbouw',
      'Economie & Europa',
      'Bedrijfsvoering & HR',
      'Vergunningen & Handhaving',
    ],
  },
  {
    id: 'onderwerp',
    label: 'Onderwerp',
    opts: [
      'Alle onderwerpen',
      'Aanbesteding & inkoop',
      'Infrastructuurprojecten',
      'Subsidies',
      'Milieu & stikstof',
      'Bestuurlijke besluiten',
      'Vergunningen',
      'Personeel',
    ],
  },
  {
    id: 'bron',
    label: 'Bron',
    opts: ['Alle bronnen', 'Journalist', 'Burger', 'Bedrijf', 'NGO', 'Politiek', 'Advocaat'],
  },
  {
    id: 'status',
    label: 'Status',
    opts: ['Alle statussen', 'In behandeling', 'Over termijn', 'Gesloten'],
  },
];

export type WooFilters = Record<string, string>;

export const wooDefaultFilters = (): WooFilters =>
  Object.fromEntries(WOO_FILTERS.map((f) => [f.id, f.opts[0]]));

/** Are any filters set to a non-default (index-0) value? */
export function wooAnyActive(filters: WooFilters): boolean {
  return WOO_FILTERS.some((f) => filters[f.id] && filters[f.id] !== f.opts[0]);
}

/** Apply the rail filters to the register rows. */
export function wooFilterRows(rows: WooRegisterRow[], filters: WooFilters): WooRegisterRow[] {
  const firstWord = (v: string) => (v || '').toLowerCase().split(/[\s&/]+/)[0];
  const monthOf = (ontvangen: string) => parseInt((ontvangen || '').split('-')[1], 10); // 'dd-mm'
  const qOf = (m: number) => (m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4');
  return rows.filter((r) => {
    if (filters.jaar && filters.jaar !== '2026') return false; // all register rows are 2026
    if (
      filters.kwartaal &&
      filters.kwartaal !== 'Alle' &&
      qOf(monthOf(r.ontvangen)) !== filters.kwartaal
    )
      return false;
    if (
      filters.afdeling &&
      filters.afdeling !== 'Alle afdelingen' &&
      r.afdeling !== filters.afdeling
    )
      return false;
    if (
      filters.onderwerp &&
      filters.onderwerp !== 'Alle onderwerpen' &&
      firstWord(r.onderwerp) !== firstWord(filters.onderwerp)
    )
      return false;
    if (filters.bron && filters.bron !== 'Alle bronnen' && r.bron !== filters.bron) return false;
    if (filters.status && filters.status !== 'Alle statussen') {
      if (filters.status === 'Gesloten' && r.status !== 'Gesloten') return false;
      if (filters.status === 'Over termijn' && r.status !== 'Over termijn') return false;
      if (
        filters.status === 'In behandeling' &&
        (r.status === 'Gesloten' || r.status === 'Over termijn')
      )
        return false;
    }
    return true;
  });
}

export const WOO_SUGGESTIES: WooSuggestie[] = [
  {
    eyebrow: 'Signaal',
    text: '8 open verzoeken staan over de wettelijke termijn — samen goed voor 3 lopende beroepen. Wil je een tijdigheidsoverzicht per afdeling?',
  },
  {
    eyebrow: 'Bottleneck',
    text: 'Stap "Informatie zoeken" duurt gemiddeld 11,8 dagen — ruim de helft van de doorlooptijd. Zal ik de knelpunten per afdeling uitsplitsen?',
  },
  {
    eyebrow: 'Actieve openbaarmaking',
    text: '9 van 17 verplichte categorieën zijn actief. Onderzoeksrapporten en beschikkingen ontbreken nog. Plan ik een implementatie-afspraak?',
  },
];
