# Caribisch Nederland (BES) tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Caribisch Nederland as a single-board tenant at `/bes`, with two new optional tenant fields — `copy` (landing copy overrides) and `citizen` (a resident section with its own DigiD login) — leaving every existing tenant unchanged.

**Architecture:** Configuration-driven, like Heusden: a `bes` entry in `public/tenants.json` plus assets, two optional fields on `TenantConfig`, a copy merge and one new `CitizenEntry` component in the single-board landing, CSS ported from the mock, and two test users in the Keycloak realm.

**Tech Stack:** React + TypeScript (Vite), Vitest + Testing Library, Playwright (e2e), Keycloak realm JSON.

**Spec:** `bes-handoff/CLAUDE-CODE-PROMPT.md` with `bes-handoff/README.md` and `bes-handoff/design/` (screenshots 01–09). The handoff folder is scratch input and is **never committed**; port from it.

## Global Constraints

- Tenant id `bes`, `organisationType: "municipality"`, `boards: ["caseworker"]`, no `municipalityCode`; entry placed after `heusden` in `tenants.json`.
- Theme exactly: primary `#012a87`, primaryDark `#011c5c`, primaryLight `#3a64c8`, secondary `#dc171d`, accent `#f9d90f`, background `#f6f3ea`.
- Logo `{ "src": "/tenants/bes/logo.png", "shape": "wide", "height": 52 }`.
- All Dutch copy (`share`, `copy`, `citizen`) verbatim from §2 of the prompt.
- Tenants without `copy`/`citizen` render exactly as today; no desktop visual change for Amsterdam, Toeslagen, Univé, Heusden, Flevoland.
- No HTML strings from JSON: greetings, titles and bodies render as text nodes.
- Contact: no invented details. `TenantContact` fields are all empty strings.
- The stack is a demonstration sandbox; the prompt's open points are settled as designed.
- Ask before every commit (user rule). Never `--no-verify`.
- **Changelog (§6 of the prompt):** entries are generated per commit by `/bump-release` (`format: 'commits'`). Do not hand-write a release entry; the feature commits' subjects carry the text ("new tenant Caribisch Nederland (Bonaire, Sint Eustatius en Saba) at /bes, with its own social card and, as a first, a citizen entry on a single-board landing page").

## Review Focus

1. A `copy.preview` override without `nav2` (BES has none) must keep the base `nav2` ("Actieve zaken") — test in Task 2.
2. A tenant with `citizen` but without `greetings` or `islands` must still render the section, minus those parts — test in Task 2.
3. A greeting text containing markup (`<b>x</b>`) shows literally, never as HTML — test in Task 2.
4. `/BES` (any case) redirects to `/bes`, and `/bes/` resolves as single — test in Task 1.
5. Empty contact strings render nothing: there is no contact rendering in the frontend today (`tenant.contact` has no reader). Keep it that way; the `TODO(bes-contact)` note goes on `TenantContact` — checked in Task 1.

---

### Task 1: BES tenant config, types and assets

**Files:**

- Copy: `bes-handoff/public/og-image-bes-prod.png`, `og-image-bes-acc.png` → `packages/frontend/public/`; `bes-handoff/public/tenants/bes/logo.png` and `flags/{bonaire,sint-eustatius,saba}.svg` → `packages/frontend/public/tenants/bes/`
- Modify: `packages/frontend/public/tenants.json` (add `bes` after `heusden`)
- Modify: `packages/frontend/src/services/tenant.ts:20-62` (`TenantContact` TODO note, `TenantConfig.copy`, `TenantConfig.citizen`, new `TenantCitizenEntry`)
- Test: `packages/frontend/src/indexHtml.test.ts:125`, `src/pages/login-choice/tenants-landing.test.ts`, `src/services/tenant.test.ts`, `vite-plugin-tenant-pages.test.ts`

**Interfaces:**

- Produces (in `services/tenant.ts`):
  - `export interface TenantCitizenEntry { eyebrow: string; greetings?: { lang: string; text: string }[]; title: string; lede: string; islands?: { name: string; flag: string }[]; services: { icon: 'doc' | 'pin' | 'clock'; title: string; body: string }[]; cta: string; note: string }`
  - `TenantConfig.copy?: Partial<Omit<SingleBoardCopy, 'preview'>> & { preview?: Partial<SingleBoardCopy['preview']> }` — `SingleBoardCopy` via `import type` from `../pages/login-choice/single-board.copy` (type-only, no runtime cycle).
  - `TenantConfig.citizen?: TenantCitizenEntry`

- [ ] **Step 1: Write the failing tests**
  - `indexHtml.test.ts`: add `'bes'` to the `tenantCards` id list (asserts both PNGs exist at 1200×630).
  - `tenants-landing.test.ts`: new `it('bes citizen island flags exist under public/')` — for each `tenants.bes.citizen.islands[].flag`, `existsSync(resolve(PUBLIC, flag.slice(1)))` is true; the existing wide-logo/share/single-board assertions must pass for `bes` unchanged.
  - `tenant.test.ts`: `applyTenantTheme(bes)` sets `--color-background` to `#f6f3ea`; `resolveLandingTenant('/bes', '').kind === 'single'`; `resolveLandingTenant('/bes/', '').kind === 'single'`; `resolveLandingTenant('/BES', '')` equals the redirect shape used for `/Amsterdam`, targeting `/bes`.
  - `vite-plugin-tenant-pages.test.ts`: `dist/bes/index.html` has `og:image` ending `og-image-bes-acc.png` on ACC and `og-image-bes-prod.png` on production, `og:url` `${SITE}/bes`, and the `[ACC] ` title prefix on ACC (follow the existing per-tenant cases).
- [ ] **Step 2: Run them and see them fail**
      Run: `npx vitest run src/indexHtml.test.ts src/pages/login-choice/tenants-landing.test.ts src/services/tenant.test.ts vite-plugin-tenant-pages.test.ts` (in `packages/frontend`)
      Expected: FAIL — missing `bes` assets and tenant entry.
- [ ] **Step 3: Copy the assets, add the `bes` entry, extend the types**
      `tenants.json` `bes`: the prompt's §2 JSON verbatim, `contact` = `{ "phone": "", "email": "", "address": "", "postalCode": "", "city": "" }`, `leftPanelSections` copied from `heusden` as-is. In `tenant.ts`, put `// TODO(bes-contact): no confirmed contact details for BES; each island has its own openbaar lichaam.` above `TenantContact`.
- [ ] **Step 4: Run the tests, then typecheck**
      Run the Step 2 command → PASS; `npm run typecheck --workspace=@ronl/frontend` (or the repo's `tsc --noEmit`) → no errors.
- [ ] **Step 5: Stage and ask before committing**
      Proposed: `feat(frontend): add tenant Caribisch Nederland (Bonaire, Sint Eustatius en Saba) at /bes, with its own social card`

### Task 2: Copy override and citizen section on the single-board landing

**Files:**

- Create: `packages/frontend/src/components/LoginChoice/CitizenEntry.tsx`
- Modify: `packages/frontend/src/components/LoginChoice/SingleBoardLanding.tsx:132-135` (copy merge) and between the `hero` and `points` sections (~line 214)
- Modify: `packages/frontend/src/components/LoginChoice/single-board.css`
- Test: `packages/frontend/src/components/LoginChoice/SingleBoardLanding.test.tsx`

**Interfaces:**

- Consumes: `TenantConfig.copy`, `TenantConfig.citizen`, `TenantCitizenEntry` (Task 1); `useLandingLogin().startIdpLogin(idp, hint)` (existing).
- Produces: `export default function CitizenEntry({ tenantId, citizen }: { tenantId: string; citizen: TenantCitizenEntry })`.

- [ ] **Step 1: Write the failing tests** (`SingleBoardLanding.test.tsx`, with a BES fixture built from the prompt's JSON and the existing Amsterdam fixture; add a Heusden-like fixture without `copy`/`citizen`)
  - `it('a copy override wins over the organisation-type copy')`: BES shows `Eén werkvoorraad voor drie eilanden.` and `BON-2026-0412`; the Heusden-like fixture shows `Uw werkvoorraad, overzichtelijk op één plek.`
  - `it('a preview override without nav2 keeps the base nav2')`: BES shows `Actieve zaken`.
  - `it('renders the citizen section only when tenant.citizen is set')`: BES has `getByRole('region', { name: 'Regel uw zaken met het openbaar lichaam online.' })`; Amsterdam and the Heusden-like fixture have no such region.
  - `it('the citizen button starts a DigiD login with the tenant test-citizen hint')`: click `Inloggen met DigiD` inside the region → `sessionStorage.getItem('username_hint') === 'test-citizen-bes'` (same mechanics as the existing top-bar DigiD test).
  - `it('greetings carry their lang attribute')`: `getByText('Bon bini')` has `lang="pap"`, `getByText('Welcome')` has `lang="en"`.
  - `it('renders without greetings or islands')`: a citizen fixture lacking both still renders title, services and button.
  - `it('shows greeting markup as text')`: a greeting `'<b>x</b>'` is found by `getByText('<b>x</b>')`.
- [ ] **Step 2: Run them and see them fail**
      Run: `npx vitest run src/components/LoginChoice/SingleBoardLanding.test.tsx`
      Expected: FAIL — copy not merged, no citizen region.
- [ ] **Step 3: Merge the copy** — `const base = SINGLE_BOARD_COPY[...]` (today's lookup); `const copy = { ...base, ...tenant.copy, preview: { ...base.preview, ...tenant.copy?.preview } }`.
- [ ] **Step 4: Implement `CitizenEntry`** — `<section className="citizen" aria-labelledby={id}>` with eyebrow (plus greetings as `<span lang>` text, separated as in screenshot 03), `<h2 id>` title, lede, island chips (`<ul className="isle-list">`, `<img alt="">` + name), services `<ul className="svc">` with the `doc`/`pin`/`clock` inline SVGs from the mock's `ICONS` in `bes-handoff/reference/Portaal Landingpage Caseworker.html`, button `.btn-citizen` calling `startIdpLogin('digid', \`test-citizen-${tenantId}\`)`, note `.c-note`. Render it in `SingleBoardLanding`between`hero`and`points`when`tenant.citizen` is set.
- [ ] **Step 5: Port the CSS** — from the mock lines 63–79 and the `@media (max-width: 920px)` `.citizen` rule (line 112): `.citizen`, `.isle-list`, `.svc`, `.btn-citizen`, `.c-note`, all scoped under `.lcp-single`; map the mock's `--line`, `--ink`, `--muted`, `--tint` to the variables `single-board.css` already uses. Add `.lcp-single .topbar .tlogo { max-height: 36px; }` inside the existing `max-width: 560px` query.
- [ ] **Step 6: Run the tests, typecheck and lint**
      Run the Step 2 command → PASS; the whole frontend unit suite (`npx vitest run` in `packages/frontend`) → PASS; typecheck and `eslint` clean.
- [ ] **Step 7: Stage and ask before committing**
      Proposed: `feat(frontend): a citizen entry and per-tenant copy on the single-board landing, first used by Caribisch Nederland`

### Task 3: BES test users and BSN mapping

**Files:**

- Modify: `config/keycloak/ronl-realm.json` (add `test-caseworker-bes`, `test-citizen-bes`)
- Modify: `packages/frontend/src/services/bsn.mapping.ts:10`
- Test: `packages/frontend/src/services/bsn.mapping.test.ts`

**Interfaces:**

- Produces: Keycloak users whose token carries `municipality: "bes"` → RBA `user.tenantId === 'bes'`.

- [ ] **Step 1: Write the failing test** — `bsn.mapping.test.ts`: the mapping for `'test-citizen-bes'` is `'999992235'`.
- [ ] **Step 2: Run it and see it fail** — `npx vitest run src/services/bsn.mapping.test.ts` → FAIL.
- [ ] **Step 3: Add the mapping and the users** — `'test-citizen-bes': '999992235', // For now, same test data`. Realm: copies of `test-caseworker-heusden` and `test-citizen-heusden` with `municipality: ["bes"]`, `employee_id: ["emp-010"]` and `opaque_id: ["opaque-citizen-010"]` (both verified free), same roles, credentials and other attributes.
- [ ] **Step 4: Run the test** → PASS; `node -e "require('./config/keycloak/ronl-realm.json')"` parses.
- [ ] **Step 5: Stage and ask before committing**
      Proposed: `feat: test users for Caribisch Nederland in the local realm`
- [ ] **Step 6: Hand off** — the user re-imports the realm locally and adds both users to the live ACC realm by hand.

### Task 4: e2e coverage for /bes

**Files:**

- Modify: `packages/frontend/e2e/landing-single-board.spec.ts:12-13` (add `{ id: 'bes', name: 'Caribisch Nederland', primary: '#012a87' }`)

- [ ] **Step 1: Add BES to the parametrised tenants**, and a BES-only test: on `/bes`, clicking `Inloggen met DigiD` inside the citizen section starts the DigiD flow with hint `test-citizen-bes` (mirror the existing top-bar DigiD e2e).
- [ ] **Step 2: Lint the spec** — `npx eslint e2e/landing-single-board.spec.ts`; do not run Playwright here.
- [ ] **Step 3: Hand off the run** — the user runs the e2e suite against the stack they have running (`GET /bes` and `/bes/` 200 with the right `og:image`; `test-caseworker-bes` lands on the Caseworker dashboard in BES colours; the citizen DigiD button starts the flow).
- [ ] **Step 4: Stage and ask before committing**
      Proposed: `test(frontend): cover the /bes landing in the single-board e2e suite`

### After the tasks

- The user's checks: full frontend suite, e2e, `/bes` against screenshots 01–05, other tenants unchanged on desktop (09 for Heusden), LinkedIn Post Inspector on ACC/PROD (06, 07).
- Then push and open a pull request into `acc` — only on the user's go-ahead.
- Afterwards, for the DMN-bulk work: redeploy `IngezeteneBulkProcess` from the LDE with organisation **`bes`** (lowercase), since RBA compares the Operaton tenant with the `municipality` claim exactly.
