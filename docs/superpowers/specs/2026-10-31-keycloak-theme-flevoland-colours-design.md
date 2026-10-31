# Keycloak login theme: Flevoland colours from the token file (#400)

Status: draft for approval, 2026-10-31.
Issue: #400. Related: #374 (step 1 design:
`2026-10-30-flevoland-colours-step1-design.md`), #405 (step 2), #196 (VM
deployment).

## Why

Since step 1 of #374 is switched on, a Flevoland user signs in through our
sign-in screen (`AuthCallback.tsx`, now Flevoland blue `#0046ad` → `#003a8e`)
and then lands on the Keycloak login page, which still uses Tailwind's blues
(`#3b82f6`, `#2563eb`). The header visibly jumps from a darker blue to a
lighter one. The login theme also keeps a third, hand-kept set of hex values
next to the two token files.

## Decision (user, 2026-10-31)

**Option 1 of #400: one look for everyone.** The login page takes Flevoland's
colours for every tenant. Keycloak has one client, `ronl-business-api`, for all
tenants, so it cannot tell a Flevoland user from another before sign-in; a
theme per tenant (option 2) would need a client per tenant. Flevoland is the
default tenant, and the anonymous `/` landing page already shows its palette.
Accepted cost: users of other tenants (Heusden, Amsterdam, Toeslagen) see
Flevoland's colours on the Keycloak page only, between their own tenant's
screens.

## Goals

- The login page's colours come from Flevoland IT's token file, not from hex
  values in `login.css`.
- No blue jump between `AuthCallback.tsx` and the Keycloak page for Flevoland.
- The theme's copy of the tokens cannot fall behind the shared file unnoticed.
- A new hex colour in `login.css` fails CI, like everywhere else since #406.

## Non-goals

- **Step 2 looks** (Fira Sans, button and form-field shapes, radii, the focus
  ring width, flat instead of gradient surfaces). Those follow with #405. This
  change swaps colours only and keeps every shape, size, shadow and gradient
  structure.
- **Automating the copy to the VM** (#196). The theme stays one folder,
  `keycloak-themes/ronl/`, copied by hand.
- **Other tenants' palettes** on the login page (option 2).
- `login.ftl` and `messages_nl.properties` do not change.

## How

### Tokens reach the theme as a committed copy

Keycloak serves the theme's static files itself, outside our build, so the
theme cannot `@import` from `packages/shared`. Instead:

- `keycloak-themes/ronl/login/resources/css/flevoland-tokens.css` is a
  **byte-identical copy** of `packages/shared/styles/flevoland/tokens.css`
  (Flevoland IT's delivery, plain `:root { --flevoland-* }`, no imports). It is
  committed, so the manual copy of `keycloak-themes/ronl` to the VM carries it.
- A root script, `npm run sync:keycloak-tokens`, writes that copy. It is a
  plain file copy, dependency-free, under `scripts/`.
- `theme.properties` loads it first: `styles=css/flevoland-tokens.css
css/login.css`.

Only Flevoland's file is copied, not `packages/shared/styles/tokens.css`. With
one fixed look there is no tenant switch to make, and the `--rba-*` layer
exists to switch between tenants. `login.css` uses Flevoland's **semantic**
tokens (section 1b of their file) directly, never their palette (1a), the same
rule as step 1's Flevoland block. _My call; #400 named both files._

### Colour mapping in `login.css`

Every colour maps to a Flevoland semantic token. Where the old value was a
translucent tint of a colour, the new one is `color-mix(in srgb, <token> N%,
transparent)` with the same percentage.

| Where                                             | Old                                               | New token                                                                                   |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Page background gradient                          | `#e8eef3` → `#f5f7fa`                             | `background-muted` → `background-document`                                                  |
| Header gradient                                   | `#1e40af` → `#3b82f6`                             | `brand-primary` → `brand-primary-active` (as `AuthCallback.tsx`: blue-600 → blue-700)       |
| Header text, button text                          | `white`                                           | `text-on-brand`                                                                             |
| Content card                                      | `white`                                           | `background-surface`                                                                        |
| Instruction text                                  | `#4b5563`                                         | `text-subtle`                                                                               |
| Labels                                            | `#374151`                                         | `text-heading`                                                                              |
| Input border                                      | `#e5e7eb`                                         | `border-default` (`#757575`, 4.6:1; Flevoland's WCAG 1.4.11 fix)                            |
| Input border, hover                               | `#d1d5db`                                         | `border-hover`                                                                              |
| Input background                                  | `#f9fafb`                                         | `background-subtle`                                                                         |
| Input background, focus                           | `white`                                           | `background-surface`                                                                        |
| Input border, focus; focus halo 10%               | `#3b82f6`                                         | `focus-outline`                                                                             |
| `:focus-visible` outline                          | `#3b82f6`                                         | `focus-outline`                                                                             |
| Input in error                                    | `#ef4444` / `#fef2f2`                             | `status-error-border` / `status-error-background`                                           |
| Submit button gradient                            | `#3b82f6` → `#2563eb`                             | `brand-primary-hover` → `brand-primary`                                                     |
| Submit button gradient, hover                     | `#2563eb` → `#1d4ed8`                             | `brand-primary` → `brand-primary-active`                                                    |
| Submit button shadow 20% / 30%                    | `rgba(37,99,235,…)`                               | `brand-primary`                                                                             |
| Divider lines (cancel, registration, providers)   | `#e5e7eb`                                         | `border-subtle`                                                                             |
| Cancel link; registration text; providers heading | `#6b7280`                                         | `text-subtle`                                                                               |
| Cancel link, hover                                | `#374151`                                         | `text-heading`                                                                              |
| Links (forgot password, register)                 | `#3b82f6`                                         | `link-default`                                                                              |
| Links, hover                                      | `#2563eb`                                         | `link-hover`                                                                                |
| Error alert                                       | `#fef2f2` / `#fecaca` / `#991b1b`                 | `status-error-background` / `-border` / `-text-on-background`                               |
| Field error text                                  | `#dc2626`                                         | `status-error-text`                                                                         |
| Success alert                                     | `#f0fdf4` / `#bbf7d0` / `#166534`                 | `status-success-background` / `-border` / `-text`                                           |
| Info alert                                        | `#eff6ff` / `#bfdbfe` / `#1e40af`                 | `status-info-background` / `-border` / `-text`                                              |
| Footer                                            | `#9ca3af`                                         | `text-disabled` (darker: 4.6:1 instead of 2.5:1)                                            |
| Medewerker banner                                 | `#f0f4ff` / `#c7d7fd` / `#3730a3`, icon `#4f46e5` | `brand-primary-subtle` / `brand-primary` 20% / `brand-primary-active`, icon `brand-primary` |

Token names above drop the `--flevoland-color-` prefix.

**Kept as hex: the DigiD, eHerkenning and eIDAS button gradients**
(`#f97316`/`#ea580c`, `#3b82f6`/`#2563eb`, `#4f46e5`/`#3730a3`). They mark
external identity providers, not our brand, like the data colours #406 lists.
They are shown only when the login page lists providers; the app's own flows
pass an `idpHint` and skip that list. _My call._ The neutral `rgba(0,0,0,…)`
card shadows also stay.

### Guards

1. **New test `packages/frontend/src/keycloak-theme.test.ts`:**
   - the theme's `flevoland-tokens.css` is byte-identical to
     `packages/shared/styles/flevoland/tokens.css` (the failure message names
     `npm run sync:keycloak-tokens`);
   - `theme.properties` lists `css/flevoland-tokens.css` before
     `css/login.css`;
   - every `var(--flevoland-*)` in `login.css` is defined in the copy;
   - `login.css` uses only semantic tokens: no `--flevoland-color-<hue>-<n>`
     palette names.
2. **The hex gate covers the theme.** `css-hex.test.ts` adds
   `keycloak-themes/**/*.css` to its globs, `login.css` leaves
   `HEX_ALLOWED` in `stylelint.config.mjs`, and the six provider colours go
   into `DATA_COLOURS` with their reason. `flevoland-tokens.css` is added to
   `HEX_ALLOWED`, like its source.
3. **CI runs these on a theme-only change.** `azure-frontend-acc.yml` adds
   `keycloak-themes/**` to its `paths` filter, so a pull request that touches
   only the theme still runs the frontend suite. (Its deploy and preview jobs
   are unaffected beyond running once more.)

### Docs

`docs/css-files.md`: the Keycloak section lists `flevoland-tokens.css`, says
where it comes from and how to refresh it, and drops "exempt" for `login.css`.
The `login.css` header comment says the same in one line.

## Rollout and check

- Keycloak runs `start-dev`, which does not cache themes: copying
  `keycloak-themes/ronl` to `/opt/keycloak/themes/ronl` on the VM takes effect
  on the next page load, without a restart.
- The user copies the folder to the ACC VM and checks the login page for
  Flevoland (password form and the medewerker variant) and for one other
  tenant, as #400's "Done when" asks. PROD gets the copy after the next
  promotion.

## Left to the builder

- The exact `color-mix` percentages follow the old `rgba` alphas.
- Wording of comments and the test's failure messages.
