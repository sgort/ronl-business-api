/**
 * Stands in for src/vendor/pages/changelog-data.ts.
 *
 * The real file is the project's actual commit history rendered as UI copy
 * — ~5000 lines of engineering diary spanning 93 releases, including commit
 * messages that quote real backend hostnames and auth-library names
 * verbatim. That is appropriate for an authenticated internal tool; shipped
 * verbatim in a public unauthenticated demo it would both leak internal
 * infrastructure detail and trip scripts/check-bundle.mjs's forbidden-string
 * check, since the whole file is bundled as soon as ChangelogPanel.tsx
 * imports it — a runtime redaction would leave the real strings sitting in
 * the compiled module regardless of what's rendered.
 *
 * This file is therefore a curated executive summary, not the engineering
 * changelog: it covers only the 25 CalVer releases (2026.07.0 and
 * 2026.08.0–2026.08.23), grouped into 8 themed entries, each distilled to
 * what shipped and why it matters for a prospective province — not a
 * re-listing of every commit. The 68 pre-CalVer semantic-version releases
 * are out of scope by design, not merely omitted for space.
 *
 * Constraint for whoever edits this next: content here still ends up in the
 * public bundle, so it must stay clear of scripts/check-bundle.mjs's
 * FORBIDDEN list — no auth-library names (keycloak-js, msal, @azure/msal,
 * oidc-client), no telemetry (react-ga, google-analytics, gtag(), and no
 * backend origin (api.open-regels.nl / acc.api.open-regels.nl). Describe
 * what a gate or fix does ("fails the build if auth or telemetry code
 * ships") rather than naming the library it forbids. The bare word
 * "keycloak" is fine on its own — it's the suffixed/prefixed forms above
 * that trip the gate — but there's no need for it here either.
 *
 * changelog-data.ts collides with a real vendored file at that path (like
 * modes.config), so this is redirected via the same Vite-alias technique
 * documented in vite.config.ts: only the bundler is redirected here, tsc
 * still resolves ChangelogPanel.tsx's import to the real vendored file,
 * which is sound because this re-exports the same types and a same-shaped
 * `changelog` value.
 */
export type {
  ChangelogEntry,
  ChangelogVersion,
  ChangelogVersionV2,
  ChangelogSection,
  ChangelogCommit,
  ChangelogItem,
  CommitType,
  FeedbackItem,
  ScopeTag,
  ScopeValue,
  Changelog,
} from '../vendor/pages/changelog-data';
import type { Changelog } from '../vendor/pages/changelog-data';

export const changelog: Changelog = {
  versions: [
    {
      version: '2026.08.23',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '22 aug 2026',
      scope: ['frontend', 'backend'],
      sections: [
        {
          icon: '🛡️',
          iconColor: '#2563eb',
          title: 'Live werken: robuuster en op elkaar afgestemd',
          items: [
            'De limiet op API-verzoeken is verhoogd naar wat een normale werksessie daadwerkelijk verbruikt — voorheen kon gewoon doorklikken al een foutieve "kon dossiers niet laden"-melding opleveren.',
            'Een dossier verwijderen ruimt nu ook de bijbehorende signalen en zoekcriteria op, in plaats van ze als wees achter te laten.',
            'Een nieuw dossier verschijnt voortaan direct op het overzicht zodra het is aangemaakt, in plaats van pas zichtbaar te worden na een herlaadactie.',
            'Het aanmaken van een dossier en het toevoegen van een zoekcriterium in live werken wordt nu end-to-end automatisch getest, inclusief dat beide een herlaadactie overleven.',
            'De demo-omgeving draait voortaan op dezelfde onderliggende code als de live omgeving, zodat wat u hier ziet ook is wat productie doet.',
          ],
        },
      ],
    },
    {
      version: '2026.08.22',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '21 aug 2026',
      scope: ['frontend', 'backend'],
      sections: [
        {
          icon: '🔀',
          iconColor: '#2563eb',
          title: 'Eén schakelaar tussen proefdraaien en live, grotere Europese signaalvangst',
          items: [
            'Proefdraaien en live werken waren twee losse instellingen die uit de pas konden lopen; het is nu één schakelaar voor de hele cockpit.',
            'Voorbeelddata verschijnt niet langer stiekem in een live omgeving — een lege live cockpit is nu een eerlijke, verwachte uitkomst in plaats van een storing.',
            'Moties van hetzelfde Europees Parlement-fractieoverleg worden gebundeld tot één signaal in plaats van te dupliceren.',
            'De ruwe EU-feed is nu doorzoekbaar vanuit de cockpit en persberichten van het Europees Parlement worden meegenomen.',
            'Een mapping-fout die zonder waarschuwing de helft van de plenaire feed liet wegvallen, is gevonden en gerepareerd.',
          ],
        },
      ],
    },
    {
      version: '2026.08.19–2026.08.21',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '18–21 aug 2026',
      scope: ['frontend', 'backend', 'public-site'],
      sections: [
        {
          icon: '✅',
          iconColor: '#2563eb',
          title: 'Kwaliteit onder de motorkap',
          items: [
            'Testdekking op de backend fors verhoogd (van 73,5% naar 91,5% van alle codepaden, met 1480 geautomatiseerde tests) en verplichte configuratie wordt nu ook echt gecontroleerd bij opstarten.',
            'De statuspagina van de dienst laat voortaan zien in welke omgeving (ontwikkel, acceptatie, productie) hij daadwerkelijk draait.',
            'De brondocumenten (DMN-beslistabellen) achter een regel zijn nu rechtstreeks te downloaden vanuit de publieke regelcatalogus.',
            'Een onjuiste bewering in de toegankelijkheidsverklaring over focus-indicatoren op formuliervelden is gecorrigeerd.',
          ],
        },
      ],
    },
    {
      version: '2026.08.15–2026.08.18',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '12–14 aug 2026',
      scope: ['frontend', 'public-site'],
      sections: [
        {
          icon: '🔍',
          iconColor: '#2563eb',
          title: "Nieuw: Herkomst-verkenner en Regelsimulatie 'Subsidie thuisbatterij'",
          items: [
            'De Herkomst-pagina laat per begrip in acht stappen zien hoe de vraag die een burger op het scherm ziet, terugvoert tot de letterlijke wettekst waarop die is gebaseerd.',
            'De nieuwe Regelsimulatie speelt een beleidsregel — de aanschafsubsidie voor een thuisbatterij — dag voor dag af over een heel scenario, en toont wie er wel en niet mee wordt bereikt.',
            'De Herkomst-pagina is voorzien van een deelbare social-media-kaart en wordt vooraf gerenderd voor een snelle eerste weergave.',
          ],
        },
      ],
    },
    {
      version: '2026.08.4–2026.08.14',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '10–12 aug 2026',
      scope: ['frontend', 'backend'],
      sections: [
        {
          icon: '🪜',
          iconColor: '#2563eb',
          title: 'Portefeuillebeheer op de echte RIP-fasenladder',
          items: [
            "Het voorlopige model met zes globale fases is vervangen door de echte twaalf-fasen RIP-ladder, overal: Portfolio (Gantt en Kanban), Mijn dag en de fasedetailpagina's.",
            'Aantallen per fase — gereed om te starten, in behandeling, geparkeerd, afgerond — komen nu live uit het achterliggende proces-systeem in plaats van uit voorbeelddata.',
            'De Beheer-omgeving toont nu ook per fase of het onderliggende proces daadwerkelijk is uitgerold in het proces-systeem, en geeft een begrijpelijke melding in plaats van een technische foutmelding wanneer dat nog niet zo is.',
            'De navigatiebalk toont per werkmodus actuele cijfers: taken van vandaag, projecten die met spoed dreigen te verlopen, en een groen/geel/rood gezondheidsoverzicht per fase.',
            'Een apart overzicht voor geparkeerde projecten is toegevoegd.',
          ],
        },
      ],
    },
    {
      version: '2026.08.1–2026.08.3',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '7 aug 2026',
      scope: ['backend', 'public-site'],
      sections: [
        {
          icon: '🧹',
          iconColor: '#2563eb',
          title: 'Publieke Regelcatalogus: laatste puntjes op de i',
          items: [
            "Pagina's laden merkbaar sneller doordat ze starten vanuit vooraf gerenderde data in plaats van een lege pagina die pas na een API-aanroep vult.",
            "Organisatielogo's op de Regelcatalogus laden nu correct, en de voettekst toont voortaan de eigen omgeving en het actuele releasenummer.",
          ],
        },
      ],
    },
    {
      version: '2026.08.0',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '6 aug 2026',
      scope: ['backend', 'public-site'],
      sections: [
        {
          icon: '🚀',
          iconColor: '#2563eb',
          title: 'De publieke Regelcatalogus gaat live',
          items: [
            'Nieuw, zelfstandig onderdeel van het platform: een openbare, niet-ingelogde website waarop iedereen de regelcatalogus kan doorzoeken — organisaties, diensten, regels en begrippen — met resultaten die naar een specifieke regel of begrip doorlinken.',
            'Vanaf de eerste regel gebouwd zonder enige inlogafhankelijkheid: er is geen sessie, geen token en geen gebruikersaccount om te kunnen misbruiken.',
            'Een geautomatiseerde controle test voortaan elke build van de publieke site en breekt de build meteen af zodra er authenticatiecode of trackingcode in de gebundelde bestanden terechtkomt — een garantie die niet van menselijke oplettendheid hoeft af te hangen.',
            "Vooraf gerenderde pagina's, een sitemap en toegankelijkheids- en open-datapagina's, plus een testreeks (zoektocht, diepe links, toetsenbordbediening, geautomatiseerde toegankelijkheidscontroles) die bij elke wijziging opnieuw draait.",
          ],
        },
      ],
    },
    {
      version: '2026.07.0',
      status: 'Released',
      statusColor: 'green',
      borderColor: 'green',
      date: '23 jul 2026',
      scope: ['frontend'],
      sections: [
        {
          icon: '🔒',
          iconColor: '#2563eb',
          title: 'Scheiding tussen organisaties onafhankelijk geverifieerd',
          items: [
            'Een end-to-end test bevestigt dat een taak die voor de ene organisatie is aangemaakt, voor een behandelaar van een andere organisatie daadwerkelijk onzichtbaar is — geen aanname, maar een geverifieerde grens.',
            'Een volledig geautomatiseerd testtraject volgt een aanvraag nu van indiening tot afhandeling tegen een echte procesmotor, inclusief opruiming achteraf.',
            'Een omissie waarbij een geldige ingelogde sessie soms toch naar de startpagina werd teruggestuurd bij een directe link, is gevonden en verholpen.',
          ],
        },
      ],
    },
  ],
};
