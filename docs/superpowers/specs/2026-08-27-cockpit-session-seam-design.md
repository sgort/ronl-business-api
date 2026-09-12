# Session controls as a host seam — design

**Goal:** stop `@ronl/pa-cockpit` naming its host's login protocol, and make the
public demo's suppression of session controls structural rather than cosmetic.

This is follow-up item 3 from
`docs/superpowers/plans/2026-08-27-pa-cockpit-follow-ups.md`.

---

## 1. The problem

`packages/pa-cockpit/src/pages/PADashboardV2.tsx:395-406` hardcodes five facts
that belong to a host application:

```ts
const handleLogin = () => {
  sessionStorage.setItem('selected_idp', 'medewerker');
  sessionStorage.setItem('post_login_redirect', '/dashboard/public-affairs');
  navigate('/auth');
};
const handleLogout = () => {
  const auth = getPaCockpitAuth();
  if (auth.authenticated) {
    auth.logout({ redirectUri: window.location.origin + '/' });
  } else {
    navigate('/dashboard/public-affairs');
  }
};
```

Two `sessionStorage` key names, an IdP literal, and two router paths — in a
package whose entire premise is that host-specific seams are injected.

**This is not something the cockpit invented.** The same protocol is a house
convention across five files in `packages/frontend`:
`CaseworkerDashboardV2.tsx:170`, `WooDashboard.tsx:103`,
`InfraBoardDashboard.tsx:216` and `LoginChoice.tsx:19` all write the same two
keys; `AuthCallback.tsx` consumes them. The cockpit was the sixth participant.
Extraction did not create a leak so much as strand one participant outside the
application that owns the convention.

**The live symptom is in the demo.** `packages/pa-demo` is public and
unauthenticated. Its keycloak shim reports `authenticated: true` and its `logout`
resolves to nothing, so the avatar control does nothing when clicked. Nothing
about the code says that is deliberate.

---

## 2. What was decided

The demo should not offer session controls at all. Hiding them via
`demo-overrides.css` was considered and rejected: two controls are already
suppressed that way (the live toggle, the assistant dock), and the whole-branch
review flagged that pattern specifically — keyed on package-internal class names,
pinned by no package test, and caught only by the ACC E2E, which the production
workflow does not run. A third such rule would deepen a known weakness.

Instead the controls become **optional host callbacks**, so their absence is a
typed fact the compiler understands rather than a stylesheet rule nobody tests.

---

## 3. The contract

```ts
export interface PaCockpitHost {
  modes: PaModeConfig[];
  SectionRouter: ComponentType<PaSectionRouterProps>;
  Dock: ComponentType<PaDockProps>;
  SessionExpiryWarning: ComponentType;
  ChangelogPanel: ComponentType<PaChangelogPanelProps>;

  /** Begin a login. Absent means this host offers no login; no login control renders. */
  onLogin?: () => void;

  /** End the session. Absent means this host has no session to end; the avatar renders inert. */
  onLogout?: () => void;
}
```

`PaCockpitAuth` **loses `logout`**. Verified: its only caller in the package is
the block being replaced (`PADashboardV2.tsx:403`). Once logout is the host's
callback, the member has no consumer, and leaving it would be a contract member
no code reads.

`useNavigate` **stays** — `PADashboardV2.tsx:523`'s logo click uses it
independently.

---

## 4. Render rules

Three control sites are affected. The middle one is the subtle case.

| Site                                                             | With the callback             | Without                                   |
| ---------------------------------------------------------------- | ----------------------------- | ----------------------------------------- |
| `:553` avatar (`pac-avatar`, initials + 📋, `title="Uitloggen"`) | `<button onClick={onLogout}>` | same markup as a non-interactive `<span>` |
| `:570` header "Inloggen" button                                  | renders                       | not rendered                              |
| `:616` "Inloggen als medewerker" in the login-required panel     | renders                       | not rendered                              |

**Why the avatar degrades rather than disappears.** It is not a labelled logout
button — it is the user-identity display, showing initials for the demo's
persona. Removing it would strip a visual the demo wants and change its
appearance. Rendering the same markup without interactivity keeps the identity
and removes only the affordance that would do nothing.

**The unauthenticated-with-no-`onLogin` state.** The "Inloggen vereist" panel
renders its explanatory text with no button. This is unreachable in both current
hosts — `packages/pa-demo` always reports authenticated, `packages/frontend`
always supplies `onLogin` — but it is defined here deliberately rather than left
to chance. A host that authenticates elsewhere and embeds an already-authenticated
cockpit is the case this shape serves.

---

## 5. Host wirings

**`packages/frontend/src/pages/pa-cockpit-host.tsx`** gains both callbacks. They
carry the protocol that already exists in its five sibling dashboards, moved
rather than invented:

```ts
onLogin: () => {
  sessionStorage.setItem('selected_idp', 'medewerker');
  sessionStorage.setItem('post_login_redirect', '/dashboard/public-affairs');
  navigate('/auth');
},
onLogout: () => {
  keycloak.logout({ redirectUri: window.location.origin + '/' });
},
```

The host module is not a component, so it needs the navigation mechanism the
frontend uses outside React — check how `AuthCallback.tsx` and its siblings
navigate before choosing, and prefer whatever they already do over introducing a
new mechanism.

**`packages/pa-demo/src/demo/pa-cockpit-host.tsx`** supplies neither, with a
comment saying why: a public unauthenticated demo has no session to begin or end,
and the absence is the mechanism that removes the controls.

**`packages/pa-demo/src/demo/shims/keycloak.ts`** drops its `logout` member,
which exists only to satisfy the contract member being removed.

---

## 6. Testing

Behavioural, in `packages/pa-cockpit`:

- avatar renders as a `button` when `onLogout` is supplied, and is **not** a
  `button` when it is not — assert on the element, not on a class
- clicking that button calls `onLogout` exactly once
- both login controls render with `onLogin` and neither renders without it
- the login-required panel still renders its explanatory text with no `onLogin`

Structural, closing the leak this exists to close:

- a source-text guard asserting no file under `packages/pa-cockpit/src` writes
  `sessionStorage` keys named `selected_idp` or `post_login_redirect`, and that
  the package names neither `/auth` nor `/dashboard/public-affairs`

The guard follows the idiom already established by
`no-module-scope-modes.test.ts` and `no-tailwind.test.ts`, and must be **proven
to fail** before it is trusted — restore one hardcoded value, watch it go red
naming the file, revert.

In `packages/pa-demo`: assert `demoCockpitHost` supplies neither callback, in
the same spirit as the existing assertion that it narrows its modes. That is what
makes "the demo hides these deliberately" a fact under test rather than an
absence nobody notices.

---

## 7. What this does not do

- It does not change `packages/frontend`'s behaviour. The same keys are written,
  the same routes navigated, by the same protocol — from one file further out.
- It does not add a fourth `demo-overrides.css` rule, which was the alternative.
- It does not touch the four remaining follow-ups. Item 4's duplication questions
  are a separate design.
