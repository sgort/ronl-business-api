/**
 * Dossierbeheer — static reference data + role/capability derivation.
 *
 * The design prototype shipped a role *switcher* as a demo affordance; in the
 * real cockpit the active role and its capabilities are derived from the
 * Keycloak token (pa-author / pa-editor / pa-admin), mirroring the backend's
 * dossierCaps. The role bar reflects that derived role — it does not grant it.
 */

import type {
  AdminDossier,
  AdminDossierStatus,
  Dossier,
  DossierArchief,
  DossierMarkdown,
  DossierSnippet,
  DossierTemplate,
} from '@ronl/shared';
import { MOCK_DOSSIERS } from './pa.data';

export interface DossierCaps {
  create: boolean;
  edit: boolean;
  template: boolean;
  publish: boolean;
  archive: boolean;
  del: boolean;
}

export interface DossierRole {
  id: 'auteur' | 'redacteur' | 'beheerder' | 'geen';
  label: string;
  keycloak: string;
  note: string;
  can: DossierCaps;
}

const NO_CAPS: DossierCaps = {
  create: false,
  edit: false,
  template: false,
  publish: false,
  archive: false,
  del: false,
};

/** The three governance roles (mirrors the design spec §10). */
export const DB_ROLES: DossierRole[] = [
  {
    id: 'auteur',
    label: 'Auteur',
    keycloak: 'pa-author',
    note: 'Maakt en bewerkt dossiers en hun verhaal. Publiceren, archiveren en verwijderen liggen hoger.',
    can: { ...NO_CAPS, create: true, edit: true },
  },
  {
    id: 'redacteur',
    label: 'Redacteur',
    keycloak: 'pa-editor',
    note: 'Beheert sjablonen en publiceert dossiers naar de cockpit. Geen archivering of verwijdering.',
    can: { create: true, edit: true, template: true, publish: true, archive: false, del: false },
  },
  {
    id: 'beheerder',
    label: 'Beheerder',
    keycloak: 'pa-admin',
    note: 'Volledige rechten incl. Archiefwet-archivering en definitief verwijderen.',
    can: { create: true, edit: true, template: true, publish: true, archive: true, del: true },
  },
];

const ROLE_GEEN: DossierRole = {
  id: 'geen',
  label: 'Geen dossierrol',
  keycloak: '—',
  note: 'Alleen-lezen. Vraag een Beheerder om de rol pa-author, pa-editor of pa-admin toe te kennen.',
  can: NO_CAPS,
};

/** Highest role the token grants, or a read-only pseudo-role when none match. */
export function deriveDossierRole(roles: string[]): DossierRole {
  if (roles.includes('pa-admin')) return DB_ROLES[2];
  if (roles.includes('pa-editor')) return DB_ROLES[1];
  if (roles.includes('pa-author')) return DB_ROLES[0];
  return ROLE_GEEN;
}

export const DB_CAPS: { key: keyof DossierCaps; label: string }[] = [
  { key: 'create', label: 'Aanmaken' },
  { key: 'edit', label: 'Bewerken' },
  { key: 'template', label: 'Sjablonen' },
  { key: 'publish', label: 'Publiceren' },
  { key: 'archive', label: 'Archiveren' },
  { key: 'del', label: 'Verwijderen' },
];

/** Archiefwet — Flevoland selectielijst (illustrative). */
export const DB_CLASSIFICATIES: {
  id: DossierArchief['classificatie'];
  label: string;
  hint: string;
}[] = [
  { id: 'openbaar', label: 'Openbaar', hint: 'Actief openbaar te maken (Woo).' },
  { id: 'intern', label: 'Intern', hint: 'Beperkt — alleen kernteam PA.' },
  { id: 'vertrouwelijk', label: 'Vertrouwelijk', hint: 'Bestuurlijk gevoelig; beperkte kring.' },
];

export const DB_BEWAARTERMIJNEN: {
  id: DossierArchief['bewaartermijn'];
  label: string;
  cat: string;
}[] = [
  { id: 'V5', label: '5 jaar', cat: 'Selectielijst 3.1.2 — lobbydossier zonder besluit' },
  { id: 'V10', label: '10 jaar', cat: 'Selectielijst 3.1.1 — dossier met bestuurlijk besluit' },
  { id: 'V20', label: '20 jaar', cat: 'Selectielijst 2.4 — strategisch kerndossier' },
  {
    id: 'B',
    label: 'Blijvend te bewaren',
    cat: 'Selectielijst 1.1 — te bewaren, overbrenging Erfgoed',
  },
];

export function classificatieLabel(id: string | undefined): string {
  return DB_CLASSIFICATIES.find((c) => c.id === id)?.label ?? '—';
}
export function bewaartermijnLabel(id: string | undefined): string {
  return DB_BEWAARTERMIJNEN.find((b) => b.id === id)?.label ?? '—';
}

/** Human "8 jul 2026" date label for {{today}} expansion + version notes. */
export function todayLabel(d: Date = new Date()): string {
  const months = [
    'jan',
    'feb',
    'mrt',
    'apr',
    'mei',
    'jun',
    'jul',
    'aug',
    'sep',
    'okt',
    'nov',
    'dec',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Template/snippet variable expansion (spec §9). */
export function expandVars(
  md: string,
  ctx: { today?: string; currentUser?: string; department?: string; projectName?: string }
): string {
  if (!md) return md;
  return md
    .replace(/\{\{today\}\}/g, ctx.today ?? todayLabel())
    .replace(/\{\{currentUser\}\}/g, ctx.currentUser ?? '')
    .replace(/\{\{department\}\}/g, ctx.department ?? 'Public Affairs')
    .replace(/\{\{projectName\}\}/g, ctx.projectName ?? '');
}

/** Word count for the Markdown editor status line. */
export function wordCount(...fields: string[]): number {
  return fields
    .join(' ')
    .replace(/[#>*`|_-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

// ── Offline mock (mock-mode Dossierbeheer, mirrors the backend seed) ──
// When the flag banner is set to mock, the whole surface runs on this local
// state — no backend needed — so every page can be validated first. Mirrors
// pa-dossiers.db.ts (SEED_OWNERS + toMarkdown + the archived example).

const SEED_OWNERS: Record<string, string> = {
  stikstof: 'Sanne Bakker',
  lelystad: 'Joost Veenstra',
  energie: 'Mara de Wit',
  jeugdzorg: 'Sanne Bakker',
  oostvaarders: 'Team Omgeving',
};

/**
 * Renders a dossier's three narrative fields as the Markdown the editor loads.
 *
 * Exported only so it can be tested directly. A dossier started from a blank
 * template has empty strings in all three fields -- that is what the `? :`
 * arms are for -- but all five MOCK_DOSSIERS carry filled-in text, so those
 * arms are unreachable through buildSeedAdminDossiers(), the only other
 * caller. Reaching them by blanking a seed dossier instead would mean editing
 * shipped fixture data to serve a test.
 */
export function toMarkdown(d: Dossier): DossierMarkdown {
  const n = d.narratief ?? { onsVerhaal: '', frames: [], tegenframes: [] };
  let ons = n.onsVerhaal ? `## Ons verhaal\n\n${n.onsVerhaal}\n` : '';
  if (n.frames?.length) {
    ons += `\n### Dominante frames\n\n${n.frames.map((f) => `- ${f.text} *(${f.meta})*`).join('\n')}\n`;
  }
  if (n.tegenframes?.length) {
    ons += `\n### Tegenframes\n\n${n.tegenframes.map((f) => `- ${f.text} *(${f.meta})*`).join('\n')}\n`;
  }
  return {
    waaromNu: d.waaromNu ? `## Waarom nu\n\n${d.waaromNu}\n` : '',
    waarover: d.waarover ? `## Waarover\n\n${d.waarover}\n` : '',
    onsVerhaal: ons,
  };
}

/** Build the admin governance list from MOCK_DOSSIERS (offline mock mode). */
export function buildSeedAdminDossiers(): AdminDossier[] {
  const bewerkt = ['2 dgn', '5 dgn', '1 dag', '3 wk', '1 wk'];
  const items: AdminDossier[] = MOCK_DOSSIERS.map((d, idx) => ({
    id: d.id,
    naam: d.naam,
    onderwerp: d.onderwerp,
    status: d.status as AdminDossierStatus,
    momentum: d.momentum,
    eigenaar: SEED_OWNERS[d.id] ?? 'Kernteam PA',
    kompas: JSON.parse(JSON.stringify(d.kompas)),
    md: toMarkdown(d),
    versie: 3,
    gepubliceerd: true,
    sjabloon: 'standaard',
    archief: null,
    bewerkt: bewerkt[idx] ?? '1 wk',
    versies: [
      {
        v: 1,
        at: '12 mei 2026',
        by: SEED_OWNERS[d.id] ?? 'Kernteam PA',
        note: 'Dossier aangemaakt vanuit sjabloon Standaard PA-dossier.',
      },
      {
        v: 2,
        at: '24 mei 2026',
        by: SEED_OWNERS[d.id] ?? 'Kernteam PA',
        note: 'Kompas-startscores gezet; verhaal uitgewerkt.',
      },
      {
        v: 3,
        at: '1 jun 2026',
        by: SEED_OWNERS[d.id] ?? 'Kernteam PA',
        note: 'Verhaal bijgewerkt na laatste ontwikkeling.',
      },
    ],
  }));
  items.push({
    id: 'omgevingswet-2023',
    naam: 'Invoering Omgevingswet',
    onderwerp: 'Provinciale voorbereiding en overgangsrecht',
    status: 'gearchiveerd',
    momentum: 'flat',
    eigenaar: 'Team Omgeving',
    kompas: {},
    md: {
      waaromNu:
        '## Waarom nu\n\nDe wet is per 1-1-2024 in werking getreden; het lobbytraject is afgerond.\n',
      waarover: '',
      onsVerhaal: '',
    },
    versie: 7,
    gepubliceerd: false,
    sjabloon: 'regionaal',
    archief: {
      classificatie: 'intern',
      bewaartermijn: 'V10',
      reden: 'Traject afgerond na inwerkingtreding; bewaren conform selectielijst.',
      at: '15 jan 2026',
      by: 'M. Jansen (Beheerder)',
    },
    bewerkt: '6 mnd',
    versies: [
      { v: 6, at: '20 dec 2025', by: 'Team Omgeving', note: 'Laatste inhoudelijke update.' },
      {
        v: 7,
        at: '15 jan 2026',
        by: 'M. Jansen',
        note: 'Gearchiveerd (Archiefwet) — classificatie Intern, bewaartermijn 10 jaar.',
      },
    ],
  });
  return items;
}

/** Template library (offline mock mode) — mirrors pa-dossiers.db.ts. */
export const DB_TEMPLATES: DossierTemplate[] = [
  {
    id: 'blanco',
    naam: 'Blanco dossier',
    cat: 'Algemeen',
    beschrijving: 'Leeg dossier — begin volledig zelf.',
    versie: '—',
    eigenaar: '—',
    gebruikt: 0,
    seed: { onderwerp: '', waaromNu: '', waarover: '', onsVerhaal: '' },
  },
  {
    id: 'standaard',
    naam: 'Standaard PA-dossier',
    cat: 'Public Affairs',
    beschrijving: 'De vaste opbouw: waarom nu, waarover, ons verhaal, stakeholders.',
    versie: 'v2.1',
    eigenaar: 'Kernteam PA',
    gebruikt: 12,
    seed: {
      onderwerp: 'Korte omschrijving van het onderwerp',
      waaromNu:
        '## Waarom nu\n\nBeschrijf het **momentum**: welk besluit, debat of moment maakt dit dossier nú urgent?\n\n- Aanleiding: {{aanleiding}}\n- Beslismoment: {{datum}}\n- Risico van stilte: …',
      waarover:
        '## Waarover\n\nAfbakening — waar gaat dit dossier wél en niet over.\n\n> Kernboodschap in één zin.',
      onsVerhaal:
        '## Ons verhaal\n\nHet Flevolandse perspectief in één alinea — onderscheidend, uitvoerbaar, met de sector.',
    },
  },
  {
    id: 'eu',
    naam: 'EU-dossier',
    cat: 'Europa',
    beschrijving: 'Voor Brussel-dossiers: rapporteurs, triloog, tijdlijn EP.',
    versie: 'v1.3',
    eigenaar: 'Kernteam PA',
    gebruikt: 4,
    seed: {
      onderwerp: 'Europees wetgevingstraject',
      waaromNu:
        '## Waarom nu\n\n- Fase in het EU-proces: *Commissievoorstel / EP-lezing / triloog*\n- Rapporteur: {{rapporteur}}\n- Stemming verwacht: {{datum}}',
      waarover:
        '## Waarover\n\nDe verordening/richtlijn en de artikelen die Flevoland raken.\n\n| Artikel | Belang voor Flevoland |\n| --- | --- |\n| … | … |',
      onsVerhaal: '## Ons verhaal\n\nHoe Flevoland zich positioneert in het Europese debat.',
    },
  },
  {
    id: 'regionaal',
    naam: 'Regionaal / omgevingsdossier',
    cat: 'Regio',
    beschrijving: 'Gemeenten, waterschap en omgeving centraal.',
    versie: 'v1.0',
    eigenaar: 'Team Omgeving',
    gebruikt: 3,
    seed: {
      onderwerp: 'Regionaal vraagstuk',
      waaromNu: '## Waarom nu\n\nWat speelt er in de regio en waarom is provinciale inzet nodig?',
      waarover: '## Waarover\n\nGebied, betrokken gemeenten en de provinciale rol.',
      onsVerhaal: '## Ons verhaal\n\nDe provincie als verbinder tussen Rijk en regio.',
    },
  },
];

/** Snippet library (offline mock mode) — mirrors pa-dossiers.db.ts. */
export const DB_SNIPPETS: DossierSnippet[] = [
  {
    id: 'goedkeuring',
    naam: 'Goedkeuringstabel',
    cat: 'Proces',
    md: '\n\n| Rol | Naam | Akkoord | Datum |\n| --- | --- | --- | --- |\n| Opsteller | {{currentUser}} | ✍︎ | {{today}} |\n| Teamleider PA | | ☐ | |\n| Portefeuillehouder | | ☐ | |\n',
  },
  {
    id: 'stakeholder',
    naam: 'Stakeholder-blok',
    cat: 'Inhoud',
    md: '\n\n| Stakeholder | Rol | Prioriteit | Sentiment |\n| --- | --- | --- | --- |\n| … | … | nu / kort / warm | + / 0 / − |\n',
  },
  {
    id: 'wijzigingslog',
    naam: 'Wijzigingslog',
    cat: 'Proces',
    md: '\n\n### Wijzigingslog\n\n- **{{today}}** — dossier aangemaakt door {{currentUser}}\n',
  },
  {
    id: 'risico',
    naam: 'Risicomatrix',
    cat: 'Inhoud',
    md: '\n\n| Risico | Kans | Impact | Beheersing |\n| --- | --- | --- | --- |\n| … | laag/midden/hoog | laag/midden/hoog | … |\n',
  },
  {
    id: 'avg',
    naam: 'AVG / Woo-disclaimer',
    cat: 'Juridisch',
    md: '\n\n> **Let op** — dit dossier kan onder de Woo openbaar worden. Vermijd persoonsgegevens en bestuurlijk vertrouwelijke stukken in de vrije tekst.\n',
  },
];
