/** Shape shared by nl.ts and en.ts — enforced structurally by i18n.test.ts. */
export interface Translations {
  org: string;
  orgSub: string;
  login: string;
  skip: string;
  navHome: string;
  navAll: string;
  search: string;
  searchLabel: string;
  placeholder: string;
  heroTitle: string;
  heroLede: string;
  results: string;
  resultsFor: string;
  allResults: string;
  filters: string;
  clear: string;
  sort: string;
  sortRel: string;
  sortDate: string;
  sortAz: string;
  type: string;
  source: string;
  audience: string;
  noResults: string;
  noResultsBody: string;
  back: string;
  tech: string;
  techLede: string;
  aside: string;
  readMore: string;
  updated: string;
  publisher: string;
  identifier: string;
  api: string;
  apiBody: string;
  footerAbout: string;
  footerBrowse: string;
  footerLegal: string;
  footerLinks: [string][];
  footerNote: string;
  tabOrg: string;
  tabDienst: string;
  tabRegel: string;
  tabBegrip: string;
  filterDienst: string;
  allDiensten: string;
  concept: string;
  dienst: string;
  rulesIn: string;
  conceptsIn: string;
  validFrom: string;
  filterRule: string;
  filterConcept: string;
  embedNote: string;
  embedOpen: string;
}

export const nl: Translations = {
  org: 'Open Regels Nederland',
  orgSub: 'Publieke kennisbank · Provincie Flevoland',
  login: 'Inloggen voor medewerkers',
  skip: 'Direct naar de inhoud',
  navHome: 'Home',
  navAll: 'Alles doorzoeken',
  search: 'Zoeken',
  searchLabel: 'Zoek in de publieke kennisbank',
  placeholder: 'Zoek een product, regel, proces of begrip…',
  heroTitle: 'Zoek in de regels, producten en processen van de overheid',
  heroLede:
    'Alles wat een ambtenaar in Flevoland ziet aan openbare informatie — regelgeving, producten, processen en begrippen — staat hier ook. Zonder inloggen, zonder account.',
  results: 'Zoekresultaten',
  resultsFor: 'resultaten voor',
  allResults: 'items in de kennisbank',
  filters: 'Verfijn',
  clear: 'Alle filters wissen',
  sort: 'Sorteer op',
  sortRel: 'Relevantie',
  sortDate: 'Datum',
  sortAz: 'A–Z',
  type: 'Soort',
  source: 'Bron',
  audience: 'Voor wie',
  noResults: 'Geen resultaten',
  noResultsBody:
    'Controleer de spelling, gebruik minder woorden, of zoek op een breder begrip. U kunt ook per onderdeel bladeren.',
  back: 'Terug naar resultaten',
  tech: 'Technische details',
  techLede: 'Voor ontwikkelaars en informatie-analisten.',
  aside: 'Over dit item',
  readMore: 'Lees verder bij de bron',
  updated: 'Bijgewerkt',
  publisher: 'Uitvoeringsorganisatie',
  identifier: 'Identificatie',
  api: 'Open data',
  apiBody: 'Dit item is ook machineleesbaar op te vragen via de open, anonieme API.',
  footerAbout: 'Over deze site',
  footerBrowse: 'Bladeren',
  footerLegal: 'Verantwoording',
  footerLinks: [['Toegankelijkheidsverklaring (WCAG 2.1 AA)'], ['Open data & API']],
  footerNote:
    'Deze site toont uitsluitend openbare informatie. Er worden geen persoonsgegevens verwerkt en er is geen inlog nodig.',
  tabOrg: 'Organisaties',
  tabDienst: 'Diensten',
  tabRegel: 'Regels',
  tabBegrip: 'Begrippen',
  filterDienst: 'Filter op dienst',
  allDiensten: 'Alle diensten',
  concept: 'Begrip',
  dienst: 'Dienst',
  rulesIn: 'Regels in deze dienst',
  conceptsIn: 'Begrippen in deze dienst',
  validFrom: 'Geldig vanaf',
  filterRule: 'Zoek op regelnaam…',
  filterConcept: 'Zoek op begrip…',
  embedNote: 'Deze pagina toont de RONL-thesaurus rechtstreeks vanaf skosmos.open-regels.nl.',
  embedOpen: 'Openen in een nieuw tabblad',
};
