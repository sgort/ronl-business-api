# Design: Public mock-only PA Cockpit at plato.open-regels.nl

## Problem

The PA Cockpit is the most heavily tested surface in the product — 258 frontend
tests, 533 backend tests in `src/pa-monitoring`, and the only board with its own
end-to-end suite — but it can only be seen by someone holding a Keycloak token
with the `public-affairs` realm role and a `province` org-type. Showing it to a
prospective province currently means a screen-share driven by someone with an
account.

`packages/public-site` established the pattern for putting product surfaces on an
unauthenticated public site (`publiek.open-regels.nl` / `acc.publiek.open-regels.nl`).
This design applies the same idea to the PA Cockpit: a **mock-only** instance at
`plato.open-regels.nl`, with no option to switch to Live, aimed at a sales /
showcase audience.

The hard part is not the demo behaviour. `09d2ac5` (21 Aug) already made mock mode
"a working demo, not a read-only snapshot": `mock-demo.store.ts` seeds from the
fixtures, applies the _same_ mutation actions live uses, persists to localStorage
under `paV2.mock.demo`, and version-stamps the payload so a new build discards it.
The hard part is packaging and severing auth without forking the product into
something that silently ages.

Every claim below was verified against file content, not inferred. Line references
are to `acc` at `00605d8`.

## Corrected since this design was written

The build (16 tasks, branch `feat/public-pa-cockpit`) surfaced four places
where this document no longer matches what shipped. Each is corrected in
place below, at the section where it was originally stated; this list exists
so the reversal is visible rather than silently rewritten into the history.

1. **How mock mode is forced** (originally in
   [The four guarantees that there is no Live](#the-four-guarantees-that-there-is-no-live)).
   The claim that `isPaMock()` is forced `true` "ignoring `localStorage`
   entirely" is not achievable without editing a vendored file: `isPaMock()`
   is called by `pa.api.ts`'s own internal branches, and an aliased export
   never reaches them. What actually ships is a build-time default plus a
   boot-time write — corrected wording below.
2. **The changelog does not ship as-is.** Originally recorded as "Shipped
   as-is — the development history is part of the pitch." The real
   changelog trips the build-time bundle gate: six strings in it would put
   backend hostnames and internal engineering detail on a public page. It
   was replaced with a curated executive summary of the 25 CalVer releases,
   distilled into 8 themed entries — corrected in
   [Decisions](#decisions) and [Package shape](#package-shape), where
   `changelog-data.filtered.ts` was added to the demo-owned tree.
3. **Dossiers are session-scoped, not persisted.** The
   [Data flow and state](#data-flow-and-state) section implied both mock
   stores persist across a reload. `mock-demo.store.ts` does; `dossierbeheer.api.ts`
   has no `localStorage` at all — a module-level store, so an authored
   dossier survives in-app navigation but not a reload. The human partner
   accepted this and ruled that dossier persistence should be built in the
   original Dashboard and reach plato through the vendored copy, not
   implemented demo-side.
4. **There is no demo bar.** Originally the role selector, reset and
   disclaimer lived in a persistent demo bar rendered above the cockpit
   chrome. It was removed: the role selector existed in three places and
   reset in two. Role switching now lives only on Beheer → Rollen &
   rechten; reset only in Dossierbeheer's Mock banner. Corrected in
   [Decisions](#decisions) and
   [The demo user and the role switcher](#the-demo-user-and-the-role-switcher).

## What this is not

- Not part of, and shares no code with, `@ronl/public-site`. Separate package,
  separate SWA, separate domain.
- Not a backend consumer. plato issues **no network requests at all** — no App
  Service, no CORS entry, no Keycloak client, no database.
- Not the `@ronl/pa-cockpit` extraction. That is the next piece of work; this
  design deliberately defers it and says why.

## Decisions

| Decision          | Choice                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Purpose           | Showcase / sales demo                                                                       |
| Hosting           | Own SWA: `plato.open-regels.nl` (`main`), `acc.plato.open-regels.nl` (`acc`)                |
| Architecture now  | Standalone `packages/pa-demo` with a vendored copy of the cockpit                           |
| Architecture next | Extract `@ronl/pa-cockpit`; repoint `frontend` **and** `pa-demo`; delete the vendored copy  |
| Beheer            | Curated: 9 sections. No IOU, no Gereedschap, no assistant dock                              |
| Rollen & rechten  | New PA-native page built on `DB_ROLES` / `DB_CAPS`                                          |
| Profiel           | Demo-owned rebuild, not a vendored caseworker component                                     |
| Role switching    | Visitor-selectable, from Beheer → Rollen & rechten (**corrected** — no demo bar; see below) |
| Changelog         | Curated executive summary, 8 themed entries (**corrected** — not shipped as-is; see below)  |
| Drift window      | Weeks; a reporting (non-blocking) drift check                                               |

## Why fork first, extract second

Extracting `@ronl/pa-cockpit` means committing to an interface: what the cockpit
needs from its host for auth, tenant, theme and section routing. That interface is
currently a guess, because nothing outside `packages/frontend` has ever consumed
the cockpit. Building a real second consumer first makes the boundary empirical
rather than imagined. It also leaves the shipping cockpit untouched during the
week the 342-commit `acc → main` promotion lands.

The known failure mode is that temporary forks become permanent. Two properties
keep the deletion cheap:

1. **The copy is byte-identical.** Nothing inside `src/vendor/` is ever edited.
   Its external imports resolve through Vite and `tsconfig` path aliases to demo
   shims, so drift is measurable by plain `diff` and step 4 is a directory
   deletion rather than a merge.
2. **Every demo-specific decision lives in code that survives.** The shims, the
   demo router, the roles page, the role context, the SWA config and the whole
   test suite are what `pa-demo` still needs _after_ the extraction. Only
   `src/vendor/` dies.

## Architecture

### Package shape

`packages/pa-demo` — Vite + React, deployed to its own Static Web App.

```
packages/pa-demo/src/
  vendor/                       # byte-identical copies from packages/frontend
    services/pa.api.ts
    services/dossierbeheer.api.ts
    services/mock-demo.store.ts
    pages/PADashboardV2.tsx
    pages/ChangelogPanel.tsx + changelog-data.ts
    pages/public-affairs-v2/*
    components/PADashboardV2/*  # except PASectionRouter.tsx
  demo/                         # demo-owned; survives the extraction
    shims/keycloak.ts
    shims/tenant.ts
    shims/SessionExpiryWarning.tsx
    shims/PADock.tsx
    DemoRoleContext.tsx
    DemoSectionRouter.tsx
    Profiel.tsx
    RollenRechten.tsx
    sections.allow.ts
    modes.filtered.ts
    changelog-data.filtered.ts
  main.tsx, App.tsx
```

**Corrected** — `DemoBar.tsx` does not exist; see
[Corrected since this design was written](#corrected-since-this-design-was-written),
item 4.

Dependencies: `react`, `react-dom`, `react-router-dom`, `axios` (imported by
`pa.api.ts`, though no request is ever issued), and the real `@ronl/shared`
workspace package — already a published boundary, so it is depended on rather
than vendored.

### Vendoring rules

Vendored files are never edited. `PADashboardV2.tsx` keeps its
`import keycloak, { getUser } from '../services/keycloak'` untouched and receives
the synthetic user because the alias points elsewhere. Aliases required:

| Import in vendored code                       | Resolves to                               |
| --------------------------------------------- | ----------------------------------------- |
| `../services/keycloak`                        | `demo/shims/keycloak.ts`                  |
| `../services/tenant`                          | `demo/shims/tenant.ts`                    |
| `../components/SessionExpiryWarning`          | `demo/shims/SessionExpiryWarning.tsx`     |
| `../components/PADashboardV2/PASectionRouter` | `demo/DemoSectionRouter.tsx`              |
| `../components/PADashboardV2/PADock`          | `demo/shims/PADock.tsx` (renders nothing) |
| `../public-affairs-v2/modes.config`           | `demo/modes.filtered.ts`                  |

`PASectionRouter.tsx` is deliberately **not** vendored. It is the sole carrier of
all six `../CaseworkerDashboard/*` imports (`ProfielSection`, `RollenSection`,
`IouGebruiksscenarioSection`, `IouFeedbackSection`, `IouZakenSection`,
`GereedschapSection`), and deciding which sections exist is precisely what differs
here. `DemoSectionRouter` replaces it, so those components never enter the build.
`PADock` is likewise not vendored — it imports `McpChatSection`, which pulls in
`businessApi` and would fire real LLM calls from a public page.

### Curation is an allow-list, applied at the modes module

The existing gate machinery cannot do this curation. `isPaItemVisible(item, ctx)`
filters on `authRequired`, `requiredRoles` and `requiredOrgTypes`; every rail item
is `authRequired: true` and the IOU and Gereedschap items carry no `requiredRoles`,
so a synthetic authenticated user would surface **everything**.

The allow-list must be applied at the **data source**, not at each render site.
`PACommandPalette` takes no sections prop — it calls `allStaticSections()` from
`modes.config` directly and resolves each hit with `findPaModeForSection`. Filtering
only inside `DemoSectionRouter` would leave ⌘K able to jump straight to
`iou-feedback` or `gereedschap-overzicht`, bypassing the curated rail entirely.

So `demo/modes.filtered.ts` imports the vendored `modes.config`, applies
`sections.allow.ts`, and re-exports the same names (`PA_MODES`,
`allStaticSections`, `findPaModeForSection`). The alias points every vendored
consumer at it, so the rail, the palette and any future consumer see one filtered
truth and cannot disagree. Deny-by-default: a section added to the real cockpit's
Beheer later cannot appear on a public site unless someone adds its id to the list.

## The demo user and the role switcher

### The synthetic user

One object in `demo/shims/keycloak.ts` satisfying `KeycloakUser`:

- `municipality: 'flevoland'` — drives `initializeTenantTheme()` and the
  `ronl.` / `PA-COCKPIT` chrome
- `organisation_type: 'province'` — required; the cockpit gates on it
- `roles: ['public-affairs', <selected pa-role>]`

Without both `public-affairs` and `province`, the visitor lands on
`PANoAccessPanel`.

### The mechanism: rewrite the token, not the components

`Dossierbeheer.tsx:62` reads:

```ts
const role = deriveDossierRole(user?.roles ?? []);
```

The role is derived from what the token says, not passed as a prop. So switching
role means rewriting the synthetic user's `roles` array: choose _Redacteur_ and
`roles` becomes `['public-affairs', 'pa-editor']`, and `deriveDossierRole` resolves
to `DB_ROLES[1]` unaided. Every downstream consequence follows with no vendored
edit — the caps chips, `DossierEditor`'s "Publiceren vereist rol Redacteur of
hoger", the disabled actions. The demo switches roles the way reality does.

Four positions are offered, not three: `Auteur`, `Redacteur`, `Beheerder`, and the
existing `ROLE_GEEN` read-only pseudo-role. Showing a prospect what someone
_without_ rights sees is part of the governance story.

### Where the switcher lives

**Corrected** — see
[Corrected since this design was written](#corrected-since-this-design-was-written),
item 4. This section originally described a persistent demo bar; it does not
exist. What shipped instead:

Not in Dossierbeheer's own role bar. Those buttons are `disabled` with
`title="De rol volgt uit je Keycloak-rechten"` and a comment reading _"reflects the
token-derived role (not a permission switcher)"_ — correct for the product, and
enabling them would mean editing a vendored file.

The role selector lives on the demo-owned **Beheer → Rollen & rechten** page
instead — the same page that documents `DB_ROLES` / `DB_CAPS` for a visitor,
so the switcher sits next to the explanation of what it does. It was
originally planned for a persistent demo bar rendered above the cockpit
chrome on every page, alongside `Demo herstellen` and a disclaimer, but the
role selector ended up existing in three places and reset in two once built;
both were consolidated to a single source instead. Reset now lives only in
Dossierbeheer's own Mock banner, not on Rollen & rechten.

Dossierbeheer's role bar remains a **live readout** — still disabled, but
re-rendering as the role changes. That is still a better demo beat than a
second switcher: change the role on Rollen & rechten, watch the product's own
permissions display follow, from wherever the cockpit's own navigation takes
a visitor to Beheer.

## Beheer — the nine sections

| Section                                    | Source                                  |
| ------------------------------------------ | --------------------------------------- |
| Dossierbeheer, Nieuw dossier               | vendored; full CRUD via the mock stores |
| Afwegingskader, Curatiepijplijn            | vendored; static explainers             |
| Signaalbronnen, Zoekcriteria, Notificaties | vendored; fixture-backed, mutable       |
| Profiel                                    | **demo-owned**                          |
| Rollen & rechten                           | **demo-owned**, PA-native               |

Dropped entirely: the IOU group (Gebruiksscenario indienen, Feedback geven,
Actieve zaken, Archief) and Hulpmiddelen (Gereedschap), plus the assistant dock.

`RollenSection` is not reused: its `ROLE_DESCRIPTIONS` covers `caseworker`,
`hr-medewerker` and seven `rip-*` roles and mentions no `pa-*` role at all, so on a
PA demo it would describe RIP project roles and leave the PA roles undescribed. The
demo-owned page is built on `DB_ROLES` / `DB_CAPS` — the actual PA governance model
— and is where the role selector is explained.

`ProfielSection` is likewise rebuilt rather than vendored. It is a caseworker
component, so it would not become part of `@ronl/pa-cockpit` in the extraction and
`pa-demo` would need its own version regardless; building it now means writing it
once. Its layout is mirrored: a token block (Naam, Gebruikersnaam, Medewerker-ID,
Gemeente, Beveiligingsniveau, Rollen) and a static block standing in for the HR
fetch (Voornaam, Achternaam, Afdeling, Functie, Toegangsniveau).

## Data flow and state

**Corrected** — see
[Corrected since this design was written](#corrected-since-this-design-was-written),
item 3. The diagram below originally implied both stores persist the same
way; they do not.

```
fixtures (MOCK_DOSSIERS, PA_TAXONOMY, MOCK_AGENDA)
   └─ seeded on first read ─→ mock-demo.store    (localStorage 'paV2.mock.demo', persists)
                              dossierbeheer.api   (module-level store, in memory only)
                                    └─→ PaDataProvider ─→ cockpit components
```

Writes go through the same action functions live uses, but the two stores do
not persist the same way. `mock-demo.store.ts` does write to `localStorage`
under `paV2.mock.demo` — signals, saved zoekcriteria and seen notifications
survive a reload. `dossierbeheer.api.ts` has **no** `localStorage` call at
all: it is a plain module-level store, so an authored dossier appears
immediately and survives in-app navigation, but not a page reload. The human
partner accepted this rather than treating it as a defect, and ruled that
dossier persistence should be built in the original Dashboard and reach
plato through the vendored copy when that lands — not implemented
demo-side, which would mean either editing a vendored file or building a
second, parallel persistence mechanism for one fork.

Version stamping carries real weight for the store that does persist:
`mock-demo.store.ts` discards persisted state whose `v` does not match
`__APP_VERSION__`, injected by Vite from package.json — so a pa-demo release
with changed fixtures automatically resets every visitor rather than leaving
them on a stale copy. pa-demo's version number is therefore functional, not
bookkeeping.

Dossierbeheer's own vendored "↺ Reset demodata" button
(`Dossierbeheer.tsx:150-151`) calls both `resetMockDemoData()` and
`resetMockDossiers()` — the same pairing this design originally assigned to
a `Demo herstellen` button in the now-removed demo bar (see
[The demo user and the role switcher](#the-demo-user-and-the-role-switcher)).
Where localStorage is unavailable (private browsing) `mock-demo.store`'s
existing `try/catch` degrades to in-memory: the demo works but does not
survive a reload. That is acceptable and is not engineered around.

With no backend there are no 4xx, 5xx, timeouts or auth expiries. The loading and
error states inside vendored components still exist and simply never fire; they are
not stripped, because stripping them would mean editing `vendor/`.

## The four guarantees that there is no Live

Independent layers, each sufficient alone. **Corrected** — layer 1's
mechanism below was originally described as "`isPaMock()` forced `true`,
ignoring `localStorage` entirely"; that is not achievable without editing a
vendored file, because `isPaMock()` is called by `pa.api.ts`'s own internal
branches, which an aliased export never reaches. See
[Corrected since this design was written](#corrected-since-this-design-was-written),
item 1.

1. **Build-time default plus a boot-time write** — both legacy mock env vars
   are `true`, so an absent key means mock, and `main.tsx` writes `'1'` to
   `paV2.mock` before mounting so an inherited or stale key cannot win. That
   stops a stale key flipping it; it is not an absolute lock against someone
   with devtools open. Layers 3 and 4 below are what make that acceptable.
2. **No toggle in the UI** — `Dossierbeheer`'s `toggleMock` button (line 424) is
   absent from the demo build. `resetDemo` (line 433) stays.
3. **CSP `connect-src 'self'`** in `public/staticwebapp.config.json`. Where
   `public-site` lists the API origins because it genuinely calls them, plato lists
   none — the browser refuses any request that escapes layers 1 and 2, and it
   surfaces in the console instead of silently succeeding.
4. **A build-time bundle gate** rejecting `keycloak-js`, `msal`, `oidc-client`,
   telemetry, **and the backend origins** `api.open-regels.nl` /
   `acc.api.open-regels.nl`. Stronger than the CSP: it proves the URL is not in the
   bundle to be requested.

`VITE_API_URL` is absent from plato's env files entirely rather than set-but-unused.

**`VITE_PA_AGENDA_MOCK=true` is load-bearing.** `fetchAgenda` sits outside the
unified switch — it checks its own build-time `AGENDA_MOCK` and otherwise calls
`paGet('/pa/agenda')`, because the agenda comes from TK OData rather than the
database. Unset, Monitoring → Agenda reaches for a backend that does not exist.

### The bundle gate cannot be copied verbatim

`public-site/scripts/check-bundle.mjs` fails on any `.js` containing the string
`'keycloak'`. plato ships that string legitimately: `DB_ROLES` carries
`keycloak: 'pa-author' | 'pa-editor' | 'pa-admin'`, and `Dossierbeheer.tsx:400`
renders `· Keycloak: {role.keycloak}` as visible UI. A verbatim copy would go red
on correct code. plato's list targets the library and the origins instead of the
word.

## Deployment

Copied from `public-site`: two SWAs, two path-filtered workflows.

| Workflow                 | Branch | Target                             |
| ------------------------ | ------ | ---------------------------------- |
| `azure-pa-demo-acc.yml`  | `acc`  | `https://acc.plato.open-regels.nl` |
| `azure-pa-demo-prod.yml` | `main` | `https://plato.open-regels.nl`     |

Both gated on lint → type-check → tests before building, matching
`azure-publicsite-*`. Two new SWA API-token secrets, two DNS records in the
`open-regels.nl` zone, and `.env.acceptance` / `.env.production` carrying
`VITE_SITE_URL` for the footer and `VITE_PA_AGENDA_MOCK=true`.

## Testing

plato becomes the **fourth** tested package. Current measured state (v2026.08.23,
`acc` @ `57ce4c2`): backend 74 files / 1576 tests, frontend 133 / 1155,
public-site 28 / 134 — **235 files · 2865 tests** plus one perf spec.

### Conventions inherited

Colocated `foo.tsx` → `foo.test.tsx` with no `__tests__` directories; `node` Vitest
environment by default with `// @vitest-environment jsdom` opted into per file;
`vi.hoisted` for mocks referenced inside a `vi.mock` factory; `__helpers__` only
once a second file needs to share something; wall-clock assertions isolated as
`*.perf.test.ts`. Mocking at the network boundary with `msw` mostly does not apply,
since plato has no network boundary.

### Red/green is the discipline, not a preference

`writing-tests.md` states it directly: _"a new assertion is not trustworthy until
you have seen it go red for the right reason."_ That lesson came from
`expectMockNamesRealExports`, which compared a mocked path against itself and would
have passed regardless — caught only by injecting a bogus export name and noticing
the assertion failed to fail.

This matters more here than usual because nearly all of plato's guarantees are
**negative** assertions (no backend origin, no auth library, localStorage cannot
flip the mock), and negative assertions are exactly the kind that pass vacuously.
Every plan step therefore names the failure it must produce first — for the CSP
test, temporarily adding `https://api.open-regels.nl` to `connect-src` and watching
it go red for that reason before removing it.

### The suites

1. **Unit** on demo-owned code: switching to Redacteur flips the caps chips and
   unlocks Publiceren; the allow-list renders nine Beheer items and no IOU or
   Gereedschap ids; **`allStaticSections()` returns no dropped id**, so ⌘K cannot
   route around the rail; the shims satisfy their interfaces.
2. **CSP test** — `public-site`'s `staticwebapp-csp.test.ts` harness with the
   assertion inverted: `connect-src` contains no backend origin.
3. **Mock-lock test** — `isPaMock()` returns `true` with `paV2.mock` set to `'0'`.
4. **Bundle gate test** — the plato-specific forbidden list, including the origins.
5. **E2E (Playwright)** adapted from `pa-mock-journey.spec.ts`, which already
   covers curation moving the rail badges across a reload, an ignored signal
   staying ignored, Reset demodata restoring the fixture baseline, and the reset
   control appearing in mock mode only. plato adds the role-switcher journey: land
   → Auteur → Publiceren locked → Beheerder → unlocked → create a dossier → reload
   → still there → reset → gone. That journey is also the sales demo script.

Like `public-site`, Playwright starts its own `webServer`; unlike it, plato needs
no backend and no database, so the suite is fully self-contained. `E2E_BASE_URL`
retargets it at the deployed site for post-deploy verification.

Two Playwright traps from the guide apply directly: `locator.count()` and
`locator.isVisible()` do not auto-wait (a cleanup guarded on `count()` once
silently deleted nothing and left ten dossiers behind), and cleanup should warn
rather than swallow.

### Coverage excludes `src/vendor/**`

Vendored files are already covered by the frontend suite's 1155 tests. Counting
them again would inflate plato's figures with work done elsewhere and — worse —
make the fork look well-tested while the demo-owned code hid behind it. Coverage is
measured on `src/demo/**` only.

### Cross-repo docs deliverable

The testing pages live in `iou-architectuur` (on `acc` @ `02e8059`), not in this
repo. The work includes a new `docs/en/ronl-business-api/developer/testing/pa-demo.md`,
rows in `overview.md`'s at-a-glance / where-to-look / running-the-tests tables, an
updated total, and a `coverage.md` section. Figures come from a real run
(`--reporter=json --outputFile=…`); the guide explicitly forbids estimating or
grepping for `it(`.

## Drift check

The obvious placement does not work. A check inside the pa-demo workflow is
path-filtered to `packages/pa-demo/**`, but drift is caused by edits to
`packages/frontend/**`, which never trigger it — the check would be green forever
and catch nothing.

So it gets its own workflow triggered on `packages/frontend/**`, diffing
`src/vendor/` against its origin paths and writing a GitHub annotation naming the
files that moved. It **reports without blocking**: failing the build would turn an
unrelated cockpit PR red because a demo copy is stale, which trains people to
ignore it. The extraction is what resolves the drift; the annotation only has to
keep it visible.

## Sequencing

1. **This work.** `packages/pa-demo` with `src/vendor/`, shipped to
   `acc.plato.open-regels.nl` and `plato.open-regels.nl`.
2. **Extract `@ronl/pa-cockpit`** from `packages/frontend`, with the interface
   informed by what `pa-demo` actually needed.
3. **Repoint `pa-demo`** at the extracted package.
4. **Delete `src/vendor/`** and the drift workflow. Everything under `src/demo/`
   survives untouched.

## Risks

- **The fork outlives its welcome.** Mitigated by byte-identical vendoring, the
  drift annotation, and a `src/vendor/README.md` naming the extraction as its exit
  condition — but ultimately mitigated only by doing step 2.
- **A vendored path that is not mock-guarded.** `isPaMock()` guards 25 branches and
  `fetchAgenda` has its own flag; layers 3 and 4 catch anything missed, loudly.
- **Prospects reading fixture data as real.** Consequence of correction 4
  (no demo bar): the "fictieve gegevens" disclaimer this risk originally
  pointed at the demo bar for now appears on exactly one page,
  `Profiel.tsx:48`, and nowhere in Vandaag, Monitoring or Voortgang.
  Dossierbeheer's Mock banner describes mock _data sourcing_, not
  fictional data — a different claim. The fixtures are recognisably
  Flevoland examples (stikstof, lelystad, energie, jeugdzorg, oostvaarders)
  rather than plausible live material, which narrows but does not close the
  gap. The human partner has explicitly deferred finding another way to
  surface the disclaimer until after the first deploy; candidates include a
  `<title>`, a footer line, a first-visit dismissible notice, or a slim
  disclaimer-only strip.
