/**
 * The demo's changelog, and its own type.
 *
 * Not the engineering changelog. packages/frontend's changelog-data.ts is the
 * project's real commit history rendered as UI copy — thousands of lines of
 * diary, quoting internal hostnames and library names verbatim. Appropriate
 * for an authenticated internal tool; on a public unauthenticated demo it
 * would both leak infrastructure detail and trip scripts/check-bundle.mjs,
 * since the whole module is bundled the moment a panel imports it.
 *
 * So this is a curated executive summary — but curated by scope, not just by
 * theme: it covers only commits that touched the cockpit itself (the paths
 * Tasks 3-7 of the de-vendoring plan moved into @ronl/pa-cockpit), cross-
 * referenced against packages/frontend/src/pages/changelog-data.ts's 25 CalVer
 * releases (2026.07.0 and 2026.08.0-2026.08.23). Of those 25, only three —
 * 2026.08.23, 2026.08.22 and 2026.07.0 — contain any cockpit-path commit at
 * all; the rest is public-site, RIP/Faseladder or Herkomst work that has
 * nothing to do with this product, so it is out of scope by construction
 * rather than trimmed for space. The 68 pre-CalVer releases stay out of scope
 * too, as they do in the product's own curated file.
 *
 * Within each in-scope release, commits with no user-visible effect (tests,
 * chores, CI, backend-only plumbing outside the cockpit paths, and fixture-
 * only tuning of mock/demo data) were dropped rather than translated — a
 * changelog padded with plumbing reads as padding to the reader it is for.
 *
 * Constraint for whoever edits this next: this copy ships in the public
 * bundle, so keep it clear of check-bundle.mjs's FORBIDDEN list — describe
 * what a gate or fix does rather than naming the library it forbids.
 */
export interface DemoRelease {
  /** CalVer, or a range where several small releases are summarised together. */
  version: string;
  /** Human date or range, as displayed. */
  date: string;
  icon: string;
  title: string;
  items: string[];
}

export const DEMO_CHANGELOG: DemoRelease[] = [
  {
    version: '2026.08.23',
    date: '22 aug 2026',
    icon: '🛡️',
    title: 'Proefdraaien is nu een volwaardige demo, en dossierbeheer is robuuster',
    items: [
      'Een dossier verwijderen ruimt nu ook de bijbehorende signalen en zoekcriteria op, in plaats van ze als wees achter te laten.',
      'Een nieuw dossier verschijnt voortaan direct op het overzicht zodra het is aangemaakt, in plaats van pas na een herlaadactie zichtbaar te worden.',
      'Proefdraaien is nu een volledig werkende demo: een signaal bevestigen of negeren, of een zoekcriterium opslaan, blijft behouden na een herlaadactie in plaats van te verdwijnen.',
      'De teller van bevestigde signalen op de bronnenbalk blijft nu overal actueel, in plaats van te bevriezen op het moment dat de pagina werd geopend.',
    ],
  },
  {
    version: '2026.08.22',
    date: '21 aug 2026',
    icon: '🔀',
    title: 'Eén schakelaar tussen proefdraaien en live, en actuele tellingen op elk scherm',
    items: [
      'Proefdraaien en live werken waren twee losse instellingen die uit de pas konden lopen; het is nu één schakelaar voor de hele cockpit.',
      'De teller per signaalbron op het Monitoring-scherm blijft nu overal actueel, ook zonder die bron zelf te openen, en herstelt zichzelf betrouwbaar bij het opstarten.',
      'Een label bij agenda-items dat bij een lange tekst over de andere gegevens heen viel, is gerepareerd.',
      'Persberichten van het Europees Parlement worden nu ook meegenomen als signaal, met de betrokken commissie er automatisch bij.',
    ],
  },
  {
    version: '2026.07.0',
    date: '23 jul 2026',
    icon: '✏️',
    title: 'Foutmelding bij het bewerken van een dossier blijft zichtbaar',
    items: [
      'Een mislukte opslag tijdens het bewerken van een dossier toont voortaan een duidelijke foutmelding in het bewerkscherm zelf, in plaats van onopgemerkt te verdwijnen.',
    ],
  },
];
