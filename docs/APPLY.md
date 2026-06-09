# PA-Cockpit V2 — code patch

Drop-in Public Affairs cockpit for **Provincie Flevoland**, built as a sibling
to `CaseworkerDashboardV2`. Same chrome, tenant theme, ⌘K palette and assistant
dock — scoped under `.pac` so it can't collide with caseworker development.

Login target: **`test-pa-flevoland`** → `/dashboard/public-affairs`.

---

## 1. What's in this patch

Paths are **repo-relative** (under `packages/frontend/`). Copy them in as-is.

```
src/pages/PADashboardV2.tsx                       ← the shell (mirrors CaseworkerDashboardV2)
src/pages/public-affairs-v2/
  modes.config.ts                                 ← 4 modes + gate model (mirrors caseworker-v2)
  pa.data.ts                                       ← typed domain types + MOCK_* data + accessors
  dashboard-pa.css                                 ← all styles, scoped under .pac
  Kompas.tsx                                        ← hexagon radar + 0–2 scorecard (+ Dots, Trend)
  Vandaag.tsx                                       ← Scherm 1
  Issuekaart.tsx                                    ← Scherm 2 (+ Narratief/Actie/OverlegBox/Tijdlijn sub-tabs)
  Monitoring.tsx                                    ← Scherm 3
  Voortgang.tsx                                     ← Scherm 6 (+ Kompas-log / Interventie-log)
src/components/PADashboardV2/
  PASectionRouter.tsx                               ← dispatches activeSection → screen
  PACommandPalette.tsx                              ← ⌘K navigator (static sections + dossiers)
  PADock.tsx                                        ← assistant dock, reuses McpChatSection verbatim
  PANoAccessPanel.tsx                               ← defence-in-depth fallback
```

**Reused from the existing app, unchanged:**
`services/keycloak.ts` (`getUser`), `services/tenant.ts` (`initializeTenantTheme`),
`components/SessionExpiryWarning`, `components/CaseworkerDashboard/McpChatSection`
(product-neutral chat chrome — the same component the caseworker dock reuses),
and the `KeycloakUser` type from `@ronl/shared`.

---

## 2. Apply steps

### 2.1 Copy the files

Copy the two folders above into `packages/frontend/src/`. No existing file is
overwritten.

### 2.2 Register the route — `src/App.tsx`

```diff
  import AuthCallback from './pages/AuthCallback';
  import CaseworkerDashboardV2 from './pages/CaseworkerDashboardV2';
+ import PADashboardV2 from './pages/PADashboardV2';
  import Dashboard from './pages/Dashboard';
  import LoginChoice from './pages/LoginChoice';
```

```diff
        {/* Caseworker portal is public — auth state is handled inside the component */}
        <Route path="/dashboard/caseworker" element={<CaseworkerDashboardV2 />} />
+
+       {/* PA cockpit — public route; role gate lives inside the component */}
+       <Route path="/dashboard/public-affairs" element={<PADashboardV2 />} />
```

### 2.3 Send PA users home after login — `src/pages/AuthCallback.tsx`

The shell already sets `post_login_redirect` when a user logs in _from_ the
cockpit, so this only matters for users who sign in via the generic medewerker
button. Extend the role-based fallback:

```diff
- const roles: string[] = (keycloak.tokenParsed as any)?.realm_access?.roles ?? [];
- return roles.includes('caseworker') ? '/dashboard/caseworker' : '/dashboard/citizen';
+ const roles: string[] = (keycloak.tokenParsed as any)?.realm_access?.roles ?? [];
+ if (roles.includes('public-affairs')) return '/dashboard/public-affairs';
+ return roles.includes('caseworker') ? '/dashboard/caseworker' : '/dashboard/citizen';
```

### 2.4 Add the realm role + test user — `config/keycloak/ronl-realm.json`

Append to `roles.realm` (next to `caseworker`):

```json
{
  "name": "public-affairs",
  "description": "Provincial Public Affairs adviser — access to the PA-cockpit"
}
```

Append to `users` (clone of `test-caseworker-flevoland`; same `municipality` so
the Flevoland theme loads automatically):

```json
{
  "username": "test-pa-flevoland",
  "enabled": true,
  "firstName": "Sanne",
  "lastName": "Bakker",
  "email": "pa@flevoland.nl",
  "emailVerified": true,
  "credentials": [{ "type": "password", "value": "test123", "temporary": false }],
  "attributes": {
    "municipality": ["flevoland"],
    "organisation_type": ["province"],
    "loa": ["hoog"]
  },
  "realmRoles": ["public-affairs"]
}
```

Re-import the realm (docker-compose Keycloak import or the admin console).
`getUser()` already surfaces `realm_access.roles` and `organisation_type`, so no
auth-code change is needed. The shell gate requires **both** the
`public-affairs` role and `organisation_type: province`.

### 2.5 (Optional) Changelog entry — `src/pages/changelog-data.ts`

Add a version block so the team sees what shipped:

```ts
{
  version: '3.2.0',
  date: 'June 8, 2026',
  sections: [
    {
      title: 'PA-Cockpit — first cut (Flevoland)',
      items: [
        'New /dashboard/public-affairs route, gated on public-affairs role + province org-type',
        'Vandaag · Dossiers · Monitoring · Voortgang; Flevolands Kompas radar + 0–2 scorecard',
        'Reuses tenant theme, ⌘K palette and the IOU assistant (McpChatSection) from the V2 shell',
      ],
    },
  ],
},
```

---

## 3. Growing it in 3-week cycles

Every screen reads from **`pa.data.ts`** through synchronous accessors
(`getDossiers()`, `getSignals()`, …). To go live with real data, introduce a
service with the **same return types** and flip one accessor per cycle — the
screens never change.

```ts
// src/services/pa.api.ts
import type { Dossier } from '../pages/public-affairs-v2/pa.data';
import { MOCK_DOSSIERS } from '../pages/public-affairs-v2/pa.data';

export async function fetchDossiers(): Promise<Dossier[]> {
  if (import.meta.env.VITE_PA_USE_MOCK === 'true') return MOCK_DOSSIERS;
  const res = await fetch('/v1/pa/dossiers');
  return res.json();
}
```

Then swap the screen's data source from the sync accessor to the async service
(add a tiny `useEffect` + `useState`, or a `useDossiers()` hook). Suggested order:

| Cycle | Lands                                    | Mock → real                                               |
| ----: | ---------------------------------------- | --------------------------------------------------------- |
|     1 | Vandaag · Issuekaart · Kompas            | dossiers/Kompas stay mock, curated with the team          |
|     1 | OverlegBox · Tijdlijn                    | local state → SharePoint write-away + Archiefwet metadata |
|     2 | Monitoring · Narratief                   | mock signals → Polpo / media-monitoring connector         |
|     3 | Voortgang · Kompas-log · Interventie-log | mock logs → persisted decisions                           |
|     3 | Actie & co-creatie                       | template stubs → generators + "samen schrijven"           |

**Contract before endpoint:** lift the types in `pa.data.ts` into
`packages/shared` the cycle _before_ you need each endpoint, so frontend and
backend move in parallel against the same `Dossier` / `KompasScores` / `Signal`
shapes.

**Adding a screen** = add a section id to `modes.config.ts` + a branch in
`PASectionRouter.tsx`. The shell never changes.

---

## 4. Isolation from caseworker dev

| Concern       | Caseworker                          | PA-Cockpit                     |
| ------------- | ----------------------------------- | ------------------------------ |
| CSS scope     | `.cwd-v2`                           | `.pac`                         |
| Route         | `/dashboard/caseworker`             | `/dashboard/public-affairs`    |
| Role gate     | `caseworker`                        | `public-affairs` + `province`  |
| Page / folder | `pages/caseworker-v2/`              | `pages/public-affairs-v2/`     |
| Components    | `components/CaseworkerDashboardV2/` | `components/PADashboardV2/`    |
| Data/service  | `services/api.ts`                   | `services/pa.api.ts` (cycle 1) |

Shared, read-only: `keycloak.ts`, `tenant.ts`, `McpChatSection`,
`SessionExpiryWarning`, `@ronl/shared` types. The only _edited_ files are
append-only: `App.tsx` (one route), `AuthCallback.tsx` (one branch), the realm
export, and (optionally) `changelog-data.ts`.

---

## 5. Verify

1. `npm run build` (or `tsc --noEmit`) in `packages/frontend` — types are strict
   and self-contained; the only external imports are the reused modules listed
   in §1.
2. Log in as `test-pa-flevoland` → you land on **Vandaag** in Flevoland blue.
3. ⌘K → jump to any dossier; tabs switch modes; "Vraag de assistent" opens the
   IOU dock.
4. Log in as `test-caseworker-flevoland` and hit `/dashboard/public-affairs` →
   the **Geen toegang** panel (gate working).

> Note: `import.meta.env.VITE_PA_USE_MOCK` is only referenced once you add
> `services/pa.api.ts` in cycle 1. Until then the screens use the synchronous
> mock accessors and need no env var.
