/**
 * Test cases for the Heusdenpas start form (heusdenpas-aanvraag), to fill it
 * in one go. They are the cases linked-data-explorer verified against
 * HeusdenpasAanvraagProcess on the local engine (LDE PR #271), limited to the
 * ones that differ in what the citizen enters; the rest differ only in what the
 * caseworker decides later.
 *
 * Only start-form fields: the ages (aanvragerIs181920 and the like) are worked
 * out from the dates of birth by SVB_LeeftijdsInformatie. The declaration
 * "naar waarheid ingevuld" is left for the person to tick.
 */
export interface HeusdenpasTestCase {
  id: string;
  /** What the case is and what the rules decide, for the dropdown. */
  label: string;
  values: Record<string, unknown>;
}

const BASE: Record<string, unknown> = {
  aanvragerNaam: 'Test Aanvrager',
  geboortedatumAanvrager: '1975-05-15',
  geboortedatumPartner: '1978-03-22',
  dagVanAanvraag: '2026-10-06',
  aanvragerAlleenstaand: false,
  aanvragerHeeftKinderen: true,
  aanvragerHeeftKind4Tm17: true,
  aanvragerInwonerHeusden: true,
  maandelijksBrutoInkomenAanvrager: 1500,
  aanvragerUitkeringBaanbrekers: false,
  aanvragerVoedselbankpasDenBosch: false,
  aanvragerKwijtscheldingGemeentelijkeBelastingen: false,
  aanvragerSchuldhulptrajectKredietbankNederland: false,
  aanvragerDitKalenderjaarAlAangevraagd: false,
  aanvragerAanmerkingStudieFinanciering: false,
};

// A single applicant has no partner, so no partner's date of birth.
const { geboortedatumPartner: _partner, ...SINGLE } = BASE;

export const HEUSDENPAS_TEST_CASES: HeusdenpasTestCase[] = [
  {
    id: 'samenwonend-kinderen',
    label: 'Samenwonend met kinderen, laag inkomen: pas en Kindpakket toegekend',
    values: BASE,
  },
  {
    id: 'eerste-helft-2026',
    label: 'Aanvraag in de eerste helft van 2026: toegekend op de norm van toen',
    values: { ...BASE, dagVanAanvraag: '2026-02-13' },
  },
  {
    id: 'te-hoog-inkomen',
    label: 'Inkomen € 2.500, te hoog inkomen: afgewezen',
    values: { ...BASE, maandelijksBrutoInkomenAanvrager: 2500 },
  },
  {
    id: 'al-aangevraagd',
    label: 'Dit jaar al aangevraagd: pas afgewezen, Kindpakket toegekend',
    values: { ...BASE, aanvragerDitKalenderjaarAlAangevraagd: true },
  },
  {
    id: 'geen-inwoner',
    label: 'Woont niet in Heusden: afgewezen',
    values: { ...BASE, aanvragerInwonerHeusden: false },
  },
  {
    id: 'baanbrekers',
    label: 'Alleenstaand met uitkering van Baanbrekers: pas automatisch toegekend',
    values: {
      ...SINGLE,
      aanvragerAlleenstaand: true,
      aanvragerHeeftKinderen: false,
      aanvragerHeeftKind4Tm17: false,
      maandelijksBrutoInkomenAanvrager: 3000,
      aanvragerUitkeringBaanbrekers: true,
    },
  },
  {
    id: 'geen-norm-2027',
    label: 'Aanvraag in 2027, nog geen bijstandsnorm: de behandelaar beslist',
    values: { ...BASE, dagVanAanvraag: '2027-01-15' },
  },
];
