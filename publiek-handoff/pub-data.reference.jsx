/* Public search site — index + i18n. Built on window.MOCK_* (preview/mock-data.jsx).
   NOTE: UI copy is intentionally Dutch (with an English set); code and comments are English. */

const PUB_TYPES = ['bericht', 'nieuws', 'product', 'regel', 'proces', 'begrip'];

const PUB_T = {
  nl: {
    org: 'Open Regels Nederland', orgSub: 'Publieke kennisbank · Provincie Flevoland',
    login: 'Inloggen voor medewerkers', skip: 'Direct naar de inhoud',
    navHome: 'Home', navAll: 'Alles doorzoeken',
    search: 'Zoeken', searchLabel: 'Zoek in de publieke kennisbank',
    placeholder: 'Zoek een product, regel, proces of begrip…',
    heroTitle: 'Zoek in de regels, producten en processen van de overheid',
    heroLede: 'Alles wat een ambtenaar in Flevoland ziet aan openbare informatie — regelgeving, producten, processen en begrippen — staat hier ook. Zonder inloggen, zonder account.',
    heroSug: 'Bijvoorbeeld:', stats: [['56', 'producten & diensten'], ['84', 'gepubliceerde regels'], ['143', 'begrippen'], ['6', 'processen'],],
    results: 'Zoekresultaten', resultsFor: 'resultaten voor', allResults: 'items in de kennisbank',
    filters: 'Verfijn', clear: 'Alle filters wissen', sort: 'Sorteer op', sortRel: 'Relevantie', sortDate: 'Datum', sortAz: 'A–Z',
    type: 'Soort', source: 'Bron', audience: 'Voor wie',
    noResults: 'Geen resultaten', noResultsBody: 'Controleer de spelling, gebruik minder woorden, of zoek op een breder begrip. U kunt ook per onderdeel bladeren.',
    back: 'Terug naar resultaten', tech: 'Technische details', techLede: 'Voor ontwikkelaars en informatie-analisten.',
    aside: 'Over dit item', readMore: 'Lees verder bij de bron', updated: 'Bijgewerkt',
    publisher: 'Uitvoeringsorganisatie', legal: 'Wettelijke grondslag', identifier: 'Identificatie', api: 'Open data',
    apiBody: 'Dit item is ook machineleesbaar op te vragen via de open, anonieme API.',
    footerAbout: 'Over deze site', footerBrowse: 'Bladeren', footerLegal: 'Verantwoording',
    footerLinks: [['Toegankelijkheidsverklaring (WCAG 2.1 AA)'], ['Privacyverklaring'], ['Open data & API'], ['Contact']],
    footerNote: 'Deze site toont uitsluitend openbare informatie. Er worden geen persoonsgegevens verwerkt en er is geen inlog nodig.',
    a11yLegend: 'Toegankelijkheid in beeld',
    tabOrg: 'Organisaties', tabDienst: 'Diensten', tabRegel: 'Regels', tabBegrip: 'Begrippen',
    filterDienst: 'Filter op dienst', allDiensten: 'Alle diensten', concept: 'Begrip', dienst: 'Dienst',
    rulesIn: 'Regels in deze dienst', conceptsIn: 'Begrippen in deze dienst', validFrom: 'Geldig vanaf',
    filterRule: 'Zoek op regelnaam…', filterConcept: 'Zoek op begrip…',
    embedNote: 'Deze pagina toont de RONL-thesaurus rechtstreeks vanaf skosmos.open-regels.nl.',
    embedOpen: 'Openen in een nieuw tabblad',
    a11yBody: 'De rode markeringen tonen de WCAG 2.1 AA-maatregelen die in het ontwerp zitten: skiplink, zichtbare focus (geel/zwart), 4.5:1 contrast, labels op elk formulierveld, en landmark-structuur.',
  },
  en: {
    org: 'Open Regels Nederland', orgSub: 'Public knowledge base · Province of Flevoland',
    login: 'Staff login', skip: 'Skip to main content',
    navHome: 'Home', navAll: 'Search everything',
    search: 'Search', searchLabel: 'Search the public knowledge base',
    placeholder: 'Search a product, rule, process or concept…',
    heroTitle: 'Search the rules, products and processes of Dutch government',
    heroLede: 'Every piece of public information a Flevoland civil servant sees — regulations, products, processes and concepts — is published here too. No login, no account.',
    heroSug: 'For example:', stats: [['56', 'products & services'], ['84', 'published rules'], ['143', 'concepts'], ['6', 'processes'],],
    results: 'Search results', resultsFor: 'results for', allResults: 'items in the knowledge base',
    filters: 'Refine', clear: 'Clear all filters', sort: 'Sort by', sortRel: 'Relevance', sortDate: 'Date', sortAz: 'A–Z',
    type: 'Type', source: 'Source', audience: 'Audience',
    noResults: 'No results', noResultsBody: 'Check the spelling, use fewer words, or try a broader term. You can also browse per section.',
    back: 'Back to results', tech: 'Technical details', techLede: 'For developers and information analysts.',
    aside: 'About this item', readMore: 'Read more at the source', updated: 'Updated',
    publisher: 'Implementing body', legal: 'Legal basis', identifier: 'Identifier', api: 'Open data',
    apiBody: 'This item is also machine-readable through the open, anonymous API.',
    footerAbout: 'About this site', footerBrowse: 'Browse', footerLegal: 'Accountability',
    footerLinks: [['Accessibility statement (WCAG 2.1 AA)'], ['Privacy statement'], ['Open data & API'], ['Contact']],
    footerNote: 'This site publishes public information only. No personal data is processed and no login is required.',
    a11yLegend: 'Accessibility, annotated',
    tabOrg: 'Organisations', tabDienst: 'Services', tabRegel: 'Rules', tabBegrip: 'Concepts',
    filterDienst: 'Filter by service', allDiensten: 'All services', concept: 'Concept', dienst: 'Service',
    rulesIn: 'Rules in this service', conceptsIn: 'Concepts in this service', validFrom: 'Valid from',
    filterRule: 'Search rule names…', filterConcept: 'Search concepts…',
    embedNote: 'This page embeds the RONL thesaurus directly from skosmos.open-regels.nl.',
    embedOpen: 'Open in a new tab',
    a11yBody: 'Red annotations mark the WCAG 2.1 AA measures built into the design: skip link, visible focus (yellow/black), 4.5:1 contrast, a label on every form field, and landmark structure.',
  },
};

const PUB_SECTIONS = [
  { id: 'berichten', type: 'bericht', nl: 'Berichten', en: 'Announcements',
    nlSub: 'Officiële berichten van Provincie Flevoland.', enSub: 'Official announcements from the Province of Flevoland.' },
  { id: 'nieuws', type: 'nieuws', nl: 'Nieuws', en: 'News',
    nlSub: 'Landelijk nieuws van de Rijksoverheid.', enSub: 'National news from the Dutch central government.' },
  { id: 'producten', type: 'product', nl: 'Producten & Diensten', en: 'Products & Services',
    nlSub: 'Vergunningen, meldingen en subsidies waar u als inwoner of ondernemer mee te maken krijgt.', enSub: 'Permits, notifications and grants for residents and businesses.' },
  { id: 'regels', type: 'regel', nl: 'Regelcatalogus', en: 'Rule catalogue',
    nlSub: 'Publieke diensten en de regels waarmee de overheid ze uitvoert — inclusief geldigheidsdatum en bron.', enSub: 'Public services and the rules used to execute them — including validity dates and source.' },
  { id: 'processen', type: 'proces', nl: 'Procesbibliotheek', en: 'Process library',
    nlSub: 'Hoe een aanvraag stap voor stap door de organisatie loopt.', enSub: 'How an application moves through the organisation, step by step.' },
  { id: 'woordenboek', type: 'begrip', nl: 'Gegevenswoordenboek', en: 'Data dictionary', iframe: 'https://skosmos.open-regels.nl/ronl/', detailSection: 'regels',
    nlSub: 'De volledige RONL-thesaurus (Skosmos): alle begrippen, hun definities en onderlinge relaties.', enSub: 'The full RONL thesaurus (Skosmos): every concept, its definition and its relations.' },
];

/* Rules per service — in production these come from the RONL knowledge graph.
   Written out here so every service with a count is genuinely browsable. */
const PUB_RULES = {
  'Zorgtoeslag': ['Recht op zorgtoeslag', 'Leeftijdseis 18 jaar', 'Nederlandse zorgverzekering vereist', 'Verblijfsstatus toetsen', 'Toeslagpartner bepalen', 'Toetsingsinkomen bepalen', 'Vermogenstoets alleenstaande', 'Vermogenstoets met partner', 'Standaardpremie vaststellen', 'Normpremie alleenstaande', 'Normpremie meerpersoonshuishouden', 'Drempelinkomen bepalen', 'Hoogte zorgtoeslag alleenstaande', 'Hoogte zorgtoeslag met partner', 'Afbouwpercentage boven drempelinkomen'],
  'Sudiefinanciering': ['Recht op studiefinanciering', 'Nationaliteitseis', 'Leeftijdsgrens aanvraag', 'Ingeschreven bij erkende opleiding', 'Onderwijssoort bepalen (mbo/hbo/wo)', 'Voltijd of deeltijd bepalen', 'Nominale studieduur bepalen', 'Prestatiebeurs of gift', 'Basisbeurs uitwonend', 'Basisbeurs thuiswonend', 'Uitwonendheid vaststellen', 'Recht op aanvullende beurs', 'Ouderlijk inkomen bepalen', 'Veronderstelde ouderbijdrage', 'Weigerachtige ouder', 'Hoogte aanvullende beurs mbo', 'Hoogte aanvullende beurs ho', 'Recht op studentenreisproduct', 'Week- of weekendabonnement bepalen', 'Maximum rentedragende lening', 'Recht op collegegeldkrediet', 'Hoogte collegegeldkrediet', 'Recht op levenlanglerenkrediet', 'Verlenging bij bijzondere omstandigheden', 'Diplomatermijn prestatiebeurs', 'Omzetting beurs naar gift', 'Draagkracht terugbetaling'],
  'Investeringssubsidie duurzame energie en energiebesparing - dakisolatie': ['Recht op ISDE-subsidie', 'Eigenaar-bewoner toetsen', 'Bouwjaar woning toetsen', 'Isolatiemaatregel erkend', 'Minimale isolatieoppervlakte', 'Rd-waarde eis dakisolatie', 'Uitvoering door bouwbedrijf', 'Aanvraag binnen 24 maanden na uitvoering', 'Subsidiebedrag per m²', 'Maximaal subsidiabel oppervlak', 'Bonus bij twee maatregelen', 'Budgetplafond kalenderjaar', 'Samenloop met gemeentelijke subsidie'],
  'Regeling bekostiging vo-scholen': ['Recht op basisbekostiging', 'Erkende vestiging bepalen', 'Hoofdvestiging of nevenvestiging', 'Teldatum leerlingaantal', 'Leerlingaantal vaststellen', 'Bedrag per leerling onderbouw', 'Bedrag per leerling bovenbouw', 'Vast bedrag hoofdvestiging', 'Vast bedrag nevenvestiging', 'Toeslag praktijkonderwijs', 'Toeslag leerwegondersteunend onderwijs', 'Correctie bij fusie of splitsing', 'Vaststelling totale bekostiging'],
  'Employee Role Assignment': ['Afdeling bepalen', 'Functieprofiel bepalen', 'Applicatierol toekennen', 'Kandidaatgroep toekennen', 'Toegangsniveau bepalen', 'LOA-eis per rol', 'Rol caseworker toekennen', 'Rol behandelaar toekennen', 'Rol beheerder toekennen', 'Functiescheiding controleren', 'Vervaldatum rol bepalen'],
  'Replacement tree required?': ['Vervangingsplicht houtopstand'],
  'Tree felling permitted?': ['Velvergunning vereist'],
};

const PUB_TYPE_LABEL = {
  bericht: { nl: 'Bericht', en: 'Announcement' }, nieuws: { nl: 'Nieuws', en: 'News' },
  product: { nl: 'Product', en: 'Product' }, regel: { nl: 'Regel', en: 'Rule' },
  proces: { nl: 'Proces', en: 'Process' }, begrip: { nl: 'Begrip', en: 'Concept' },
};

function pubBuildIndex() {
  const M = window;
  const out = [];
  (M.MOCK_BERICHTEN || []).forEach(b => out.push({
    id: 'ber-' + b.id, type: 'bericht', title: b.title, summary: b.excerpt,
    org: 'Provincie Flevoland', date: b.date, audience: ['Inwoner', 'Ondernemer'], external: 'flevoland.nl',
  }));
  (M.MOCK_NEWS || []).forEach(n => out.push({
    id: 'nws-' + n.id, type: 'nieuws', title: n.title, summary: n.excerpt,
    org: 'Rijksoverheid', date: n.date, audience: ['Inwoner', 'Ondernemer'], external: 'rijksoverheid.nl',
  }));
  (M.MOCK_PRODUCTEN?.items || []).forEach((p, i) => out.push({
    id: 'prd-' + i, type: 'product', title: p.naam, summary: p.desc,
    org: 'Provincie Flevoland', audience: p.groepen, external: 'flevoland.nl',
    facts: [['Aanvragen bij', 'Provincie Flevoland'], ['Doelgroep', p.groepen.join(', ')], ['Bron', 'Samenwerkende Catalogi (UPL)']],
  }));
  (M.MOCK_CATALOGUS?.diensten || []).forEach(d => {
    const grp = (M.MOCK_CATALOGUS.regels || []).find(g => g.dienst === d.naam);
    const orgRow = (M.MOCK_CATALOGUS.organisaties || []).find(o => o.diensten.includes(d.naam));
    const named = PUB_RULES[d.naam];
    const rules = (grp && grp.rules && grp.rules.length) ? grp.rules
      : (named || []).map((naam, i) => ({ naam, geldig: '2026-01-01', betrouwbaarheid: 'high' }));
    out.push({
      id: 'reg-' + d.id, type: 'regel', title: d.naam, summary: d.desc,
      org: orgRow ? orgRow.naam : 'Onbekend', audience: ['Inwoner', 'Professional', 'Ontwikkelaar'],
      external: orgRow ? orgRow.url : null, rules, ruleCount: grp ? grp.count : rules.length,
      begrippen: (M.MOCK_CATALOGUS.begrippen || []).filter(b => b.dienst === d.naam).map(b => b.label),
      facts: [['Uitvoeringsorganisatie', orgRow ? orgRow.naam : '—'], ['Aantal regels', String(grp ? grp.count : 0)], ['Vindbaar via', 'RONL kennisgraaf']],
      tech: [['dienst.id', d.id], ['bron', 'RONL knowledge graph (SPARQL)'], ['formaat', 'DMN 1.3 + JSON-LD'], ['api', '/v1/public/regels/' + d.id]],
    });
  });
  (M.MOCK_PROCESSEN || []).forEach((p, i) => out.push({
    id: 'prc-' + i, type: 'proces', title: p.naam,
    summary: p.desc || 'Uitvoerbaar proces (BPMN) dat is gepubliceerd op het procesplatform van Provincie Flevoland.',
    org: 'Provincie Flevoland', date: p.deployed, audience: ['Professional', 'Ontwikkelaar'], tags: p.tags,
    facts: [['Proceskey', p.key], ['Gepubliceerd', p.deployed], ['Kenmerken', p.tags.join(', ')]],
    tech: [['process.key', p.key], ['engine', 'Camunda 7 / BPMN 2.0'], ['formulieren', String((p.forms || []).length)], ['subprocessen', String((p.subprocesses || []).length)], ['api', '/v1/public/processen/' + p.key]],
    forms: p.forms, subprocesses: p.subprocesses, documents: p.documents,
  }));
  (M.MOCK_CATALOGUS?.begrippen || []).forEach((b, i) => out.push({
    id: 'bgr-' + i, type: 'begrip', title: b.label,
    summary: 'Begrip uit de regelset “' + b.dienst + '”. Gebruikt als invoer- of uitvoerwaarde bij de beoordeling van een aanvraag.',
    org: 'RONL Concepts (Skosmos)', audience: ['Professional', 'Ontwikkelaar'], dienst: b.dienst,
    facts: [['Gebruikt in', b.dienst], ['Vocabulaire', 'RONL Concepts'], ['Beheerder', 'Open Regels Nederland']],
    tech: [['skos:prefLabel', b.label], ['vocabulaire', 'ronl-concepts'], ['formaat', 'SKOS / RDF'], ['api', '/v1/public/begrippen?q=' + encodeURIComponent(b.label)]],
  }));
  return out;
}

const PUB_SUGGESTIONS = ['thuisbatterij', 'bomen kappen', 'zorgtoeslag', 'stiltegebied'];

function pubSearch(index, q, filters) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let rows = index.map(it => {
    const hay = (it.title + ' ' + (it.summary || '') + ' ' + it.org).toLowerCase();
    let score = 0;
    terms.forEach(t => {
      if (it.title.toLowerCase().includes(t)) score += 10;
      if (hay.includes(t)) score += 4;
      if (hay.split(/\W+/).some(w => w.startsWith(t))) score += 2;
    });
    return { it, score };
  });
  if (terms.length) rows = rows.filter(r => r.score > 0);
  if (filters.types?.length) rows = rows.filter(r => filters.types.includes(r.it.type));
  if (filters.orgs?.length) rows = rows.filter(r => filters.orgs.includes(r.it.org));
  if (filters.audience?.length) rows = rows.filter(r => (r.it.audience || []).some(a => filters.audience.includes(a)));
  if (filters.sort === 'az') rows.sort((a, b) => a.it.title.localeCompare(b.it.title, 'nl'));
  else if (filters.sort === 'date') rows.sort((a, b) => (b.it.date ? 1 : 0) - (a.it.date ? 1 : 0));
  else rows.sort((a, b) => b.score - a.score);
  return rows.map(r => r.it);
}

function pubFacetCounts(index, key, getter) {
  const map = new Map();
  index.forEach(it => [].concat(getter(it) || []).forEach(v => v && map.set(v, (map.get(v) || 0) + 1)));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

Object.assign(window, { PUB_TYPES, PUB_T, PUB_SECTIONS, PUB_TYPE_LABEL, PUB_SUGGESTIONS, PUB_RULES, pubBuildIndex, pubSearch, pubFacetCounts });
