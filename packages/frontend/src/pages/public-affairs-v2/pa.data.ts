/**
 * Public Affairs Cockpit — data module + domain types.
 *
 * This is the single source of truth every PA screen reads from. In the
 * 3-week cycles, replace the MOCK_* exports below with calls into
 * `services/pa.api.ts` (same return types) — the screens never change.
 *
 * Cycle 0 (this file): hand-curated mock, validated on paper with the PA team.
 * Cycle N: `getDossiers()` etc. fetch from the backend; keep these types in
 *          packages/shared so frontend and backend agree on the contract.
 */

// ── Domain types ────────────────────────────────────────────────────

/** The six Flevolands Kompas criteria. Fixed in the MVP. */
export type KompasCriterionKey =
  | 'opgaven'
  | 'momentum'
  | 'coalitie'
  | 'uitvoering'
  | 'zichtbaar'
  | 'opbrengst';

export interface KompasCriterionDef {
  key: KompasCriterionKey;
  /** Short label for the radar/scorecard. */
  short: string;
  /** Full criterion name. */
  name: string;
  /** One-line explainer. */
  hint: string;
}

/** Score 0–2 per criterion, with a written duiding (explanation). */
export interface KompasScore {
  score: 0 | 1 | 2;
  duiding: string;
}

export type KompasScores = Record<KompasCriterionKey, KompasScore>;

export type Momentum = 'up' | 'flat' | 'down';
export type DossierStatus = 'actief' | 'sluimerend';
export type Sentiment = 'pos' | 'neu' | 'neg';
export type StakeholderPrio = 'nu' | 'kort' | 'warm';

export interface RitmeItem {
  t: string;
  when: string;
}

export interface DossierRitme {
  lobby: RitmeItem[];
  communicatie: RitmeItem[];
  events: RitmeItem[];
}

export interface Mijlpaal {
  label: string;
  date: string;
  done: boolean;
  soon?: boolean;
}

export interface Stakeholder {
  naam: string;
  rol: string;
  prio: StakeholderPrio;
  laatste: string;
  senti: Sentiment;
}

export interface Frame {
  text: string;
  meta: string;
  kind: 'frame' | 'tegen';
}

export interface DossierNarratief {
  onsVerhaal: string;
  frames: Frame[];
  tegenframes: Frame[];
}

export interface Interventie {
  titel: string;
  motiv: string;
  /** Short Kompas rationale, e.g. "Momentum 2 · Zichtbaarheid 2". */
  kompas: string;
}

export interface TimelineEvent {
  date: string;
  title: string;
  desc: string;
  docs: string[];
  future: boolean;
}

export interface KompasLogEntry {
  date: string;
  text: string;
}

export interface InterventieLogEntry {
  date: string;
  who: string;
  what: string;
  /** What the AI advised. */
  ai: string;
  /** What the human decided. */
  mens: string;
}

export interface OverlegMessage {
  name: string;
  init: string;
  time: string;
  text: string;
}

export interface Dossier {
  id: string;
  naam: string;
  onderwerp: string;
  status: DossierStatus;
  momentum: Momentum;
  waaromNu: string;
  waarover: string;
  kompas: KompasScores;
  doel: string;
  ritme: DossierRitme;
  mijlpalen: Mijlpaal[];
  progressPct: number;
  next: string;
  stakeholders: Stakeholder[];
  narratief: DossierNarratief;
  interventies: Interventie[];
  timeline: TimelineEvent[];
  kompasLog: KompasLogEntry[];
  intervLog: InterventieLogEntry[];
  overleg: OverlegMessage[];
}

export type MonitoringTabId = 'politiek' | 'europa' | 'regionaal' | 'media';
export type SignalImpact = 'kans' | 'risico';

export interface Signal {
  id: string;
  tab: MonitoringTabId;
  /** CSS tag class: nl | eu | regio | media. */
  tag: string;
  tagLabel: string;
  /** PA-relevance 0–10. */
  rel: number;
  title: string;
  src: string;
  duiding: string;
  impact: SignalImpact;
  impactLabel: string;
  /** Dossier this signal rolls up into. */
  dossier: string;
}

export interface AgendaItem {
  day: string;
  mon: string;
  title: string;
  sub: string;
  dossier: string;
}

export interface Template {
  name: string;
  desc: string;
  foot: string;
}

// ── Kompas criteria + helper ────────────────────────────────────────

export const KOMPAS_CRITERIA: KompasCriterionDef[] = [
  {
    key: 'opgaven',
    short: 'Opgaven',
    name: 'Bijdrage aan opgaven',
    hint: 'Regionaal / nationaal / EU',
  },
  { key: 'momentum', short: 'Momentum', name: 'Momentum & timing', hint: 'Speelt het nú?' },
  {
    key: 'coalitie',
    short: 'Coalitie',
    name: 'Coalitiekracht & eigenaarschap',
    hint: 'Wie trekt mee?',
  },
  { key: 'uitvoering', short: 'Uitvoering', name: 'Uitvoeringskracht', hint: 'Kunnen we leveren?' },
  {
    key: 'zichtbaar',
    short: 'Zichtbaar',
    name: 'Strategische zichtbaarheid',
    hint: 'Helpt het ons verhaal?',
  },
  {
    key: 'opbrengst',
    short: 'Opbrengst',
    name: 'Opbrengst',
    hint: 'Regel- / investerings- / experimenteerruimte',
  },
];

export function kompasTotal(k: KompasScores): number {
  return KOMPAS_CRITERIA.reduce((sum, c) => sum + (k[c.key]?.score ?? 0), 0);
}

export const MONITORING_TABS: { id: MonitoringTabId; label: string }[] = [
  { id: 'politiek', label: 'Politiek (NL)' },
  { id: 'europa', label: 'Europa (EU)' },
  { id: 'regionaal', label: 'Regionaal' },
  { id: 'media', label: 'Media & omgeving' },
];

// ── Mock data (replace with services/pa.api.ts in the cycles) ───────

export const MOCK_DOSSIERS: Dossier[] = [
  {
    id: 'stikstof',
    naam: 'Stikstof & landbouwtransitie',
    onderwerp: 'Gebiedsgerichte aanpak en perspectief voor de agrarische sector',
    status: 'actief',
    momentum: 'up',
    waaromNu:
      'Het kabinet presenteert eind deze maand de herziene stikstofkaart. Flevoland wil als jonge landbouwprovincie aan tafel met een eigen, uitvoerbaar perspectief — vóór de cijfers landelijk vastklikken.',
    waarover:
      'Reductiedoelen, gebiedsprocessen en het toekomstperspectief voor de Flevolandse landbouw, in samenhang met natuurherstel rond de Oostvaardersplassen en de randmeren.',
    kompas: {
      opgaven: {
        score: 2,
        duiding:
          'Raakt direct de nationale stikstofopgave én de provinciale landbouw- en natuurambitie.',
      },
      momentum: {
        score: 2,
        duiding: 'Herziene kaart en Kamerdebat binnen drie weken — het venster is nú open.',
      },
      coalitie: {
        score: 1,
        duiding: 'LTO en waterschap trekken mee; gemeenten nog verdeeld over gebiedsgrenzen.',
      },
      uitvoering: {
        score: 1,
        duiding: 'Gebiedsprocessen lopen, maar capaciteit en grondposities blijven krap.',
      },
      zichtbaar: {
        score: 2,
        duiding:
          'Sterke kans om Flevoland te positioneren als provincie van uitvoerbaar perspectief.',
      },
      opbrengst: {
        score: 1,
        duiding: 'Reëel zicht op experimenteerruimte; investeringsruimte afhankelijk van Rijk.',
      },
    },
    doel: 'Een door het Rijk erkend Flevolands gebiedsperspectief dat reductie koppelt aan een uitvoerbaar verdienmodel voor boeren — vastgelegd vóór de zomer.',
    ritme: {
      lobby: [
        { t: 'Technisch overleg met ministerie LVVN over reductiesystematiek', when: 'Wo 11 jun' },
        { t: 'Bilateraal gedeputeerde – woordvoerders coalitiefracties TK', when: 'Wk 25' },
      ],
      communicatie: [
        { t: 'Position paper "Flevolands perspectief" naar Kamerleden', when: 'Vóór 16 jun' },
        { t: 'Opiniestuk gedeputeerde in regionaal dagblad', when: 'Wk 24' },
      ],
      events: [
        { t: 'Werkbezoek Kamercommissie aan proefbedrijf Swifterbant', when: 'Di 24 jun' },
        { t: 'Bestuurlijk overleg gebiedsproces Noordoostpolder', when: 'Do 26 jun' },
      ],
    },
    mijlpalen: [
      { label: 'Position paper afgerond', date: '16 jun', done: false, soon: true },
      { label: 'Werkbezoek Kamercommissie', date: '24 jun', done: false },
      { label: 'Reactie ministerie ontvangen', date: '4 jul', done: false },
    ],
    progressPct: 45,
    next: 'Position paper afronden en delen met woordvoerders — deadline 16 juni.',
    stakeholders: [
      {
        naam: 'Ministerie LVVN',
        rol: 'Beleidseigenaar reductiekader',
        prio: 'nu',
        laatste: '8 dgn',
        senti: 'neu',
      },
      {
        naam: 'LTO Noord – afd. Flevoland',
        rol: 'Sectorvertegenwoordiging',
        prio: 'nu',
        laatste: '2 dgn',
        senti: 'pos',
      },
      {
        naam: 'Waterschap Zuiderzeeland',
        rol: 'Waterkwaliteit & uitvoering',
        prio: 'kort',
        laatste: '5 dgn',
        senti: 'pos',
      },
      {
        naam: 'TK-fractie (coalitie) – landbouwwoordvoerder',
        rol: 'Politiek besluit',
        prio: 'nu',
        laatste: '14 dgn',
        senti: 'neu',
      },
      {
        naam: 'Gemeente Noordoostpolder',
        rol: 'Gebiedsproces',
        prio: 'kort',
        laatste: '3 dgn',
        senti: 'neg',
      },
    ],
    narratief: {
      onsVerhaal:
        'Flevoland is de provincie waar landbouw en natuur niet tegenover elkaar staan, maar samen het perspectief van het nieuwe land vormgeven — met ruimte voor de boer die mee wil.',
      frames: [
        {
          text: '"Stikstof is een onoplosbare patstelling tussen boer en natuur."',
          meta: 'Dominant in landelijke media · stabiel',
          kind: 'frame',
        },
        {
          text: '"Reductie betekent automatisch krimp van de sector."',
          meta: 'Sterk in sectorkanalen',
          kind: 'frame',
        },
      ],
      tegenframes: [
        {
          text: 'Flevoland toont met proefbedrijven dat reductie én rendement samengaan.',
          meta: 'Onderbouwd met data Swifterbant',
          kind: 'tegen',
        },
        {
          text: 'Het gaat niet om minder boeren, maar om een uitvoerbaar pad mét de sector.',
          meta: 'Aansluiting bij LTO-lijn',
          kind: 'tegen',
        },
      ],
    },
    interventies: [
      {
        titel: 'Position paper nu delen met coalitiewoordvoerders',
        motiv:
          'Het momentum is maximaal vóór de herziene kaart. Vroege framing vergroot de kans dat het Flevolandse perspectief in het debat landt.',
        kompas: 'Momentum 2 · Zichtbaarheid 2',
      },
      {
        titel: 'Werkbezoek koppelen aan dataverhaal proefbedrijf',
        motiv:
          'Een concreet werkbezoek maakt het tegenframe tastbaar en versterkt coalitiekracht met LTO en waterschap.',
        kompas: 'Coalitie 1→2 · Uitvoering 1',
      },
    ],
    timeline: [
      {
        date: '12 mei',
        title: 'Startnotitie gebiedsperspectief vastgesteld',
        desc: 'GS-besluit over inzet en uitgangspunten.',
        docs: ['Startnotitie v1.2'],
        future: false,
      },
      {
        date: '28 mei',
        title: 'Technische sessie met LTO en waterschap',
        desc: 'Afstemming reductiesystematiek en meetpunten.',
        docs: ['Verslag 28-05'],
        future: false,
      },
      {
        date: '11 jun',
        title: 'Technisch overleg ministerie LVVN',
        desc: 'Toetsing systematiek aan landelijk kader.',
        docs: [],
        future: false,
      },
      {
        date: '16 jun',
        title: 'Position paper naar Kamerleden',
        desc: 'Verspreiding vóór commissiedebat.',
        docs: ['Position paper (concept)'],
        future: true,
      },
      {
        date: '24 jun',
        title: 'Werkbezoek Kamercommissie Swifterbant',
        desc: 'Proefbedrijf, dataverhaal, gesprek met sector.',
        docs: ['Draaiboek werkbezoek'],
        future: true,
      },
    ],
    kompasLog: [
      { date: '12 mei', text: 'Momentum 1 → bij start: kaart nog niet aangekondigd.' },
      {
        date: '28 mei',
        text: 'Momentum 1 → 2 na aankondiging herziene kaart; zichtbaarheid 1 → 2.',
      },
      {
        date: '5 jun',
        text: 'Coalitie 1: gemeenten verdeeld over gebiedsgrenzen, geen wijziging.',
      },
    ],
    intervLog: [
      {
        date: '13 mei',
        who: 'Startaanpak bepaald',
        what: 'Inzet op gebiedsperspectief i.p.v. generiek reductiestandpunt.',
        ai: 'AI: 3 opties',
        mens: 'Mens: optie B',
      },
      {
        date: '29 mei',
        who: 'Werkbezoek ingepland',
        what: 'Proefbedrijf Swifterbant gekozen als locatie voor Kamerbezoek.',
        ai: 'AI: adviseerde',
        mens: 'Mens: besloten',
      },
    ],
    overleg: [
      {
        name: 'Sanne Bakker',
        init: 'SB',
        time: '09:14',
        text: 'Concept position paper staat in de map. @Joost kun jij de cijfers van Swifterbant checken vóór we delen?',
      },
      {
        name: 'Joost Veenstra',
        init: 'JV',
        time: '09:31',
        text: 'Doe ik. Reductiecijfers kloppen; ik mis nog de vergelijking met het landelijke gemiddelde — voeg ik vanmiddag toe.',
      },
      {
        name: 'Sanne Bakker',
        init: 'SB',
        time: '10:02',
        text: 'Top. Dan delen we donderdag met de coalitiewoordvoerders.',
      },
    ],
  },
  {
    id: 'lelystad',
    naam: 'Luchthaven Lelystad',
    onderwerp: 'Opening, laagvliegroutes en economisch perspectief',
    status: 'actief',
    momentum: 'up',
    waaromNu:
      'De minister van IenW heeft een nieuw afwegingsmoment aangekondigd. Stilte betekent dat het dossier zonder Flevolands geluid wordt ingevuld — terwijl de regionale werkgelegenheid en bereikbaarheid op het spel staan.',
    waarover:
      'Het openingsbesluit, de laagvliegroutes boven omliggende provincies, geluidshinder en het economisch perspectief voor de regio Lelystad.',
    kompas: {
      opgaven: {
        score: 2,
        duiding:
          'Raakt nationale luchtvaartpolitiek en de regionaal-economische ontwikkeling direct.',
      },
      momentum: {
        score: 2,
        duiding: 'Nieuw afwegingsmoment aangekondigd; landelijke media volgen actief.',
      },
      coalitie: {
        score: 1,
        duiding: 'Bedrijfsleven steunt opening; buurprovincies en milieubeweging tegen.',
      },
      uitvoering: {
        score: 0,
        duiding: 'Besluit ligt volledig bij het Rijk; provincie heeft geen directe sturing.',
      },
      zichtbaar: {
        score: 2,
        duiding: 'Maximaal zichtbaar dossier — bepalend voor het beeld van Flevoland.',
      },
      opbrengst: {
        score: 1,
        duiding: 'Investeringsruimte mogelijk bij opening; politiek hoog-risico.',
      },
    },
    doel: 'Een openingsbesluit dat de Flevolandse werkgelegenheid borgt mét een hardere afspraak over laagvliegroutes en hinderbeperking.',
    ritme: {
      lobby: [
        { t: 'Gesprek gedeputeerde – DG Luchtvaart ministerie IenW', when: 'Ma 9 jun' },
        { t: 'Afstemming met regiogemeenten en bedrijfsleven', when: 'Wk 24' },
      ],
      communicatie: [
        { t: 'Feitenkaart laagvliegroutes naar Kamerleden', when: 'Wk 24' },
        { t: 'Q&A-lijn woordvoering geactualiseerd', when: 'Deze week' },
      ],
      events: [
        { t: 'Rondetafel luchtvaart Provinciehuis', when: 'Wo 18 jun' },
        { t: 'Bestuurlijk overleg buurprovincies', when: 'Wk 26' },
      ],
    },
    mijlpalen: [
      { label: 'Feitenkaart routes', date: '12 jun', done: false, soon: true },
      { label: 'Rondetafel luchtvaart', date: '18 jun', done: false },
      { label: 'Afwegingsmoment IenW', date: '15 jul', done: false },
    ],
    progressPct: 30,
    next: 'Feitenkaart laagvliegroutes finaliseren en afstemmen met regiogemeenten.',
    stakeholders: [
      {
        naam: 'Ministerie IenW – DG Luchtvaart',
        rol: 'Besluitvormer opening',
        prio: 'nu',
        laatste: '6 dgn',
        senti: 'neu',
      },
      {
        naam: 'Lelystad Airport / Schiphol Group',
        rol: 'Exploitant',
        prio: 'kort',
        laatste: '11 dgn',
        senti: 'pos',
      },
      {
        naam: 'Provincies Overijssel & Gelderland',
        rol: 'Buurprovincies (routes)',
        prio: 'nu',
        laatste: '9 dgn',
        senti: 'neg',
      },
      {
        naam: 'Bedrijfskring Lelystad',
        rol: 'Regionaal-economisch belang',
        prio: 'kort',
        laatste: '4 dgn',
        senti: 'pos',
      },
      {
        naam: 'Actiegroep HoogOverijssel',
        rol: 'Omgeving / hinder',
        prio: 'warm',
        laatste: '20 dgn',
        senti: 'neg',
      },
    ],
    narratief: {
      onsVerhaal:
        'Lelystad Airport is voor Flevoland een kans op banen en bereikbaarheid — maar alleen verantwoord, met harde garanties over routes en hinder voor onze buren.',
      frames: [
        {
          text: '"Lelystad Airport is een vliegveld zonder bestaansrecht."',
          meta: 'Sterk in landelijke opinie',
          kind: 'frame',
        },
        {
          text: '"De laagvliegroutes schuiven de overlast af op andere provincies."',
          meta: 'Dominant in buurprovincies',
          kind: 'frame',
        },
      ],
      tegenframes: [
        {
          text: 'Verantwoorde opening = banen voor de regio én hardere hinderafspraken dan nu.',
          meta: 'Koppelt economie aan zorgvuldigheid',
          kind: 'tegen',
        },
        {
          text: 'Flevoland neemt de zorgen van buren serieus en zit aan tafel over routes.',
          meta: 'Ontmijnt het afschuif-frame',
          kind: 'tegen',
        },
      ],
    },
    interventies: [
      {
        titel: 'Feitenkaart routes vóór het Kamerdebat verspreiden',
        motiv:
          'De discussie wordt nu gevoerd op beeldvorming, niet op feiten. Een neutrale feitenkaart vergroot de geloofwaardigheid van het Flevolandse geluid.',
        kompas: 'Zichtbaarheid 2 · Momentum 2',
      },
      {
        titel: 'Bestuurlijk overleg met buurprovincies initiëren',
        motiv:
          'Coalitiekracht is de zwakke schakel (score 1). Proactief de buren opzoeken haalt scherpte uit het afschuif-frame.',
        kompas: 'Coalitie 1→2',
      },
    ],
    timeline: [
      {
        date: '2 mei',
        title: 'Aankondiging nieuw afwegingsmoment IenW',
        desc: 'Minister kondigt heroverweging routes aan.',
        docs: ['Kamerbrief IenW'],
        future: false,
      },
      {
        date: '22 mei',
        title: 'Interne lijn woordvoering vastgesteld',
        desc: 'Q&A en kernboodschappen geactualiseerd.',
        docs: ['Woordvoeringslijn v3'],
        future: false,
      },
      {
        date: '9 jun',
        title: 'Gesprek DG Luchtvaart',
        desc: 'Verkenning ruimte voor hardere hinderafspraken.',
        docs: [],
        future: false,
      },
      {
        date: '18 jun',
        title: 'Rondetafel luchtvaart Provinciehuis',
        desc: 'Bedrijfsleven, omgeving, experts aan tafel.',
        docs: ['Draaiboek rondetafel'],
        future: true,
      },
      {
        date: '15 jul',
        title: 'Afwegingsmoment IenW',
        desc: 'Verwacht richtinggevend besluit.',
        docs: [],
        future: true,
      },
    ],
    kompasLog: [
      { date: '2 mei', text: 'Momentum 1 → 2 na aankondiging afwegingsmoment.' },
      {
        date: '22 mei',
        text: 'Uitvoering 0 bevestigd: geen directe provinciale sturing op besluit.',
      },
    ],
    intervLog: [
      {
        date: '3 mei',
        who: 'Reactiestrategie bepaald',
        what: 'Inhoudelijk reageren i.p.v. afwachten; focus op routes + banen.',
        ai: 'AI: 2 scenario\u2019s',
        mens: 'Mens: scenario 1',
      },
    ],
    overleg: [
      {
        name: 'Sanne Bakker',
        init: 'SB',
        time: 'Gisteren',
        text: 'De feitenkaart routes is bijna klaar. @Karim wil jij de geluidscontouren verifiëren bij het RIVM-rapport?',
      },
      {
        name: 'Karim Aydin',
        init: 'KA',
        time: 'Gisteren',
        text: 'Ja — let op: het RIVM-rapport gebruikt een andere meetnorm dan de Kamerbrief. Dat moeten we expliciet benoemen.',
      },
    ],
  },
  {
    id: 'energie',
    naam: 'Energietransitie & netcongestie',
    onderwerp: 'Netcapaciteit, wind- en zonprojecten en industrieaansluiting',
    status: 'actief',
    momentum: 'flat',
    waaromNu:
      'Netbeheerder TenneT heeft de regio rood gekleurd op de congestiekaart. Zonder snelle afspraken stokken nieuwe bedrijfsvestigingen en de verduurzaming van bestaande industrie.',
    waarover:
      'Netcongestie, prioritering van aansluitingen, ruimte voor wind- en zonprojecten en de koppeling met economische ontwikkeling.',
    kompas: {
      opgaven: { score: 2, duiding: 'Kernopgave voor zowel klimaat als regionale economie.' },
      momentum: {
        score: 1,
        duiding: 'Urgent, maar geen scherp politiek beslismoment op korte termijn.',
      },
      coalitie: {
        score: 2,
        duiding: 'Netbeheerder, gemeenten en bedrijfsleven delen het probleembeeld.',
      },
      uitvoering: {
        score: 1,
        duiding: 'Pilots mogelijk; structurele oplossing vraagt nationale keuzes.',
      },
      zichtbaar: {
        score: 1,
        duiding: 'Technisch dossier; minder mediagevoelig dan stikstof of luchthaven.',
      },
      opbrengst: {
        score: 2,
        duiding: 'Reële investerings- en experimenteerruimte via pilots energy hubs.',
      },
    },
    doel: 'Een regionale congestie-aanpak met prioriteringsafspraken en minimaal twee energy-hub-pilots, gedragen door netbeheerder en bedrijfsleven.',
    ritme: {
      lobby: [
        { t: 'Bestuurlijk overleg TenneT & Liander', when: 'Do 12 jun' },
        { t: 'Inbreng bij nationaal Landelijk Actieprogramma Netcongestie', when: 'Wk 26' },
      ],
      communicatie: [{ t: 'Factsheet energy hubs naar regiopartners', when: 'Wk 25' }],
      events: [{ t: 'Werksessie energy hubs met bedrijventerreinen', when: 'Wo 25 jun' }],
    },
    mijlpalen: [
      { label: 'Bestuurlijk overleg netbeheer', date: '12 jun', done: false, soon: true },
      { label: 'Pilot-afspraken energy hubs', date: '10 jul', done: false },
    ],
    progressPct: 55,
    next: 'Bestuurlijk overleg TenneT/Liander voorbereiden — inzet op prioriteringskader.',
    stakeholders: [
      { naam: 'TenneT', rol: 'Landelijk netbeheer', prio: 'nu', laatste: '7 dgn', senti: 'neu' },
      { naam: 'Liander', rol: 'Regionaal netbeheer', prio: 'kort', laatste: '3 dgn', senti: 'pos' },
      {
        naam: 'Ministerie EZK',
        rol: 'Nationaal kader netcongestie',
        prio: 'kort',
        laatste: '16 dgn',
        senti: 'neu',
      },
      {
        naam: 'Bedrijvenkring Almere',
        rol: 'Industrie / aansluitingen',
        prio: 'kort',
        laatste: '5 dgn',
        senti: 'pos',
      },
    ],
    narratief: {
      onsVerhaal:
        'Flevoland heeft de ruimte en de wil om koploper te zijn in de energietransitie — als het net die ambitie niet in de weg staat. Wij maken van congestie een proeftuin.',
      frames: [
        {
          text: '"Het net zit vol; nieuwe ambities zijn voorlopig onmogelijk."',
          meta: 'Breed in vakmedia',
          kind: 'frame',
        },
      ],
      tegenframes: [
        {
          text: 'Congestie is óók een kans: Flevoland als proeftuin voor energy hubs en slim laden.',
          meta: 'Positief, oplossingsgericht',
          kind: 'tegen',
        },
      ],
    },
    interventies: [
      {
        titel: 'Pilot energy hubs als landelijk voorbeeld positioneren',
        motiv:
          'Opbrengst (2) en coalitie (2) zijn sterk. Door de pilot landelijk te framen vergroot je zichtbaarheid (nu 1) zonder extra uitvoeringslast.',
        kompas: 'Opbrengst 2 · Coalitie 2',
      },
    ],
    timeline: [
      {
        date: '6 mei',
        title: 'Congestiekaart TenneT: regio rood',
        desc: 'Aanleiding voor versnelde regionale aanpak.',
        docs: ['Congestiekaart Q2'],
        future: false,
      },
      {
        date: '12 jun',
        title: 'Bestuurlijk overleg netbeheerders',
        desc: 'Inzet op prioriteringskader aansluitingen.',
        docs: [],
        future: true,
      },
      {
        date: '25 jun',
        title: 'Werksessie energy hubs',
        desc: 'Met bedrijventerreinen Almere en Lelystad.',
        docs: ['Factsheet energy hubs'],
        future: true,
      },
    ],
    kompasLog: [{ date: '6 mei', text: 'Opbrengst 1 → 2 na verkenning energy-hub-pilots.' }],
    intervLog: [
      {
        date: '7 mei',
        who: 'Aanpak gekozen',
        what: 'Proeftuin-framing i.p.v. probleemframing richting Rijk.',
        ai: 'AI: adviseerde',
        mens: 'Mens: besloten',
      },
    ],
    overleg: [
      {
        name: 'Sanne Bakker',
        init: 'SB',
        time: '2 dgn',
        text: 'Liander is enthousiast over de hub-pilot. @Joost laten we de factsheet vóór het BO klaar hebben.',
      },
    ],
  },
  {
    id: 'jeugdzorg',
    naam: 'Jeugdzorg-financiering',
    onderwerp: 'Structurele bekostiging en regionale samenwerking',
    status: 'actief',
    momentum: 'down',
    waaromNu:
      'De landelijke hervormingsagenda jeugd loopt vertraging op. Het momentum voor extra structurele middelen zakt weg, terwijl de regionale tekorten oplopen.',
    waarover:
      'Structurele financiering van de jeugdzorg, de rol van de provincie in regionale samenwerking en de afstemming met gemeenten en VWS.',
    kompas: {
      opgaven: {
        score: 1,
        duiding: 'Belangrijk maatschappelijk, maar primair een gemeentelijke taak.',
      },
      momentum: {
        score: 0,
        duiding: 'Hervormingsagenda vertraagd; geen scherp beslismoment in zicht.',
      },
      coalitie: {
        score: 1,
        duiding: 'Gemeenten zoeken de provincie op, maar rolverdeling is onhelder.',
      },
      uitvoering: {
        score: 1,
        duiding: 'Provincie kan verbinden en agenderen, niet zelf bekostigen.',
      },
      zichtbaar: {
        score: 1,
        duiding: 'Gevoelig dossier; zichtbaarheid kan twee kanten op werken.',
      },
      opbrengst: {
        score: 0,
        duiding: 'Weinig directe regel- of investeringsruimte voor de provincie.',
      },
    },
    doel: 'Een heldere, afgebakende provinciale rol als verbinder tussen gemeenten en VWS — zonder oneigenlijke verwachtingen over bekostiging.',
    ritme: {
      lobby: [{ t: 'Afstemming met regio-gemeenten over gezamenlijke inzet', when: 'Wk 26' }],
      communicatie: [{ t: 'Interne notitie rolafbakening provincie', when: 'Wk 25' }],
      events: [{ t: 'Bestuurlijk overleg jeugd regio Flevoland', when: 'Begin juli' }],
    },
    mijlpalen: [
      { label: 'Notitie rolafbakening', date: '20 jun', done: false },
      { label: 'Bestuurlijk overleg jeugd', date: '3 jul', done: false },
    ],
    progressPct: 20,
    next: 'Interne notitie rolafbakening opstellen vóór het bestuurlijk overleg.',
    stakeholders: [
      {
        naam: 'Ministerie VWS',
        rol: 'Stelselverantwoordelijke',
        prio: 'warm',
        laatste: '24 dgn',
        senti: 'neu',
      },
      {
        naam: 'Gemeente Almere',
        rol: 'Grootste jeugdzorgregio',
        prio: 'kort',
        laatste: '8 dgn',
        senti: 'neu',
      },
      {
        naam: 'Regio-gemeenten Flevoland',
        rol: 'Samenwerkingspartners',
        prio: 'kort',
        laatste: '12 dgn',
        senti: 'pos',
      },
    ],
    narratief: {
      onsVerhaal:
        'De provincie lost de jeugdzorg niet op, maar verbindt gemeenten en Rijk zodat goede zorg dichtbij georganiseerd blijft.',
      frames: [
        {
          text: '"De provincie moet de tekorten in de jeugdzorg oplossen."',
          meta: 'Verwachting bij sommige raden',
          kind: 'frame',
        },
      ],
      tegenframes: [
        {
          text: 'De kracht van de provincie zit in verbinden en agenderen, niet in bekostigen.',
          meta: 'Realistische rolafbakening',
          kind: 'tegen',
        },
      ],
    },
    interventies: [
      {
        titel: 'Rol bewust beperken — verwachtingen managen',
        motiv:
          'Met momentum 0 en opbrengst 0 is intensiveren niet verstandig. Investeer in heldere rolafbakening om afbreukrisico te beperken.',
        kompas: 'Momentum 0 · Opbrengst 0',
      },
    ],
    timeline: [
      {
        date: '18 apr',
        title: 'Signaal oplopende tekorten regio',
        desc: 'Gemeenten vragen provinciale betrokkenheid.',
        docs: ['Brief regio-gemeenten'],
        future: false,
      },
      {
        date: '20 jun',
        title: 'Notitie rolafbakening',
        desc: 'Interne lijn over provinciale rol.',
        docs: [],
        future: true,
      },
    ],
    kompasLog: [{ date: '18 apr', text: 'Momentum 1 → 0 na vertraging hervormingsagenda jeugd.' }],
    intervLog: [
      {
        date: '19 apr',
        who: 'Inzet getemperd',
        what: 'Bewust terughoudend; focus op rolafbakening i.p.v. profilering.',
        ai: 'AI: adviseerde temporiseren',
        mens: 'Mens: besloten',
      },
    ],
    overleg: [
      {
        name: 'Sanne Bakker',
        init: 'SB',
        time: '5 dgn',
        text: 'Laten we de verwachtingen scherp houden. @team de notitie rolafbakening heeft prioriteit boven nieuwe toezeggingen.',
      },
    ],
  },
  {
    id: 'oostvaarders',
    naam: 'Oostvaardersplassen',
    onderwerp: 'Natuurbeheer en bezoekersperspectief',
    status: 'sluimerend',
    momentum: 'flat',
    waaromNu:
      'Rustig dossier zonder acuut beslismoment. Beheer loopt volgens plan; relevant als achtergrond bij het stikstofdossier.',
    waarover:
      'Beheer van het natuurgebied, grote grazers, recreatief medegebruik en de relatie met het bredere natuurherstel.',
    kompas: {
      opgaven: { score: 1, duiding: 'Provinciaal natuuricoon, beperkte landelijke opgave nú.' },
      momentum: { score: 0, duiding: 'Geen acuut beslismoment; beheer loopt.' },
      coalitie: { score: 1, duiding: 'Staatsbosbeheer en provincie afgestemd.' },
      uitvoering: { score: 2, duiding: 'Beheerorganisatie staat; uitvoering op orde.' },
      zichtbaar: { score: 1, duiding: 'Kan oplaaien bij incidenten; nu rustig.' },
      opbrengst: { score: 0, duiding: 'Geen nieuwe regel- of investeringsruimte aan de orde.' },
    },
    doel: 'Stabiel beheer en een positief bezoekersperspectief; klaar om te schakelen als het stikstofdossier raakvlakken oplevert.',
    ritme: {
      lobby: [],
      communicatie: [{ t: 'Reguliere afstemming Staatsbosbeheer', when: 'Kwartaal' }],
      events: [],
    },
    mijlpalen: [{ label: 'Kwartaalrapportage beheer', date: '1 jul', done: false }],
    progressPct: 80,
    next: 'Monitoren; activeren bij raakvlak met stikstof-gebiedsproces.',
    stakeholders: [
      {
        naam: 'Staatsbosbeheer',
        rol: 'Beheerder gebied',
        prio: 'warm',
        laatste: '30 dgn',
        senti: 'pos',
      },
    ],
    narratief: {
      onsVerhaal:
        'De Oostvaardersplassen zijn het bewijs dat Flevoland natuur van wereldformaat herbergt — een icoon om trots op te zijn en zorgvuldig te beheren.',
      frames: [],
      tegenframes: [],
    },
    interventies: [
      {
        titel: 'Dossier sluimerend houden, koppelen aan stikstof',
        motiv:
          'Alle kompas-signalen wijzen op lage urgentie. Geen actieve interventie; bewaken op raakvlak met het stikstof-gebiedsproces.',
        kompas: 'Momentum 0 · Uitvoering 2',
      },
    ],
    timeline: [
      {
        date: '1 apr',
        title: 'Kwartaalrapportage beheer Q1',
        desc: 'Beheer volgens plan, geen bijzonderheden.',
        docs: ['Rapportage Q1'],
        future: false,
      },
    ],
    kompasLog: [{ date: '1 apr', text: 'Status sluimerend bevestigd; geen wijzigingen.' }],
    intervLog: [],
    overleg: [],
  },
];

export const MOCK_AGENDA: AgendaItem[] = [
  {
    day: '09',
    mon: 'jun',
    title: 'Gesprek DG Luchtvaart (IenW)',
    sub: 'Luchthaven Lelystad · gedeputeerde',
    dossier: 'lelystad',
  },
  {
    day: '11',
    mon: 'jun',
    title: 'Technisch overleg ministerie LVVN',
    sub: 'Stikstof · reductiesystematiek',
    dossier: 'stikstof',
  },
  {
    day: '12',
    mon: 'jun',
    title: 'Bestuurlijk overleg TenneT & Liander',
    sub: 'Netcongestie · prioriteringskader',
    dossier: 'energie',
  },
  {
    day: '18',
    mon: 'jun',
    title: 'Rondetafel luchtvaart',
    sub: 'Provinciehuis · bedrijfsleven & omgeving',
    dossier: 'lelystad',
  },
  {
    day: '24',
    mon: 'jun',
    title: 'Werkbezoek Kamercommissie Swifterbant',
    sub: 'Stikstof · proefbedrijf',
    dossier: 'stikstof',
  },
];

export const MOCK_SIGNALS: Signal[] = [
  {
    id: 'sg1',
    tab: 'politiek',
    tag: 'nl',
    tagLabel: 'Politiek NL',
    rel: 9,
    title: 'Kamervragen over tijdpad herziene stikstofkaart',
    src: 'Tweede Kamer · schriftelijke vragen · vandaag',
    duiding:
      'Vergroot de kans dat de kaart eerder politiek besproken wordt. Versnelt het venster voor het Flevolandse perspectief.',
    impact: 'kans',
    impactLabel: 'Kans',
    dossier: 'stikstof',
  },
  {
    id: 'sg2',
    tab: 'politiek',
    tag: 'nl',
    tagLabel: 'Politiek NL',
    rel: 8,
    title: 'Motie aangekondigd over heroverweging laagvliegroutes',
    src: 'Tweede Kamer · plenair · gisteren',
    duiding:
      'Kan het afwegingsmoment vervroegen. Risico dat het debat zich versmalt tot routes zonder oog voor regionale economie.',
    impact: 'risico',
    impactLabel: 'Risico',
    dossier: 'lelystad',
  },
  {
    id: 'sg3',
    tab: 'europa',
    tag: 'eu',
    tagLabel: 'Europa',
    rel: 6,
    title: 'EU-richtlijn netcapaciteit: concept-herziening gepubliceerd',
    src: 'Europese Commissie · DG ENER · deze week',
    duiding:
      'Biedt op termijn ruimte voor flexibele aansluitvoorwaarden. Relevant als onderbouwing voor de energy-hub-pilots.',
    impact: 'kans',
    impactLabel: 'Kans',
    dossier: 'energie',
  },
  {
    id: 'sg4',
    tab: 'regionaal',
    tag: 'regio',
    tagLabel: 'Regionaal',
    rel: 7,
    title: 'Noordoostpolder twijfelt over gebiedsgrenzen stikstof',
    src: 'Gemeenteraad Noordoostpolder · besluitenlijst · 2 dgn',
    duiding:
      'Verzwakt de coalitiekracht (kompas 1). Vraagt om bilateraal gesprek vóór het Kamerwerkbezoek.',
    impact: 'risico',
    impactLabel: 'Risico',
    dossier: 'stikstof',
  },
  {
    id: 'sg5',
    tab: 'media',
    tag: 'media',
    tagLabel: 'Media',
    rel: 8,
    title: 'Landelijk dagblad: "Lelystad Airport, het vliegveld dat maar niet opent"',
    src: 'Traditionele media · opinie · gisteren',
    duiding:
      'Versterkt het frame "vliegveld zonder bestaansrecht". Tegenframe met banen + hinderafspraken nu inzetten.',
    impact: 'risico',
    impactLabel: 'Risico',
    dossier: 'lelystad',
  },
  {
    id: 'sg6',
    tab: 'media',
    tag: 'media',
    tagLabel: 'Media (sociaal)',
    rel: 5,
    title: 'Toename positief sentiment rond proefbedrijf Swifterbant',
    src: 'Sociale media · monitoring (Polpo) · 24 u',
    duiding:
      'Het dataverhaal over reductie én rendement resoneert. Versterk dit vóór en tijdens het werkbezoek.',
    impact: 'kans',
    impactLabel: 'Kans',
    dossier: 'stikstof',
  },
  {
    id: 'sg7',
    tab: 'regionaal',
    tag: 'regio',
    tagLabel: 'Regionaal',
    rel: 4,
    title: 'Bedrijvenkring Almere vraagt urgentie netcongestie',
    src: 'Regionaal nieuws · 3 dgn',
    duiding: 'Onderschrijft het probleembeeld en versterkt de coalitie rond de energy hubs.',
    impact: 'kans',
    impactLabel: 'Kans',
    dossier: 'energie',
  },
];

export const MOCK_TEMPLATES: Template[] = [
  {
    name: 'Lobbyfiche',
    desc: 'Kernboodschap, vraag, gesprekspartner en gewenst resultaat op één A4.',
    foot: 'Sjabloon · mens vult in',
  },
  {
    name: 'Position paper',
    desc: 'Onderbouwde standpuntnotitie voor Kamerleden of bestuurders.',
    foot: 'Sjabloon · mens vult in',
  },
  {
    name: 'Praatpunten',
    desc: 'Spreeklijn en Q&A voor een gesprek of mediamoment.',
    foot: 'Sjabloon · mens vult in',
  },
  {
    name: 'Werkbezoek-draaiboek',
    desc: 'Programma, rolverdeling en boodschap voor een bezoek.',
    foot: 'Sjabloon · mens vult in',
  },
];

// ── Synchronous accessors (swap bodies for async API in the cycles) ──
export const getDossiers = (): Dossier[] => MOCK_DOSSIERS;
export const getDossier = (id: string): Dossier | undefined =>
  MOCK_DOSSIERS.find((d) => d.id === id);
export const getAgenda = (): AgendaItem[] => MOCK_AGENDA;
export const getSignals = (): Signal[] => MOCK_SIGNALS;
export const getTemplates = (): Template[] => MOCK_TEMPLATES;
