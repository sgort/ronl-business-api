/**
 * RIP phase catalogue — the twelve sub-processes (R2.1…R6.1), lifted from
 * docs/infra-beheer-handoff/reference/pb-phases.reference.jsx and merged
 * with the shared phase↔process-definition-key mapping. See
 * docs/superpowers/specs/2026-08-10-rip-phase-catalogue-deployment-status-design.md.
 */
import { RIP_PHASE_KEYS } from '@ronl/shared';

export interface RipStage {
  code: string;
  name: string;
  color: string;
}

export const RIP_STAGES: RipStage[] = [
  { code: 'R2', name: 'Planvoorbereiding', color: '#0046ad' },
  { code: 'R3', name: 'Contractvorming', color: '#7a5af0' },
  { code: 'R4', name: 'Aanbesteding', color: '#b85c00' },
  { code: 'R5', name: 'Uitvoering', color: '#0a8e8e' },
  { code: 'R6', name: 'Decharge', color: '#b0103c' },
];

export interface RipPhase {
  code: string;
  stage: string;
  name: string;
  lead: string;
  roles: string[];
  entry: string;
  exit: string;
  docs: string[];
  gates: string[];
  krediet: boolean;
  /** Named body that decides the kredietbesluit, shown when krediet is
   *  true (e.g. "Ja — Infra-overleg"). Undefined when krediet is false. */
  kredietBeslisser?: string;
  weeks: number;
  bron: string;
  processDefinitionKey?: string;
  /** No process model even planned (R5.3) — never counts as WIP. */
  beyond?: boolean;
}

const CONTENT: Omit<RipPhase, 'processDefinitionKey'>[] = [
  {
    code: 'R2.1',
    stage: 'R2',
    name: 'Projectplan planvoorbereiding',
    lead: 'Projectleider',
    roles: [
      'Aandrager',
      'Manager Projectbeheersing',
      'Projectleider',
      'Projectondersteuner',
      'Deelnemers PSU',
      'RIP-team',
      'AO',
    ],
    entry: 'Start RIP fase 1 — intakeverzoek Aandrager',
    exit: 'Projectplan 4. Uitgangspunten VO-fase',
    docs: [
      '1. Intake-formulier',
      '2. Intake-verslag',
      '3. PSU-verslag',
      '4. Uitgangspunten VO-fase',
      'Risicodossier',
      'Projectplanning',
    ],
    gates: ['Intake-formulier akkoord?', 'Akkoord Intake-verslag?', 'Akkoord Uitgangspunten VO?'],
    krediet: false,
    weeks: 10,
    bron: 'RipPhase1Process.bpmn · 11 taken · 8 formulieren · 3 documenten',
  },
  {
    code: 'R2.2',
    stage: 'R2',
    name: 'Voorlopig Ontwerp (VO)',
    lead: 'Ontwerper',
    roles: ['Omgevingsmanager', 'Ontwerper', 'Projectleider', 'RIP-team', 'Aandrager', 'Adviseur'],
    entry: 'Vastgesteld Projectplan (uitgangspunten VO)',
    exit: 'Definitief VO vastgesteld',
    docs: [
      'Klanteisen (KES)',
      'Knelpuntenanalyse & categorie-indeling',
      'Klic-melding kabels en leidingen',
      'Concept VO',
      'Definitief VO',
      'Ontwerptoelichting',
      'Hoeveelheidsbepaling',
      'Objectenboom (Relatics/OTL)',
      'Bevindingenformulier',
    ],
    gates: ['Bespreken concept VO — bevindingen verwerkt?'],
    krediet: false,
    weeks: 16,
    bron: 'Overzichtsplaat R2.2 — VO (21-11-2024)',
  },
  {
    code: 'R2.3',
    stage: 'R2',
    name: 'VO-raming',
    lead: 'Kosten- en contractdeskundige',
    roles: [
      'RIP-team',
      'Projectleider',
      'Manager Projectbeheersing',
      'Kosten- en contractdeskundige',
      'Kostenadviseur',
      'Financiën',
      'Infra-overleg',
    ],
    entry: 'Definitief VO + hoeveelheidsbepaling',
    exit: 'Projectplan 5. Afronding VO-fase',
    docs: [
      'Projectraming VO',
      'SSK-raming',
      'Inkoopplan / inkoopstrategie',
      'Memo projectkrediet',
      'Besluit projectkrediet',
      'Evaluatie VO (Qualtrics)',
    ],
    gates: ['Raming binnen projectkrediet?', 'Akkoord Projectplan 5?'],
    krediet: true,
    kredietBeslisser: 'Infra-overleg',
    weeks: 8,
    bron: 'Overzichtsplaat R2.3 — VO-raming (14-8-2025)',
  },
  {
    code: 'R2.4',
    stage: 'R2',
    name: 'DO en -raming',
    lead: 'Projectleider',
    roles: [
      'Projectleider',
      'Extern ingenieursbureau',
      'Adviseurs',
      'Beheerder Assetmanagement',
      'Kosten- en contractdeskundige',
      'Vestigingsmanager',
      'Financiën',
      'Infra-overleg',
    ],
    entry: 'Projectplan 5. Afronding VO-fase + opdracht extern IB',
    exit: 'Projectplan 6. Afronding DO-fase',
    docs: [
      'Concept DO',
      'Definitief DO',
      'Concept DO-raming',
      'DO-raming',
      'Projectraming DO',
      'V&G-plan',
      'Vergunningenscan',
      'ILS Provincie Flevoland',
      'Ontwerptoelichting',
    ],
    gates: [
      'Bespreken concept DO — akkoord?',
      'Toetsen aanpassingen door PKT',
      'Raming binnen projectkrediet?',
    ],
    krediet: true,
    kredietBeslisser: 'Infra-overleg',
    weeks: 20,
    bron: 'Overzichtsplaat R2.4 — DO en -raming (12-8-2025)',
  },
  {
    code: 'R3.1',
    stage: 'R3',
    name: 'Opstellen bestek en tekeningen',
    lead: 'Projectleider',
    roles: [
      'Projectleider',
      'Ontwerper',
      'Directievoerder',
      'Technisch adviseur',
      'Kosten- en contractdeskundige',
      'Omgevingsmanager',
      'Toezichthouder',
      'Inkoopadviseur werken',
    ],
    entry: 'Projectplan 6. Afronding DO-fase',
    exit: 'Getoetste contract- en aanbestedingsdocumenten',
    docs: [
      'Concept bestekstekeningen',
      'Definitieve bestekstekeningen',
      'Bestek (incl. bijlagen)',
      'Inschrijvingsleidraad',
      'SSK-raming',
      'Maatregelenplan',
      'Bevindingenformulier',
    ],
    gates: [
      'Toetsen bestekstekeningen — akkoord?',
      'Toetsen bestek — akkoord?',
      'Toetsen inschrijfleidraad — akkoord?',
    ],
    krediet: false,
    weeks: 14,
    bron: 'Overzichtsplaat R3.1 (17-3-2026) — incl. matrix vaste lezers / risicogestuurd lezen',
  },
  {
    code: 'R3.2',
    stage: 'R3',
    name: 'Afronding bestek en tekeningen',
    lead: 'Kosten- en contractdeskundige',
    roles: [
      'Kosten- en contractdeskundige',
      'Projectleider',
      'AO',
      'Directievoerder',
      'Vestigingsmanager',
      'Financiën',
      'Infra-overleg',
    ],
    entry: 'Getoetste contract- en aanbestedingsdocumenten',
    exit: 'Projectplan 7. Afronden contractvormingsfase',
    docs: [
      'Projectraming Bestek',
      'Memo projectkrediet',
      'Besluit projectkrediet',
      'Concept toezichtplan',
      'Evaluatie DO en bestek (Qualtrics)',
    ],
    gates: ['Akkoord projectraming bestek?', 'Beoordelen concept toezichtplan — akkoord?'],
    krediet: true,
    kredietBeslisser: 'Infra-overleg',
    weeks: 6,
    bron: 'Overzichtsplaat R3.2 (23-3-2026)',
  },
  {
    code: 'R4.1',
    stage: 'R4',
    name: 'Aanbestedingsproces',
    lead: 'Inkoopadviseur',
    roles: [
      'Inkoopadviseur',
      'Kosten- en contractdeskundige',
      'Projectleider',
      'Projectondersteuner',
      'AO',
      'Concerndirecteur',
      'Financiën',
    ],
    entry: 'Verzoek tot aanbesteden (na Projectplan 7)',
    exit: 'Nota besluitvorming vastgesteld — gunningsvoornemen',
    docs: [
      'Aanbestedingsdossier',
      'Nota van inlichtingen',
      'Aanbieding aannemer',
      'Projectraming na aanbesteding',
      'Gunningsvoornemen',
      'Proces verbaal',
      'Nota besluitvorming',
    ],
    gates: [
      'Dossier volledig?',
      'Onregelmatigheid gevonden?',
      'Over-/onderschrijding dekkingsbron?',
    ],
    krediet: true,
    kredietBeslisser: 'Concerndirecteur',
    weeks: 12,
    bron: 'Overzichtsplaat R4.1 (17-7-2025) — koppeling TenderNed / inkoopproces IN1',
  },
  {
    code: 'R5.1',
    stage: 'R5',
    name: 'Voorbereiding op uitvoering',
    lead: 'Directievoerder',
    roles: [
      'Directievoerder',
      'Projectleider',
      'Toezichthouder',
      'Omgevingsmanager',
      'Communicatieadviseur',
      'Vestigingsmanager',
      'Manager Projectbeheersing',
      'Kosten- en contractdeskundige',
      'Adviseur B&O V&G',
      'Opdrachtnemer',
    ],
    entry: 'Gunning — start overdracht BO13.1',
    exit: 'Startoverleg gehouden — vrijgave start werk',
    docs: [
      'Werkbestek',
      'Definitief toezichtsplan',
      'Uitgangspunten uitvoering',
      'V&G uitvoerplan (ON)',
      'Werkplannen (ON)',
      'Uitvoeringsplanning (ON)',
      'Verslag startoverleg',
      'Risicodossier contractbeheersing',
    ],
    gates: ['Akkoord alle documenten ON?', 'Technische installaties in project?'],
    krediet: false,
    weeks: 8,
    bron: 'Overzichtsplaat R5.1 (28-4-2026) — inrichting Better Performance + VISI',
  },
  {
    code: 'R5.2',
    stage: 'R5',
    name: 'Directievoering en toezicht (UAV)',
    lead: 'Directievoerder',
    roles: [
      'Directievoerder',
      'Toezichthouder',
      'Opdrachtnemer',
      'Kosten- en contractdeskundige',
      'Projectleider',
      'AO',
      'Ondersteuner',
    ],
    entry: 'Start werk "buiten" na vrijgave R5.1',
    exit: 'Werk gereed — verzoek tot opneming',
    docs: [
      'Weekstaat (ON)',
      'Weekrapport',
      'Afwijkingenrapport (ON)',
      'Afwijkingenrapportage (AWR)',
      'Advies afwijking',
      'Geaccordeerde termijnen',
      'Uitstel tot oplevering (ON)',
      'Brief uitstel tot oplevering',
      'Nota besluitvorming',
    ],
    gates: [
      'Weekstaat akkoord?',
      'Afwijking binnen of buiten contract?',
      'Overzicht AWR akkoord?',
      'Werk gereed?',
      'Waarde < of > € 50.000?',
    ],
    krediet: true,
    kredietBeslisser: 'AO of Concerndirecteur (afhankelijk van drempel)',
    weeks: 40,
    bron: 'Overzichtsplaat R5.2 — Directievoering en toezicht UAV (20-7-2026); VISI + besteksadministratie + webformulier ATB',
  },
  {
    code: 'R5.3',
    stage: 'R5',
    name: '(Vervroegde) ingebruikname / oplevering',
    lead: 'Directievoerder',
    beyond: true,
    roles: ['Directievoerder', 'Toezichthouder', 'Opdrachtnemer'],
    entry: 'Werk gereed gemeld in R5.2',
    exit: '—',
    docs: [],
    gates: [],
    krediet: false,
    weeks: 4,
    bron: 'PLACEHOLDER — geen overzichtsplaat aangeleverd. Bekend uit verwijzingen in R5.2 (organiseren interne schouw, restpunten oplossen door ON) en R5.4 (oplevering areaal).',
  },
  {
    code: 'R5.4',
    stage: 'R5',
    name: 'Oplevering en onderhoudsperiode',
    lead: 'Directievoerder',
    roles: [
      'Directievoerder',
      'Beheerder',
      'Databeheerder',
      'Vestigingsmanager',
      'Toezichthouder',
      'Projectleider',
      'Ondersteuner',
      'Opdrachtnemer',
    ],
    entry: 'Oplevering areaal na R5.3',
    exit: 'Gereedmelding VISI — start overdrachtsverklaring',
    docs: [
      'Opleverdossier',
      'Intern schouwrapport',
      'Verslag schouw',
      'Eindafrekening',
      'Brief eindafrekening',
      'Nota besluitvorming',
      'Kennisgeving tijdelijke schorsing groslijst',
    ],
    gates: [
      'Opleverdossier akkoord Beheerder en Databeheerder?',
      'Technische installaties in project?',
      'Binnen krediet en aanneemsom?',
      'Restpunten gereed?',
    ],
    krediet: true,
    kredietBeslisser: 'AO of Concerndirecteur (afhankelijk van drempel)',
    weeks: 26,
    bron: 'Overzichtsplaat R5.4 (20-7-2026); koppelingen BO11.6 liggingsgegevens, BO13.5 IV-schap + NEN1010 deel 6, BO1 jaarplanning',
  },
  {
    code: 'R6.1',
    stage: 'R6',
    name: 'Projectdecharge',
    lead: 'Projectleider',
    roles: [
      'Projectleider',
      'Projectondersteuner',
      'Financiën',
      'AO',
      'Beheerder',
      'Vestigingsmanager',
      'RIP-team',
    ],
    entry: 'Gereedmelding VISI in R5.4',
    exit: 'Dechargedossier geaccordeerd door AO — einde proces',
    docs: [
      'A. Financieel overzicht voor decharge',
      'B. Overdrachtsverklaring',
      'C. Eindevaluatie RIP projectenproces',
      'Dechargedossier',
    ],
    gates: ['Overdrachtsverklaring akkoord Beheerder en VM?', 'Dechargedossier akkoord AO?'],
    krediet: false,
    weeks: 6,
    bron: 'Overzichtsplaat R6.1 — Projectdecharge (14-7-2026); afsluiting zaakmap DMS, rechten Relatics, financiële eindstand in raamkrediet Infra',
  },
];

export const RIP_PHASES: RipPhase[] = CONTENT.map((c) => ({
  ...c,
  processDefinitionKey: RIP_PHASE_KEYS.find((k) => k.code === c.code)?.processDefinitionKey,
}));

export const ripPhaseByCode = (code: string): RipPhase | undefined =>
  RIP_PHASES.find((p) => p.code === code);

export type RipDeployStatus = 'gedeployed' | 'ontwerp' | 'onbekend';

export const RIP_DEPLOY_META: Record<
  RipDeployStatus,
  { label: string; short: string; color: string; can: boolean; note: string }
> = {
  gedeployed: {
    label: 'Gedeployed',
    short: 'LIVE',
    color: '#3fa535',
    can: true,
    note: 'Procesmodel gedeployed op deze Operaton-omgeving.',
  },
  ontwerp: {
    label: 'In ontwerp',
    short: 'ONTWERP',
    color: '#b85c00',
    can: false,
    note: 'Overzichtsplaat bekend, procesmodel nog niet gemodelleerd of nog niet gedeployed op deze omgeving.',
  },
  onbekend: {
    label: 'Niet gemodelleerd',
    short: 'N.V.T.',
    color: '#9aa1ab',
    can: false,
    note: 'Nog geen overzichtsplaat beschikbaar.',
  },
};

export function getPhaseDeployStatus(
  phase: RipPhase,
  deployedKeys: ReadonlySet<string>
): RipDeployStatus {
  if (phase.processDefinitionKey && deployedKeys.has(phase.processDefinitionKey)) {
    return 'gedeployed';
  }
  if (phase.beyond) return 'onbekend';
  return 'ontwerp';
}
