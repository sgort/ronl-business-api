import type { Lang } from '../i18n';

export const PUB_TYPES = ['bericht', 'nieuws', 'product', 'regel', 'proces'] as const;
export type PubType = (typeof PUB_TYPES)[number];

export interface PubSection {
  id: string;
  type: PubType;
  path: string;
  nl: string;
  en: string;
  nlSub: string;
  enSub: string;
}

export const PUB_SECTIONS: PubSection[] = [
  {
    id: 'berichten',
    type: 'bericht',
    path: '/berichten',
    nl: 'Berichten',
    en: 'Announcements',
    nlSub: 'Officiële berichten van Provincie Flevoland.',
    enSub: 'Official announcements from the Province of Flevoland.',
  },
  {
    id: 'nieuws',
    type: 'nieuws',
    path: '/nieuws',
    nl: 'Nieuws',
    en: 'News',
    nlSub: 'Landelijk nieuws van de Rijksoverheid.',
    enSub: 'National news from the Dutch central government.',
  },
  {
    id: 'producten',
    type: 'product',
    path: '/producten',
    nl: 'Producten & Diensten',
    en: 'Products & Services',
    nlSub:
      'Vergunningen, meldingen en subsidies waar u als inwoner of ondernemer mee te maken krijgt.',
    enSub: 'Permits, notifications and grants for residents and businesses.',
  },
  {
    id: 'regels',
    type: 'regel',
    path: '/regels',
    nl: 'Regelcatalogus',
    en: 'Rule catalogue',
    nlSub:
      'Publieke diensten en de regels waarmee de overheid ze uitvoert — inclusief geldigheidsdatum en bron.',
    enSub:
      'Public services and the rules used to execute them — including validity dates and source.',
  },
  {
    id: 'processen',
    type: 'proces',
    path: '/processen',
    nl: 'Procesbibliotheek',
    en: 'Process library',
    nlSub: 'Hoe een aanvraag stap voor stap door de organisatie loopt.',
    enSub: 'How an application moves through the organisation, step by step.',
  },
];

/** Woordenboek is deliberately not in PUB_SECTIONS: it has no type, no detail
 * route, and is excluded from search/sitemap per ARCHITECTURE.md's "Decided"
 * section. MainNav (Task 11) adds its link separately, statically. */
export const WOORDENBOEK_PATH = '/woordenboek';

export const PUB_TYPE_LABEL: Record<PubType, { nl: string; en: string }> = {
  bericht: { nl: 'Bericht', en: 'Announcement' },
  nieuws: { nl: 'Nieuws', en: 'News' },
  product: { nl: 'Product', en: 'Product' },
  regel: { nl: 'Regel', en: 'Rule' },
  proces: { nl: 'Proces', en: 'Process' },
};

export function sectionForType(type: PubType): PubSection {
  return PUB_SECTIONS.find((s) => s.type === type)!;
}

export function sectionLabel(section: PubSection, lang: Lang): string {
  return lang === 'nl' ? section.nl : section.en;
}

export function sectionSub(section: PubSection, lang: Lang): string {
  return lang === 'nl' ? section.nlSub : section.enSub;
}
