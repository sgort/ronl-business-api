# CSS files — what each stylesheet is for

The repository tracks 24 `.css` files across the Keycloak theme, the shared
token files and four frontend packages. Nearly all of them scope every selector under a single
root class per surface (`.cwd-v2`, `.pbd`, `.wood`, `.pac`, `.lcp`, …), so a
stylesheet cannot leak into another app or dashboard. Tailwind is used for
utility classes; these files hold the hand-written, surface-specific styling.

To refresh the list: `git ls-files '*.css'`.

**Improvement plan:** [#374](https://github.com/sgort/ronl-business-api/issues/374)
records what is weak in the current approach and a stepwise plan to fix it.
The summary is under [State and planned improvements](#state-and-planned-improvements)
below; the issue's checklist tracks progress.

---

## Keycloak login theme

| File                                                               | Lines | Function                                                                                                                                                                                |
| ------------------------------------------------------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keycloak-themes/ronl/login/resources/css/login.css`               |   441 | Custom Keycloak login theme, styled to match the MijnOmgeving landing page. Loaded by the theme's `theme.properties`. Mounted into the local Keycloak by the root `docker-compose.yml`. |
| `deployment/vm/keycloak/themes/ronl/login/resources/css/login.css` |   441 | Byte-identical copy in the VM deployment tree. The ACC Keycloak compose file mounts `/opt/keycloak/themes` from the VM host; this is the copy meant for that directory.                 |

**Keep the two copies in sync.** An edit to one has to be made to the other.

Do not add an `@import` of the default Keycloak CSS to either file:
`theme.properties` already loads the base styles, and an `@import` would load
PatternFly again _after_ the custom styles and override them.

## `packages/shared` — design tokens

| File                          | Lines | Root class | Function                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ----: | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles/tokens.css`           |    91 | `:root`    | The shared design tokens (`--rba-*`): Flevoland's fixed brand colours, the themed brand (chained to the tenant's `--color-primary`/`-dark`/`--color-secondary`), the accent and warning fills with the text on them (`--rba-accent-fill`, `--rba-on-accent-fill`, `--rba-warn-fill`), the neutrals (with `--rba-ink-inverse` for text on a coloured fill) and the status colours. Ends with `:root[data-tenant="flevoland"]`, which points them at Flevoland IT's semantic tokens for the Flevoland tenant. The palette's only home for hex values. |
| `styles/flevoland/tokens.css` |   352 | `:root`    | Flevoland IT's design tokens (`--flevoland-*`), copied verbatim from their `flevoland-base.css` v0.2.0 (12-10-2026): the file header and section 1. `styles/tokens.css` imports it, so both hosts load it. Do not edit by hand; diff a new delivery against it.                                                                                                                                                                                                                                                                                     |
| `styles/flevoland/base.css`   |   636 | global     | The rest of that delivery, verbatim: `@font-face` for Fira Sans, element base styles (`:where()`), the NL Design System Button mapping, reduced-motion and forced-colours rules. **Not loaded**: step 2 of #374 switches apps over to it one at a time.                                                                                                                                                                                                                                                                                             |

The caseworker app imports it in `App.tsx`; `@ronl/pa-cockpit`'s `styles.css`
`@import`s it, which is how `pa-demo` gets it. Each surface's own variables
(`--v2-*`, `--pac-*`, `--pb-*`, `--w-*`, the landing pages' `--blue`,
`--text`, …) point at a token rather than repeating the value.
`packages/frontend/src/css-tokens.test.ts` fails when a stylesheet uses a
`var(--rba-*)` the file does not define, or when a host stops loading it.

**Flevoland's colours (#374, step 1).** `services/tenant.ts` marks the active tenant with `data-tenant` on `<html>` (switched off by `TENANT_MARKER_ENABLED` until the last PR of step 1; pa-demo's shim mirrors it). For `flevoland`, the block at the end of `tokens.css` gives navy text, Material greys, the `#f8f8f8` page, dark blue `#003a8e`, Flevoland's status colours, brown warning text and markers, and yellow fills with dark text. Pink stays for accent text and lines. `css-tokens.test.ts` keeps the block on Flevoland's semantic tokens; `css-colour.test.ts` checks its contrast.

**Other tenants must not change when colours move into tokens.** `npm run check:css-equivalence` compares each changed stylesheet with the same file on `acc` (`--base <ref>` for another), resolving every `var()` and `color-mix()` as each tenant other than Flevoland sees it, and fails when a colour moves by more than ΔE2000 1.0 (not visible) or anything else in a declaration changes. Script: `scripts/css-colour/check-equivalence.mjs`; its tests are in `packages/frontend/src/css-colour.test.ts`.

Not every surface variable points at a token yet. Where a surface uses a
different value, it keeps its own until a design decision unifies them,
because unifying changes how the page looks:

| Surface       | Variable                     | Value                           | Shared token                                                             |
| ------------- | ---------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| PA-Cockpit    | `--pac-green`, `--pac-amber` | `#2f8f4e`, `#b88407`            | `--rba-ok` `#3fa535`, `--rba-warn` `#e5b700`                             |
| Landing pages | `--ink`, `--muted`, `--line` | `#0f172a`, `#5b6472`, `#e3e8ef` | `--rba-ink` `#1f2937`, `--rba-ink-3` `#6b7280`, `--rba-rule-2` `#e5e7eb` |
| Login portal  | `--amber`                    | `#d98800`                       | `--rba-warn` `#e5b700`                                                   |

Hex values written directly into rules are not replaced in bulk. Swapping a
fixed `#0046ad` for the themed `--rba-brand` would recolour the page for every
other tenant, so each one needs a decision: replace them when already editing
that section.

## `packages/frontend` — caseworker and board app

| File                                            | Lines | Root class        | Function                                                                                                                                                                          |
| ----------------------------------------------- | ----: | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.css`                                 |    25 | `:root`           | App-shell entry: the Tailwind directives and the default brand custom properties (`--color-primary`, …) that tenant theming overrides at runtime.                                 |
| `src/pages/caseworker-v2/dashboard-v2.css`      |  1063 | `.cwd-v2`         | Caseworker Dashboard V2. Its chrome and tokens are reused by the Infra-board and WOO dashboards, whose root element carries both classes.                                         |
| `src/pages/caseworker-v2/regelsimulatie.css`    |   151 | `.cwd-v2`         | Regelsimulatie (rule simulation) view, ported from the handoff's `sim.css`. Adds no new colours — it reuses the existing tokens.                                                  |
| `src/pages/infra-board/dashboard-infra.css`     |  1065 | `.pbd`            | Project/Infra-board sections: Mijn dag, Portfolio and Project. Builds on the `.cwd-v2` chrome.                                                                                    |
| `src/pages/woo/dashboard-woo.css`               |   289 | `.wood`           | WOO dashboard sections, also on the `.cwd-v2` chrome.                                                                                                                             |
| `src/pages/login-choice/login-portal.css`       |   551 | `.lcp`            | The unauthenticated landing page at `/`: the Provincie Flevoland board catalogue.                                                                                                 |
| `src/components/LoginChoice/single-board.css`   |   366 | `.lcp-single`     | Landing page for a tenant with a single board (`/?tenant=<id>`). Tenant colour comes only from the theme variables set on `:root`.                                                |
| `src/components/LoginChoice/access-denied.css`  |    96 | `.lcp-denied`     | The no-access dialog on the landing pages (`AccessDeniedDialog`).                                                                                                                 |
| `src/components/process/process-view.css`       |   158 | `.pbd`            | Phase stepper and BPMN swimlane, shared by the Infra-board and the caseworker process view. Moved verbatim from `dashboard-infra.css`; a caseworker container opts in with `pbd`. |
| `src/components/process/caseworker-process.css` |   106 | `.cwd-v2`, `.pbd` | Caseworker process view: "Waar sta ik", process steps per role, and the swimlane overlay in the Taken inbox.                                                                      |
| `src/components/process/process-disclosure.css` |     9 | `.cwd-v2`         | The folded "Procesgegevens" disclosure (`ProcessVarsDisclosure`) on every dashboard's task panel.                                                                                 |
| `src/components/signing/signing-panel.css`      |    42 | `.pb-sign-panel`  | The ValidSign signing panel embedded in task views. Owned by the component, not a dashboard, because the Infra-board and the caseworker inbox both show it.                       |

## `packages/pa-cockpit` — shared PA-Cockpit package

| File                                            | Lines | Root class | Function                                                                                                                                                         |
| ----------------------------------------------- | ----: | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles.css`                                |    10 | —          | The package's stylesheet entry; hosts import `@ronl/pa-cockpit/styles.css`. It imports the cockpit sheets and deliberately leaves out the app-shell `index.css`. |
| `src/pages/public-affairs-v2/dashboard-pa.css`  |  2046 | `.pac`     | PA-Cockpit Flevoland, the largest stylesheet in the repository.                                                                                                  |
| `src/pages/public-affairs-v2/dossierbeheer.css` |   237 | `.pac`     | The Dossierbeheer authoring surface at `/pa/dossiers`; its classes are `.pac-db-*`. Extends `dashboard-pa.css` and reuses its `--pac-*` tokens.                  |

## `packages/pa-demo` — public PA demo

| File                               | Lines | Root class          | Function                                                                                                                                                                            |
| ---------------------------------- | ----: | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.css`                    |    41 | `:root`             | The demo's own copy of the app shell (Tailwind entry, resets, brand custom properties) that it renders the cockpit inside.                                                          |
| `src/demo/demo-overrides.css`      |   133 | `.pac`              | Overrides of the cockpit's chrome that hold for this public deployment only; the shared package keeps those controls for the authenticated app.                                     |
| `src/demo/changelog/changelog.css` |   126 | `.pac-dchangelog-*` | The demo changelog panel. Plain CSS rather than Tailwind: a host without a matching `content` glob silently loses Tailwind classes, and this package has no build step to catch it. |

## `packages/public-site` — Open Regels

| File                 | Lines | Root class | Function                                                                                                                               |
| -------------------- | ----: | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/styles/pub.css` |  1150 | `:root`    | The whole public search site: Rijkshuisstijl / NL Design System tokens. Fira Sans stands in for RO Sans, which is not redistributable. |

---

## Formatting

The repository's Prettier scope is `ts`, `tsx`, `json` and `md` — CSS is not
in it. Several files (`dashboard-pa.css`, `caseworker-process.css`) use a
one-rule-per-line style on purpose. Never run `prettier --write` on a `.css`
file.

## Linting (report-only)

Stylelint checks every tracked `.css` file against four rules. For now it
**reports only**: every rule is a warning, so the commands below always exit
0, and nothing runs in CI or in the pre-commit hook. Turning rules into errors
and wiring them into CI is a later step of
[#374](https://github.com/sgort/ronl-business-api/issues/374).

| Command                    | Output                                                |
| -------------------------- | ----------------------------------------------------- |
| `npm run lint:css`         | Every warning, line by line.                          |
| `npm run lint:css:summary` | A Markdown table: warnings per rule and per file.     |
| `npm run test:stylelint`   | The tests for the custom rule and the summary script. |

| Rule                       | Checks                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rba/selector-root-class`  | Every selector in a scoped stylesheet starts with that file's root class. Global files are exempt.                                                                                    |
| `color-no-hex`             | No hex colours outside the shared token file. `HEX_ALLOWED` in the config lists it and the files exempt for their own reasons (Keycloak theme, `pub.css`, the `index.css` fallbacks). |
| `no-duplicate-selectors`   | The same selector defined twice in one file.                                                                                                                                          |
| `declaration-no-important` | No `!important`.                                                                                                                                                                      |

The configuration is `stylelint.config.mjs`; its `ROOTS` map sets each scoped
file's root class(es). The custom rule lives in
`scripts/stylelint/selector-root-class.mjs`. When you add a scoped stylesheet,
add it to `ROOTS`.

**Baseline, 12 October 2026:** 889 warnings in 19 of 20 files — 800 hex
colours, 75 selectors outside their root class, 8 `!important` and 6
duplicate selectors. Of the 75 selectors:

- 53 style overlays by a prefixed class rather than under the root: the
  command palettes (`.cwd-v2-palette*`, 11; `.pac-palette*`, 11) and a modal
  in `dashboard-pa.css` (`.pac-zcm-*`, 31);
- 17 are `.pb-tweaks` rules in `dashboard-infra.css` that no component uses;
- 5 are in the demo's `demo-overrides.css`: four deliberate page-level rules
  (`html`, `body`, `#root`) and one `.pac-db-*` rule outside `.pac`.

**After the shared tokens (#374 item 3):** 843 warnings in 19 of 21 files.
Moving the surface variables onto the tokens took the hex count from 800 to
754; the other three rules are unchanged.

**After step 3a:** 458 warnings in 17 of 21 files, 369 of them hex. The
exemptions (A–C) and the replacements (F, G) below took the hex count from
754 to 369.

### The remaining hex values

The 754 `color-no-hex` warnings, measured 12 October 2026 after item 3. Zero
is not the goal. The plan: exempt what cannot or should not use the tokens,
replace what maps to a token with no visual change, settle the brand
literals with Flevoland, and stop the count from growing. The long tail gets
replaced when someone is already editing that section.

|     | Category                                              | Count | Approach                                                                                                                                                                                                                |
| --- | ----------------------------------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | The two Keycloak `login.css` copies                   |    98 | **Done (3a):** exempt. Keycloak serves them outside the build, so they cannot load the token file.                                                                                                                      |
| B   | `public-site`'s `pub.css`                             |    85 | **Done (3a):** exempt; it is a separate brand (Rijkshuisstijl). Giving it its own `:root` token block remains an option.                                                                                                |
| C   | `--color-*` defaults in the two `index.css` files     |    10 | **Done (3a):** exempt. These are the tenant-theme fallbacks, not palette colours.                                                                                                                                       |
| D   | Surface variables with a different value              |    18 | Wait for the design decision in the table under [`packages/shared`](#packagesshared--design-tokens), then point them at tokens.                                                                                         |
| E   | Flevoland blue, dark blue or pink written into a rule |    24 | Decide per place. The fixed token changes nothing; the themed `--rba-brand` recolours the page for other tenants. In the dashboards, whose chrome is already themed, a hard-coded blue is probably a missed spot.       |
| F   | `#fff` / `#ffffff` in a rule                          |   129 | **Done (3a):** `--rba-ink-inverse` on `color` (text on the brand colour or a status fill), `--rba-paper` everywhere else. No visual change.                                                                             |
| G   | An exact match of a shared token                      |    63 | **Done (3a):** replaced with the `--rba-*` token itself, not the surface variable: a surface variable can be overridden locally (the Infra-board sets `--v2-accent` inline), a token only on `:root`. No visual change. |
| H   | Hex with transparency (`#0046ad18`)                   |    26 | The same decision as E, then `color-mix(in srgb, var(--rba-…) 9%, transparent)`.                                                                                                                                        |
| I   | Other tints and one-offs                              |   301 | 146 distinct values; 30 of them are used three or more times (158 uses) and could become a small tint scale (`--rba-brand-50`, `--rba-ok-50`, …). The other ~140 stay until their section is edited.                    |

Proposed order, one PR each:

1. **Exemptions plus G and F.** Done: changes nothing visually and brought
   the count to 369, every one of which now means something.
2. **E and H**, with a list for Flevoland to choose fixed or themed per place.
3. **A tint scale** for the 30 repeated values. Tints built with `color-mix`
   shift slightly, so this one changes pixels and needs a visual check.
4. **A ratchet in CI**, the "make it an error" step of item 2. A stored
   per-file count that may only go down; files already at zero become hard
   errors. New hex values cannot creep in, without first clearing the long
   tail.

## Default for new work

Write new styling as scoped CSS: one root class per surface, as the V2
dashboards do, and colocate a component's styles with the component (as
`process-view.css` and `signing-panel.css` are). Use existing custom
properties rather than new hex values: a surface variable or a shared
`--rba-*` token. Leave the older Tailwind-styled
components as they are; do not migrate them.

## State and planned improvements

Measured 12 October 2026; tracked in
[#374](https://github.com/sgort/ronl-business-api/issues/374).

**What is weak:**

- **No shared design tokens.** 225 distinct hex colours across the
  stylesheets. Flevoland blue `#0046ad` is written out 51 times in 11 files,
  and every file redefines its own `--ink`, `--text`, `--muted` and `--line`.
  _Since item 3: the shared token file exists and the surface variables
  point at it; since 3a, rules use it for white and exact matches too. 369
  hex values remain (see [The remaining hex values](#the-remaining-hex-values))._
- **Rules enforced only by comments.** The scoping rule, "no new colours",
  "no prettier" and "no `@import` in `login.css`" exist only as comments.
  _Since item 2: stylelint reports the first two, but does not enforce them
  yet._
- **Copies that drift.** The two Keycloak `login.css` files; the
  `pa-demo` copy of the app shell; and the cockpit's copy of every `v2-*`
  rule, which `pa-cockpit-class-coverage.test.ts` exists to guard.
- **Very large files.** `dashboard-pa.css` (2,046 lines),
  `dashboard-infra.css` and `dashboard-v2.css` (over 1,000 each).
- **Two styling approaches.** 33 older frontend components use Tailwind
  utilities; the V2 surfaces use scoped CSS.

**Plan**, in order of value for effort, one PR per step:

1. Guard the Keycloak copies: deploy from one source, or check in CI that
   they are identical.
2. Add stylelint, report-only at first: selectors start with the root class,
   no hex outside a token file, no duplicate selectors, no `!important`.
3. One shared token file (for example in `@ronl/shared`) for the Flevoland
   palette, the neutral greys and the status colours. `public-site` keeps its
   own Rijkshuisstijl tokens.
4. Export a shared stylesheet for the `v2-*` chrome that both hosts import,
   removing the cockpit's copied rules.
5. Split the large stylesheets section by section, only when already editing
   that section.
6. Scoped CSS on shared tokens as the default for new work (see above).

**Out of scope:** CSS Modules, CSS-in-JS or a Tailwind rewrite. Scoping by
root class already gives the isolation these would buy, at a fraction of the
migration cost.
