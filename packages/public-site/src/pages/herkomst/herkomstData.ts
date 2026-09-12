// packages/public-site/src/pages/herkomst/herkomstData.ts
/**
 * Chrome strings and background-band content for the Herkomst page.
 * Bilingual copy carried over from
 * docs/herkomst-handoff/reference/keten/keten-data.jsx — only the subset
 * of KT actually used by this page's components (see the plan task that
 * created this file for the full list of what was deliberately excluded).
 */
import type { Lang } from '../../i18n';

export interface HerkomstStrings {
  navHerkomst: string;
  kicker: string;
  title: string;
  sub: string;
  lede: string;
  crumbs: [string, string, string];
  jump: string;
  navPijplijn: string;
  navConcept: string;
  navStandaarden: string;
  ctxH: string;
  ctxLede: string;
  pijplijnH: string;
  pijplijnEn: string;
  pijplijnLede: string;
  conceptH: string;
  conceptEn: string;
  conceptLede: string;
  trackL: string;
  trackLen: string;
  trackR: string;
  trackRen: string;
  steps: { l: string; len: string; r: string; ren: string }[];
  bron: string;
  annotatie: string;
  input: string;
  output: string;
  geenDmn: string;
  afgeleid: string;
  leaf: string;
  reset: string;
  crumbHome: string;
  conclJa: string;
  conclNee: string;
  stdH: string;
  stdEn: string;
  stdLede: string;
  stdOpen: string;
  stdOpenSub: string;
  stdClosed: string;
  stdClosedSub: string;
}

export const HERKOMST_STRINGS: Record<Lang, HerkomstStrings> = {
  nl: {
    navHerkomst: 'Herkomst',
    kicker: 'Zorgtoeslag — begrip Leeftijd',
    title: 'Waar komt dit begrip vandaan?',
    sub: 'Van geciteerde wettekst tot de vraag die de burger in het scherm ziet — uitgewerkt voor één begrip: de leeftijdseis bij zorgtoeslag.',
    lede: 'Links de weg die wet- en regelgeving aflegt, rechts wat de gebruiker daarvan merkt, stap voor stap uitgelijnd. Elk blauw begrip is aanklikbaar: gegevens zijn zelf weer een gevolg van wet- en regelgeving, dus de keten loopt door tot een registratiegegeven.',
    crumbs: ['Regelcatalogus', 'Zorgtoeslag', 'Herkomst van Leeftijd'],
    jump: 'Achtergrond onderaan deze pagina:',
    navPijplijn: 'De pijplijn',
    navConcept: 'Conceptketen',
    navStandaarden: 'Standaarden',
    ctxH: 'Achtergrond — hoe deze herkomst tot stand komt',
    ctxLede:
      'De trace hierboven is geen handwerk: hij valt uit de keten waarmee Provincie Flevoland regelgeving naar uitvoering brengt. Drie stukken achtergrond, kort.',
    pijplijnH: 'De pijplijn — vier stadia',
    pijplijnEn: 'The pipeline — four stages',
    pijplijnLede:
      'Elk stadium levert een artefact op dat het volgende stadium als invoer gebruikt. Er wordt niets opnieuw geïnterpreteerd of overgetypt: de overdracht gebeurt in een open formaat, zodat een besluit terug te volgen is naar de wettekst waar het uit voortkomt.',
    conceptH: 'De conceptketen',
    conceptEn: 'The concept chain',
    conceptLede:
      'Wetgeving en standaarden geven de kaders. Concepten verschijnen op drie plaatsen — uitgelijnd onder de pijplijn-stadia 1, 2 en 3. Dat onderscheid is de kern van de architectuur: een begrip in de wet, hetzelfde begrip geïnterpreteerd in een regelmodel, en het datapunt in een registratie dat als bewijs dient.',
    trackL: 'Wet- & Regelgeving',
    trackLen: 'Legislation & rules',
    trackR: 'Gebruikers',
    trackRen: 'Users — what the citizen sees',
    steps: [
      {
        l: 'Juridische analyse',
        len: 'Legal analysis',
        r: 'Uitleg begrippen',
        ren: 'Explaining the terms',
      },
      { l: 'Regel', len: 'Rule', r: 'Uitvraag gegevens', ren: 'Asking for evidence' },
      { l: 'DMN', len: 'Decision model', r: 'Controle gegevens', ren: 'Checking the evidence' },
      { l: 'Begrippen', len: 'Concepts', r: 'Conclusie', ren: 'Conclusion' },
    ],
    bron: 'Bron',
    annotatie: 'Annotatie',
    input: 'Input',
    output: 'Output',
    geenDmn:
      'Niet van toepassing — dit begrip komt rechtstreeks uit een registratie, er wordt niets berekend.',
    afgeleid: 'Dit begrip is afgeleid van',
    leaf: 'registratiegegeven — einde van de keten',
    reset: 'Begin opnieuw',
    crumbHome: 'Herkomst',
    conclJa: 'Als alle controles slagen',
    conclNee: 'Anders',
    stdH: 'Standaarden',
    stdEn: 'Standards',
    stdLede:
      'De open standaarden dragen de overdracht tussen de stadia. Wat gesloten blijft, blijft binnen de organisatie — en is daarmee vervangbaar zonder de keten te breken.',
    stdOpen: 'Open',
    stdOpenSub: 'draagt de keten',
    stdClosed: 'Gesloten',
    stdClosedSub: 'blijft binnen de organisatie',
  },
  en: {
    navHerkomst: 'Provenance',
    kicker: 'Healthcare allowance — concept Age',
    title: 'Where does this concept come from?',
    sub: 'From quoted legal text to the question the citizen sees on screen — worked out for one concept: the age requirement for healthcare allowance.',
    lede: 'On the left the path legislation and rules travel, on the right what the user experiences, aligned step for step. Every blue concept is clickable: data is itself a consequence of legislation, so the chain continues until it reaches a register value.',
    crumbs: ['Rule catalogue', 'Healthcare allowance', 'Provenance of Age'],
    jump: 'Background at the foot of this page:',
    navPijplijn: 'The pipeline',
    navConcept: 'Concept chain',
    navStandaarden: 'Standards',
    ctxH: 'Background — how this provenance is produced',
    ctxLede:
      'The trace above is not handwork: it falls out of the chain by which the Province of Flevoland moves regulation into execution. Three pieces of background, briefly.',
    pijplijnH: 'The pipeline — four stages',
    pijplijnEn: 'De pijplijn — vier stadia',
    pijplijnLede:
      'Each stage produces an artefact the next stage consumes. Nothing is re-interpreted or re-typed: the handover happens in an open format, so a decision can be traced back to the legal text it derives from.',
    conceptH: 'The concept chain',
    conceptEn: 'De conceptketen',
    conceptLede:
      'Legislation and standards set the frame. Concepts appear in three places — aligned under pipeline stages 1, 2 and 3. That distinction is the heart of the architecture: a concept in law, the same concept interpreted in a rule model, and the data point in a register that serves as evidence.',
    trackL: 'Legislation & rules',
    trackLen: 'Wet- & Regelgeving',
    trackR: 'Users — what the citizen sees',
    trackRen: 'Gebruikers',
    steps: [
      {
        l: 'Legal analysis',
        len: 'Juridische analyse',
        r: 'Explaining the terms',
        ren: 'Uitleg begrippen',
      },
      { l: 'Rule', len: 'Regel', r: 'Asking for evidence', ren: 'Uitvraag gegevens' },
      {
        l: 'Decision model (DMN)',
        len: 'DMN',
        r: 'Checking the evidence',
        ren: 'Controle gegevens',
      },
      { l: 'Concepts', len: 'Begrippen', r: 'Conclusion', ren: 'Conclusie' },
    ],
    bron: 'Source',
    annotatie: 'Annotation',
    input: 'Input',
    output: 'Output',
    geenDmn: 'Not applicable — this concept comes straight from a register; nothing is calculated.',
    afgeleid: 'This concept derives from',
    leaf: 'register value — end of the chain',
    reset: 'Start over',
    crumbHome: 'Provenance',
    conclJa: 'If every check passes',
    conclNee: 'Otherwise',
    stdH: 'Standards',
    stdEn: 'Standaarden',
    stdLede:
      'The open standards carry the handover between stages. What stays closed stays inside the organisation — and is therefore replaceable without breaking the chain.',
    stdOpen: 'Open',
    stdOpenSub: 'carries the chain',
    stdClosed: 'Closed',
    stdClosedSub: 'stays inside the organisation',
  },
};

export interface KtStage {
  no: string;
  naam: { nl: string; en: string };
  en: string;
  tool: string;
  toolSub: { nl: string; en: string };
  nieuw?: boolean;
  note: { nl: string; en: string };
  out: { nl: string; en: string };
}

export const KT_STAGES: KtStage[] = [
  {
    no: '1',
    naam: { nl: 'Juridische analyse', en: 'Legal analysis' },
    en: 'Legal analysis',
    tool: 'Regeleditor (FLINT)',
    toolSub: { nl: 'deterministisch · procedureel', en: 'deterministic · procedural' },
    nieuw: true,
    note: {
      nl: 'Een jurist leest de wettekst en legt vast wát er precies staat: welke handeling, door wie, onder welke voorwaarde. Het resultaat is geen samenvatting maar een formeel frame, gekoppeld aan het artikel waar het uit komt.',
      en: 'A lawyer reads the legal text and records exactly what it says: which act, by whom, under what condition. The result is not a summary but a formal frame, linked to the article it came from.',
    },
    out: { nl: 'FLINT-frames in TriplyDB', en: 'FLINT frames in TriplyDB' },
  },
  {
    no: '2',
    naam: { nl: 'CPSV-publicatie', en: 'Publish public service' },
    en: 'Publish public service',
    tool: 'CPSV Editor',
    toolSub: { nl: 'CPSV-AP 3.2.0 · RDF / Turtle', en: 'CPSV-AP 3.2.0 · RDF / Turtle' },
    note: {
      nl: 'De dienst wordt beschreven in het Europese vocabulaire voor publieke diensten: wie voert uit, voor wie, op welke grondslag, met welke voorwaarden en bewijsstukken. Machineleesbaar, en daarmee vindbaar buiten het eigen systeem.',
      en: 'The service is described in the European vocabulary for public services: who delivers it, for whom, on what legal basis, with which conditions and evidence. Machine-readable, and therefore findable outside its own system.',
    },
    out: { nl: 'TriplyDB knowledge graph', en: 'TriplyDB knowledge graph' },
  },
  {
    no: '3',
    naam: { nl: 'Ontwerp & deploy', en: 'Design & deploy' },
    en: 'Design & deploy',
    tool: 'Linked Data Explorer',
    toolSub: { nl: 'BPMN · DMN · formulieren · documenten', en: 'BPMN · DMN · forms · documents' },
    note: {
      nl: 'Uit de gepubliceerde dienst volgt de uitvoering: een procesmodel (BPMN), beslistabellen (DMN), de formuliervelden en de brieven. Wat hier wordt gebouwd verwijst terug naar de regel, en die naar het wetsartikel.',
      en: 'The published service drives execution: a process model (BPMN), decision tables (DMN), the form fields and the letters. What is built here refers back to the rule, and that rule back to the article of law.',
    },
    out: { nl: 'Operaton + bundel', en: 'Operaton + bundle' },
  },
  {
    no: '4',
    naam: { nl: 'Verifiëren & live', en: 'Verify & go live' },
    en: 'Verify & go live',
    tool: 'MijnOmgeving',
    toolSub: {
      nl: 'acceptatie › productie · tenant: Flevoland',
      en: 'acceptance › production · tenant: Flevoland',
    },
    note: {
      nl: 'De aanvraag draait eerst op acceptatie met echte testgevallen, daarna in productie binnen de tenant van de provincie. De burger ziet één omgeving; achter de schermen zijn het één of meerdere regelsets van corresponderende bevoegde gezagen.',
      en: 'The application first runs in acceptance with real test cases, then in production within the province tenant. The citizen sees one environment; behind it are one or two rule sets from corresponding competent authorities.',
    },
    out: { nl: 'subsidie toegekend', en: 'grant awarded' },
  },
];

export interface KtAbc {
  tag: string;
  naam: { nl: string; en: string };
  en: string;
  tekst: { nl: string; en: string };
}

export const KT_ABC: KtAbc[] = [
  {
    tag: '(a)',
    naam: { nl: 'in de wet', en: 'in law' },
    en: 'in law',
    tekst: {
      nl: 'Begrippen en definities zoals opgenomen in wetteksten. Ongewijzigd geciteerd, met een verwijzing naar artikel en lid — Juriconnect.',
      en: 'Concepts and definitions as they appear in legal texts. Quoted unchanged, referenced to article and paragraph — Juriconnect.',
    },
  },
  {
    tag: '(b)',
    naam: { nl: 'in de regels', en: 'in rules' },
    en: 'in rules',
    tekst: {
      nl: 'Geïnterpreteerde concepten in regelmodellen. Hier valt de interpretatiebeslissing — en die wordt vastgelegd, niet impliciet in code verstopt.',
      en: 'Interpreted concepts in rule models. This is where the interpretation decision is made — and it is recorded, not buried implicitly in code.',
    },
  },
  {
    tag: '(c)',
    naam: { nl: 'in de registraties', en: 'in registers' },
    en: 'in registers',
    tekst: {
      nl: 'Datapunten die dienen als bewijs voor de concepten in (b). BRP, BAG, Kadaster, Handelsregister — elk met een eigen wettelijke grondslag.',
      en: 'Data points serving as evidence for the concepts in (b). BRP, BAG, Kadaster, Trade Register — each with its own legal basis.',
    },
  },
];

export const KT_STANDARDS: { open: string[]; closed: { nl: string[]; en: string[] } } = {
  open: [
    'CPSV-AP',
    'CPRMV',
    'FLINT',
    'RDF / Turtle',
    'BPMN',
    'DMN',
    'NL-SBB',
    'Juriconnect',
    'SKOS',
    'OIDC',
  ],
  closed: {
    nl: ['organisatie-eigen regels', 'vendor-systemen', 'interne registers', 'eDOCS'],
    en: ['organisation-specific rules', 'vendor systems', 'internal registers', 'eDOCS'],
  },
};
