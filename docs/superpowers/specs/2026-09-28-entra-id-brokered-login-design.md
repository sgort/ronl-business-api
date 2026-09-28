# Entra ID sign-in, brokered by Keycloak — design

Branch: `feat/entra-id-brokering`
Date: 2026-09-28

## Goal

Employees of Provincie Flevoland sign in to RBA with their own Flevoland M365
account, preferably without typing anything: on a Flevoland-managed Windows
laptop, Entra ID signs them in with the account the device is joined to. Their
RBA access follows the app roles Flevoland IT assigns in Entra.

The first test user is `steven.gort@flevoland.nl`.

## Decisions

| Question                           | Decision                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Who signs in with Entra            | Staff of the organisations themselves, starting with Flevoland                                                                   |
| Where the trust sits               | Keycloak brokers Entra. The backend keeps trusting only Keycloak-issued tokens and does not change                               |
| Where roles come from              | Four coarse roles come from Entra app roles and are mapped on every login; finer roles stay in Keycloak                          |
| Level of assurance                 | Always `substantieel`, justified by Flevoland's conditional-access policy requiring MFA                                          |
| Tenant                             | `municipality = flevoland`, `organisation_type = province`, fixed per identity provider                                          |
| How users reach it                 | A primary button on the landing page (straight to Microsoft), and the provider's button on the Keycloak login page as a fallback |
| Direct Entra tokens to the backend | Out of scope; a separate spec (see [Deferred](#deferred))                                                                        |

## Background

- The backend validates tokens from one issuer, the `ronl` realm, and reads
  `municipality`, `organisation_type`, `loa` and `realm_access.roles`
  (`packages/backend/src/auth/jwt.middleware.ts`). Brokering keeps all four
  claims Keycloak-produced, so none of that code changes.
- `GET /v1/task` passes the caller's realm roles to Operaton as candidate
  groups, so mapped roles must be the exact realm role names.
- A process start requires `loa` of at least `midden`; a token without it is
  refused with `403 INSUFFICIENT_ASSURANCE`. The provider therefore has to set
  the assurance level.
- The frontend already sends an identity-provider hint for the citizen path:
  `AuthCallback.tsx` calls `keycloak.login({ idpHint: selectedIdp })` for any
  `selected_idp` other than `medewerker`.
- The `ronl` login theme renders a button for every enabled identity provider
  (`login.ftl`, the `socialProviders` block), so a new provider appears on the
  Keycloak login page without a theme change.
- ACC and PROD realms are changed through the admin REST API by idempotent
  scripts (`scripts/keycloak-add-rip-roles.sh`,
  `scripts/keycloak-add-token-claim-mappers.sh`), never by re-importing the
  realm, because an import would discard what those environments configured by
  hand.

## The Entra side

Flevoland IT registered the application **IOU-demonstrator**:

| Setting                                 | Value                                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant ID                               | `95f3a7d8-730c-4f35-a909-867d3fbde8fe`                                                                                                                |
| Application (client) ID                 | `ef967eb0-3902-408f-8161-4e294c826473`                                                                                                                |
| Client secret                           | Held outside the repository; entered into Keycloak only                                                                                               |
| App roles, emitted in the `roles` claim | `IOU_ADMIN`, `IOU_USERS`, `IOU_PA`, `IOU_INFRA`                                                                                                       |
| Role assignment                         | Through Entra groups: `flv-role-iou-poc-admin`, `flv-role-iou-poc-user`, `Flv-role-IOU-publicAffairs-contributors`, `Flv-role-IOU-infra-contributors` |
| Conditional access                      | MFA required                                                                                                                                          |

Requested from Flevoland IT, and a prerequisite for the end-to-end test:

1. **Redirect URIs**, platform _Web_:
   - `http://localhost:8080/realms/ronl/broker/entra-flevoland/endpoint`
   - `https://acc.keycloak.open-regels.nl/realms/ronl/broker/entra-flevoland/endpoint`

   and removal of the `https://yourapp.com/auth/callback` placeholder. The PROD
   URI (`https://keycloak.open-regels.nl/...`) follows at promotion.

2. **Optional claims** in the ID token: `email`, `given_name`, `family_name`.
   ValidSign signing needs the email (`MISSING_SIGNER_EMAIL` otherwise) and
   takes the signer's name from the two name claims.
3. **Assignment required = Yes** on the enterprise application, so only members
   of the four groups can sign in at all.
4. **Test user** `steven.gort@flevoland.nl` in all four groups, so each mapping
   can be tested.
5. **The client secret's expiry date**, for rotation planning.

## Design

### 1. The Keycloak identity provider

One OIDC identity provider in realm `ronl`:

| Setting                         | Value                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Alias                           | `entra-flevoland`                                                             |
| Display name                    | `Flevoland (Entra ID)`                                                        |
| Issuer                          | `https://login.microsoftonline.com/95f3a7d8-730c-4f35-a909-867d3fbde8fe/v2.0` |
| Authorization, token, JWKS URLs | From the tenant's `/v2.0/.well-known/openid-configuration`                    |
| Signature validation            | On, via JWKS                                                                  |
| Client authentication           | Client secret                                                                 |
| Scopes                          | `openid profile email`                                                        |
| Sync mode                       | `FORCE` — attributes and mapped roles are re-applied on every login           |
| Trust email                     | On — the address comes from Flevoland's own directory                         |
| First login                     | A linked local user is created without a review-profile step                  |

Keycloak's OIDC broker imports `email`, `given_name` and `family_name` into the
user's profile by default, so the existing client mappers put them in the
token without an extra mapper.

The RBA token's `sub` is the Keycloak user's own id, not Entra's. It is stable
across logins, so `applicantId` and `initiator` on cases stay consistent.

### 2. Identity-provider mappers

| Mapper              | Type                | Effect                                                        |
| ------------------- | ------------------- | ------------------------------------------------------------- |
| `municipality`      | Hardcoded attribute | `municipality = flevoland`                                    |
| `organisation-type` | Hardcoded attribute | `organisation_type = province`                                |
| `assurance-level`   | Hardcoded attribute | `assurance_level = substantieel`                              |
| `role-iou-admin`    | Claim to role       | `roles` contains `IOU_ADMIN` → realm role `admin`             |
| `role-iou-user`     | Claim to role       | `roles` contains `IOU_USERS` → realm role `caseworker`        |
| `role-iou-pa`       | Claim to role       | `roles` contains `IOU_PA` → realm role `public-affairs`       |
| `role-iou-infra`    | Claim to role       | `roles` contains `IOU_INFRA` → realm role `infra-projectteam` |

The existing `ronl-business-api` client mappers turn these attributes and roles
into the `municipality`, `organisation_type`, `loa` and `realm_access.roles`
claims.

Under `FORCE`, a claim-to-role mapper adds its role when the claim value is
present and removes it when it is absent. It touches no other role, so roles
assigned by hand in Keycloak (`pa-author`, `pa-editor`, `pa-admin`, the `rip-*`
groups) persist.

The four mapped roles are the exception: they cannot be assigned by hand. A
hand-assigned `caseworker`, `admin`, `public-affairs` or `infra-projectteam` is
removed at the user's next login whenever the token lacks the matching app
role, so Entra group membership is the only way to grant them.

An Infra-board user needs more than `infra-projectteam`: its task list is
filtered by the `rip-*` candidate groups, and its seeded test user also holds
`infra-medewerker`. Both are granted in Keycloak after the user's first login,
with `GRANT_USER=<username> scripts/keycloak-add-rip-roles.sh` for the `rip-*`
roles and a single role mapping for `infra-medewerker`. Found in the live test
on 2026-09-28: without them the Infra-board showed no tasks.

### 3. The provisioning script

`scripts/keycloak-add-entra-idp.sh`, in the style of
`keycloak-add-rip-roles.sh`:

- Uses the admin REST API against the realm named by `KEYCLOAK_URL` and
  `REALM`, with the same admin inputs (`ADMIN_USER`, `ADMIN_REALM`,
  `ADMIN_PASSWORD`, prompted when unset).
- Reads `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET` from the
  environment. The secret is never read from an argument, printed or written to
  a file. Values are trimmed, because the IT hand-over's client ID carried a
  leading space.
- Idempotent: creates the provider when it is missing and updates it when it
  exists; creates each mapper by name and updates it when it exists.
- Verifies that the four target realm roles exist before creating mappers, and
  stops with the missing names when one does not.
- Prints the redirect URI that must be registered in Entra for the target
  Keycloak.
- `--dry-run` prints the JSON it would send, with the secret redacted, and
  changes nothing.

The realm export `config/keycloak/ronl-realm.json` gets **no** Entra provider,
so a fresh local `--import-realm` still works without Flevoland credentials.
After re-importing locally, the script has to be run again.

### 4. The frontend button

`packages/frontend`:

- `services/keycloak.ts` exports `FLEVOLAND_IDP = 'entra-flevoland'`, the one
  place the frontend names the alias.
- `pages/LoginChoice.tsx`:
  - `startCitizenLogin` becomes `startIdpLogin(idp)`, with the alias added to
    its union type.
  - The hero's primary action becomes **"Inloggen met uw Flevoland-account"**,
    which calls `startIdpLogin(FLEVOLAND_IDP)`. "Bekijk de borden" stays as a
    secondary link beside it.
  - The hero note "Inloggen vereist via medewerkersaccount" names the Flevoland
    account.
  - Unchanged: the topbar "Inloggen" link (Keycloak's form, which now also
    shows the Entra button), the DigiD link, and the board cards with their
    `testUser` hints for the seeded demo accounts.
- `pages/AuthCallback.tsx`: no logic change. The existing non-medewerker branch
  sends the hint; `navigateAfterLogin` lands the user on their role's
  dashboard. Only its doc comment gains the new alias.

### 5. Failure modes

| Situation                                       | Behaviour                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Flevoland user without an app role              | Entra refuses the sign-in (assignment required); no Keycloak user is created                                                  |
| App role revoked in Entra                       | The mapped realm role is removed at the next login; the current access token expires within 15 minutes                        |
| Redirect URI not registered, or secret expired  | Keycloak's identity-provider error page. The script prints the URI to register; the runbook records the secret's expiry       |
| An existing Keycloak account has the same email | Keycloak's standard first-login flow offers to link the accounts. The seeded `test-*` users have no `@flevoland.nl` addresses |
| Browser holds several Microsoft accounts        | Entra shows its account picker (see [Deferred](#deferred))                                                                    |

## Testing

- **Frontend unit tests (Vitest):**
  - `LoginChoice.test.tsx`: the Flevoland button stores
    `selected_idp=entra-flevoland` and navigates to `/auth`.
  - `AuthCallback.test.tsx`: an unauthenticated `entra-flevoland` selection
    calls `keycloak.login({ idpHint: 'entra-flevoland' })`.
- **Script:** `--dry-run` against localhost shows the provider and seven
  mappers; a second real run reports every item as already present and
  updated, not duplicated.
- **Manual acceptance on localhost** by the user, once Flevoland IT has
  registered the redirect URI: sign in through the button with the Flevoland
  account, check the token's `municipality`, `organisation_type`, `loa` and
  `realm_access.roles`, and land on the dashboard for the role.
- Playwright stays on the seeded accounts. A live MFA login against a customer
  tenant cannot run unattended.

## Rollout

1. Localhost: run the script with the Entra environment variables set, then the
   manual acceptance test.
2. ACC Keycloak: the same script with `KEYCLOAK_URL=https://acc.keycloak.open-regels.nl`.
   The frontend change reaches ACC through the normal release pull request.
3. PROD: after Flevoland IT registers the PROD redirect URI, the script against
   `https://keycloak.open-regels.nl` at promotion.

## Documentation

- `iou-architectuur`, EN and NL:
  - `features/authentication-iam.md`: Entra as a brokered provider. "Keycloak
    is the only token issuer the Business API accepts" remains true.
  - `reference/jwt-claims.md`, `reference/keycloak-realm.md`: the provider and
    its mappers.
  - New runbook `developer/deployment/entra-id.md`: the Entra-side settings,
    running the script per environment, secret rotation, troubleshooting.
- RBA: an entry in the in-app changelog, `packages/frontend/src/pages/changelog-data.ts`.

## Deferred

- **Entra as a direct second issuer in the backend**, for machine-to-machine
  and Copilot Studio callers holding Entra tokens: a JWKS client per trusted
  issuer, and claim normalisation into `req.user` (Entra `roles` for
  `realm_access.roles`, no Entra source for `municipality`,
  `organisation_type` or `loa`). Its own spec; nothing here blocks it.
- **Skipping Entra's account picker** by forwarding `domain_hint=flevoland.nl`.
  `keycloak-js` has no field for it, and whether Keycloak 23 can forward it is
  unverified. Revisit only if the picker appears on Flevoland laptops.
- **More organisations.** A second Entra tenant is a second provider with its
  own alias and hardcoded tenant attributes. A generic, configuration-driven
  button waits until there is a second organisation.
