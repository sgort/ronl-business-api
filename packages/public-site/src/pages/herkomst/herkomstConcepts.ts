// packages/public-site/src/pages/herkomst/herkomstConcepts.ts
/**
 * De herkomstgraaf: per begrip de vier stappen wet-en-regelgeving en de
 * vier stappen gebruikers. `begrippen[].ref` verwijst naar een ander
 * begrip in deze graaf — dat maakt de keten aanklikbaar door.
 *
 * Content is hand-authored and carried over byte-identical from
 * docs/herkomst-handoff/reference/keten/keten-concepts.jsx — wetteksten
 * zijn citaten, annotaties/regels/DMN zijn voorbeelduitwerkingen. Sourcing
 * this from the knowledge graph (TriplyDB / CPSV-AP / FLINT) is a later
 * concern; this structure is what a later data layer fills.
 */

export type Bilingual = string | { nl: string; en: string };

export function htx(v: Bilingual, lang: 'nl' | 'en'): string {
  return typeof v === 'object' ? (v[lang] ?? v.nl) : v;
}

export interface KtGroup {
  id: string;
  nl: string;
  en: string;
}

export interface KtBegrip {
  ref?: string;
  naam: Bilingual;
  def?: { nl: string; en: string };
}

export interface KtConcept {
  groep: string;
  naam: { nl: string; en: string };
  kort: { nl: string; en: string };
  meta: [string, string][];
  wet: {
    tekst: { nl: string; en: string };
    bron: string;
    annotatie: { nl: string; en: string };
  };
  regel: { nl: string; en: string };
  dmn: {
    expr: string;
    input: [string, { nl: string; en: string }, string | null][];
    output: [string, { nl: string; en: string }][];
  } | null;
  begrippen: KtBegrip[];
  uitleg: { term: Bilingual; tekst: { nl: string; en: string } }[];
  uitvraag: { vraag: { nl: string; en: string }; veld: string }[];
  controle: { nl: string; en: string }[];
  conclusie: { ja: { nl: string; en: string }; nee: { nl: string; en: string } };
}

export const KT_GROUPS: KtGroup[] = [
  { id: 'zorgtoeslag', nl: 'Zorgtoeslag — het gewerkte voorbeeld', en: 'Healthcare allowance — the worked example' },
  { id: 'basis', nl: 'Onderliggende gegevens', en: 'Underlying data' },
];

export const KT_CONCEPTS: Record<string, KtConcept> = {
  leeftijd: {
    groep: 'zorgtoeslag',
    naam: { nl: 'Leeftijd', en: 'Age' },
    kort: {
      nl: 'Of de verzekerde achttien jaar of ouder is op de datum van berekening — de leeftijdseis voor zorgtoeslag.',
      en: 'Whether the insured person is eighteen or older on the calculation date — the age requirement for healthcare allowance.',
    },
    meta: [
      ['Dienst', 'Zorgtoeslag'],
      ['Uitvoering', 'Dienst Toeslagen'],
      ['Type', 'Afgeleid begrip'],
      ['DMN', 'ja'],
    ],
    wet: {
      tekst: {
        nl: 'verzekerde: de persoon, bedoeld in artikel 1, onder f, van de Zorgverzekeringswet, de persoon die een bijdrage als bedoeld in artikel 68b, vijfde lid, van de Zorgverzekeringswet verschuldigd is, of de persoon, bedoeld in artikel 69 van de Zorgverzekeringswet, steeds vanaf de eerste dag van de kalendermaand volgende op de maand waarin hij achttien jaar wordt, met uitzondering van de verzekerde, bedoeld in artikel 24, eerste of derde lid, van die wet;',
        en: 'insured person: the person referred to in article 1(f) of the Health Insurance Act, the person owing a contribution as referred to in article 68b(5) of the Health Insurance Act, or the person referred to in article 69 of the Health Insurance Act, in each case from the first day of the calendar month following the month in which they turn eighteen, with the exception of the insured person referred to in article 24(1) or (3) of that act;',
      },
      bron: 'Wet op de zorgtoeslag, art. 1 lid 1 onder b',
      annotatie: {
        nl: 'Leeftijd = 18 jaar. De wet noemt geen kale leeftijdsgrens maar een moment: niet de achttiende verjaardag zelf, maar de eerste dag van de maand daarna. Die ene zin bepaalt dat het model twee leeftijden moet kennen — op de berekeningsdatum, en op de laatste dag van de vorige maand.',
        en: 'Age = 18 years. The law names not a bare age limit but a moment: not the eighteenth birthday itself, but the first day of the month after it. That single sentence forces the model to know two ages — on the calculation date, and on the last day of the previous month.',
      },
    },
    regel: {
      nl: 'De leeftijd van de verzekerde van een toeslagaanvraag moet berekend worden als de numerieke waarde van de tijdsduur van zijn geboortedatum tot de datum berekening van de toeslagaanvraag in hele jaren.',
      en: 'The age of the insured person on an allowance application must be calculated as the numeric value of the period from their date of birth to the calculation date of the application, in whole years.',
    },
    dmn: {
      expr: '(leeftijd >= MEERDERJARIGHEIDSLEEFTIJD) and (meerderjarigDezeMaand = false)',
      input: [
        ['datumBerekening', { nl: 'datum van berekening', en: 'calculation date' }, 'datumberekening'],
        ['geboortedatum', { nl: 'geboortedatum', en: 'date of birth' }, 'geboortedatum'],
      ],
      output: [
        ['leeftijdOpDatumBerekening', { nl: 'leeftijd op datum berekening', en: 'age on the calculation date' }],
        ['leeftijdOpLaatsteDagVorigeMaand', { nl: 'leeftijd op laatste dag vorige maand', en: 'age on the last day of the previous month' }],
        ['leeftijdOpLaatsteDagHuidigeMaand', { nl: 'leeftijd op laatste dag huidige maand', en: 'age on the last day of the current month' }],
      ],
    },
    begrippen: [
      { ref: 'datumberekening', naam: 'datumBerekening' },
      { ref: 'geboortedatum', naam: 'geboortedatum' },
    ],
    uitleg: [
      {
        term: 'datumBerekening',
        tekst: {
          nl: 'De dag waarop u de toeslagaanvraag daadwerkelijk instuurt — digitaal of met de post.',
          en: 'The day you actually submit the allowance application — online or by post.',
        },
      },
      {
        term: 'geboortedatum',
        tekst: {
          nl: 'De datum waarop u geboren bent en die de overheid in haar registratie heeft staan bij uw burgerservicenummer.',
          en: 'The date you were born as recorded by the government against your citizen service number.',
        },
      },
    ],
    uitvraag: [
      {
        vraag: { nl: 'Wat is uw burgerservicenummer (BSN)?', en: 'What is your citizen service number (BSN)?' },
        veld: 'BSN-invoer',
      },
      {
        vraag: { nl: 'Wat is uw geboortedatum?', en: 'What is your date of birth?' },
        veld: 'geboortedatum-invoer',
      },
    ],
    controle: [
      {
        nl: 'Is BSN-invoer het BSN van de persoon die de toeslagaanvraag instuurde?',
        en: 'Is BSN-invoer the BSN of the person who submitted the application?',
      },
      {
        nl: 'Komt geboortedatum-invoer overeen met de geboortedatum zoals geregistreerd in de Basisregistratie Personen (BRP) bij sleutel BSN-invoer?',
        en: 'Does geboortedatum-invoer match the date of birth registered in the Personal Records Database (BRP) under the key BSN-invoer?',
      },
    ],
    conclusie: {
      ja: {
        nl: 'De aanvraag is correct en LEEFTIJD kan worden berekend.',
        en: 'The application is correct and AGE can be calculated.',
      },
      nee: {
        nl: 'De aanvraag is niet correct; berekening van LEEFTIJD is (nog) niet nodig. De burger krijgt terug wélke van de twee controles afwijkt — niet een generieke afwijzing.',
        en: 'The application is not correct; calculating AGE is not needed (yet). The citizen is told which of the two checks failed — not given a generic rejection.',
      },
    },
  },

  geboortedatum: {
    groep: 'basis',
    naam: { nl: 'Geboortedatum', en: 'Date of birth' },
    kort: {
      nl: 'De datum waarop de persoon volgens het brondocument is geboren. Zelf geen berekening, maar een registratiegegeven met een eigen wettelijke grondslag.',
      en: 'The date on which the person was born according to the source document. Not a calculation but a registered value with its own legal basis.',
    },
    meta: [
      ['Register', 'BRP'],
      ['Brondocument', 'Geboorteakte'],
      ['Type', 'Registratiegegeven'],
      ['DMN', 'nee'],
    ],
    wet: {
      tekst: {
        nl: 'Op grond van de geboorteakte, opgemaakt door een ambtenaar van de burgerlijke stand in Nederland, waarop als geboorteplaats een plaats in Nederland is vermeld, geschiedt de inschrijving van het kind dat niet reeds is ingeschreven en waarvan de moeder uit wie het kind is geboren op de geboortedatum van het kind als ingezetene is ingeschreven. De inschrijving geschiedt door het college van burgemeester en wethouders van de gemeente waar die moeder als ingezetene is ingeschreven.',
        en: 'On the basis of the birth certificate drawn up by a registrar of births in the Netherlands, stating a Dutch place of birth, the child not already registered is entered in the records, provided the mother who gave birth was registered as a resident on the child’s date of birth. The entry is made by the municipal executive of the municipality where that mother is registered as a resident.',
      },
      bron: 'Wet basisregistratie personen, art. 2.3',
      annotatie: {
        nl: 'geboortedatum = datum geboorteakte, gekoppeld aan de BSN-sleutel van het kind. Het gegeven is niet wat de burger zegt maar wat de akte zegt — de invoer van de burger is daarmee altijd een bewering die tegen de registratie wordt gehouden.',
        en: 'date of birth = the date on the birth certificate, keyed to the child’s BSN. The value is not what the citizen states but what the certificate states — the citizen’s input is therefore always a claim checked against the register.',
      },
    },
    regel: {
      nl: 'In de basisregistratie wordt over de ingeschrevene het volgende gegeven opgenomen: datum geboorteakte.',
      en: 'The following item is recorded in the base registration about the registered person: date of the birth certificate.',
    },
    dmn: null,
    begrippen: [
      { ref: 'bsn', naam: 'burgerservicenummer' },
      {
        naam: { nl: 'Geboortedatum', en: 'Date of birth' },
        def: {
          nl: 'Definitie: de datum waarop de persoon volgens het brondocument is geboren. Populatie: alle personen die ingeschreven zijn in de BRP.',
          en: 'Definition: the date on which the person was born according to the source document. Population: everyone registered in the BRP.',
        },
      },
    ],
    uitleg: [
      {
        term: { nl: 'brondocument', en: 'source document' },
        tekst: {
          nl: 'De officiële akte waarop de registratie is gebaseerd — hier de geboorteakte van de gemeente waar u geboren bent.',
          en: 'The official certificate the registration is based on — here the birth certificate from the municipality where you were born.',
        },
      },
    ],
    uitvraag: [
      {
        vraag: { nl: 'Wat is uw geboortedatum?', en: 'What is your date of birth?' },
        veld: 'geboortedatum-invoer',
      },
    ],
    controle: [
      {
        nl: 'Bestaat er in de BRP een ingeschrevene met sleutel BSN-invoer?',
        en: 'Does the BRP contain a registered person under the key BSN-invoer?',
      },
      {
        nl: 'Komt geboortedatum-invoer overeen met datum geboorteakte bij die ingeschrevene?',
        en: 'Does geboortedatum-invoer match the birth-certificate date of that registered person?',
      },
    ],
    conclusie: {
      ja: {
        nl: 'Geboortedatum staat vast en kan als invoer dienen voor elk begrip dat erop steunt — zoals LEEFTIJD.',
        en: 'The date of birth is established and can serve as input for any concept resting on it — such as AGE.',
      },
      nee: {
        nl: 'Er is geen bruikbaar gegeven. Afwijking gaat naar correctie bij de bronhouder (de gemeente), niet naar afwijzing van de aanvraag.',
        en: 'There is no usable value. A discrepancy goes to correction at the source holder (the municipality), not to rejection of the application.',
      },
    },
  },

  datumberekening: {
    groep: 'basis',
    naam: { nl: 'Datum berekening', en: 'Calculation date' },
    kort: {
      nl: 'Het moment waarnaar de toets wordt uitgevoerd. Geen registratiegegeven maar een procesgegeven — het ontstaat op het moment van indienen.',
      en: 'The moment the assessment is made against. Not a registered value but a process value — it comes into being at the moment of submission.',
    },
    meta: [
      ['Herkomst', 'Proces'],
      ['Type', 'Procesgegeven'],
      ['DMN', 'nee'],
    ],
    wet: {
      tekst: {
        nl: 'De aanspraak op een tegemoetkoming ontstaat met ingang van de eerste dag van het berekeningsjaar waarin de belanghebbende voldoet aan de voorwaarden.',
        en: 'Entitlement to an allowance arises on the first day of the calculation year in which the interested party meets the conditions.',
      },
      bron: 'Algemene wet inkomensafhankelijke regelingen, art. 5 lid 1 — parafrase',
      annotatie: {
        nl: 'De wet noemt het berekeningsjaar, niet de indiendatum. De regelmodellering kiest de indiendatum als peilmoment binnen dat jaar. Dat is een interpretatiebeslissing — daarom staat hij hier, zichtbaar, en niet verstopt in code.',
        en: 'The law names the calculation year, not the submission date. The rule model picks the submission date as the reference moment within that year. That is an interpretation decision — which is why it is recorded here, visible, and not buried in code.',
      },
    },
    regel: {
      nl: 'De datum berekening is de datum waarop de aanvraag door de uitvoeringsorganisatie is ontvangen, ongeacht het kanaal.',
      en: 'The calculation date is the date on which the application is received by the implementing body, regardless of channel.',
    },
    dmn: null,
    begrippen: [],
    uitleg: [
      {
        term: { nl: 'datum berekening', en: 'calculation date' },
        tekst: {
          nl: 'De dag waarop u de aanvraag daadwerkelijk instuurt. Bij digitaal indienen is dat dezelfde dag; per post is het de dag van ontvangst.',
          en: 'The day you actually submit the application. Submitted online it is the same day; by post it is the day of receipt.',
        },
      },
    ],
    uitvraag: [],
    controle: [
      {
        nl: 'Ligt de ontvangstdatum binnen het berekeningsjaar waarvoor wordt aangevraagd?',
        en: 'Does the date of receipt fall within the calculation year applied for?',
      },
    ],
    conclusie: {
      ja: {
        nl: 'Het peilmoment staat vast; alle datumafhankelijke begrippen kunnen worden berekend.',
        en: 'The reference moment is fixed; all date-dependent concepts can be calculated.',
      },
      nee: {
        nl: 'De aanvraag valt buiten het berekeningsjaar en wordt doorgeschoven of afgewezen — met vermelding van het jaar waarvoor hij wél geldt.',
        en: 'The application falls outside the calculation year and is carried forward or rejected — stating the year it does apply to.',
      },
    },
  },

  bsn: {
    groep: 'basis',
    naam: { nl: 'Burgerservicenummer', en: 'Citizen service number' },
    kort: {
      nl: 'De sleutel waarmee een persoon in overheidsregistraties wordt aangeduid. Verwijst nergens naar terug: dit is het einde van de keten.',
      en: 'The key identifying a person across government registers. It refers to nothing further: this is the end of the chain.',
    },
    meta: [
      ['Register', 'BRP'],
      ['Type', 'Sleutel'],
      ['DMN', 'nee'],
    ],
    wet: {
      tekst: {
        nl: 'Het burgerservicenummer is het uniek identificerend nummer van een natuurlijke persoon, dat aan hem wordt toegekend bij de inschrijving in de basisregistratie personen.',
        en: 'The citizen service number is the uniquely identifying number of a natural person, assigned to them upon registration in the Personal Records Database.',
      },
      bron: 'Wet algemene bepalingen burgerservicenummer, art. 1 — parafrase',
      annotatie: {
        nl: 'Het BSN is de enige sleutel die de registers verbindt. Daarom is het ook de plaats waar de keten stopt: er is geen onderliggend begrip dat het BSN afleidt.',
        en: 'The BSN is the only key linking the registers. That is also why the chain stops here: no underlying concept derives the BSN.',
      },
    },
    regel: {
      nl: 'Bij elke uitvraag van een registratiegegeven wordt het BSN als sleutel gebruikt; de grondslag voor het gebruik ervan wordt per dienst vastgelegd.',
      en: 'The BSN is used as the key for every register lookup; the legal basis for its use is recorded per service.',
    },
    dmn: null,
    begrippen: [],
    uitleg: [
      {
        term: 'BSN',
        tekst: {
          nl: 'Uw persoonlijke nummer bij de overheid. U vindt het op uw paspoort, identiteitskaart of rijbewijs.',
          en: 'Your personal number with the government. You will find it on your passport, ID card or driving licence.',
        },
      },
    ],
    uitvraag: [
      {
        vraag: {
          nl: 'Inloggen met DigiD — het BSN wordt niet uitgevraagd maar volgt uit de inlog.',
          en: 'Log in with DigiD — the BSN is not asked for but follows from the login.',
        },
        veld: 'OIDC-claim',
      },
    ],
    controle: [
      {
        nl: 'Is de inlog geldig en op het vereiste betrouwbaarheidsniveau (LoA substantieel)?',
        en: 'Is the login valid and at the required assurance level (LoA substantial)?',
      },
    ],
    conclusie: {
      ja: {
        nl: 'De identiteit staat vast; registraties kunnen op deze sleutel worden bevraagd.',
        en: 'Identity is established; registers can be queried on this key.',
      },
      nee: {
        nl: 'Geen toegang tot registratiegegevens; de aanvraag kan alleen op papier verder, met identificatie aan de balie.',
        en: 'No access to register data; the application can only continue on paper, with identification at the counter.',
      },
    },
  },
};
