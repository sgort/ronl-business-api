# Session controls as a host seam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** stop `@ronl/pa-cockpit` naming its host's login protocol, and make the public demo's absence of session controls a typed fact rather than a stylesheet rule.

**Architecture:** two optional callbacks join the host contract — `onLogin` and `onLogout`. Absence of a callback removes its control. The package deletes five hardcoded host facts, and `PaCockpitAuth` loses `logout`, whose only caller is the block being replaced.

**Tech Stack:** TypeScript, React 18, Vitest, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-27-cockpit-session-seam-design.md` — approved. Read §4 (render rules) before Task 2.

## Global Constraints

- **Ask before every commit.** The user's global `CLAUDE.md` requires it every time; approval for one commit never carries to the next. Stage, report what is staged, then stop and ask.
- **No `Co-Authored-By:` or `Claude-Session:` trailers** in any commit message.
- **Never merge or push a shared branch** without an explicit in-the-moment go-ahead. Work stays on `feat/pa-cockpit-follow-ups`.
- **Never start, stop or restart a dev server.** Do not run Playwright — hand E2E to the user with the exact command.
- **A parallel-run failure is not a finding until it fails in isolation.** `packages/frontend` has three test files that fail intermittently under file parallelism — `IouGebruiksscenarioSection.test.tsx`, `Portfolio.test.tsx`, `SimMissedPanel.test.tsx` — verified pre-existing and recorded as follow-up item 9. If you hit them, re-run with `--no-file-parallelism` before concluding anything, and do not "fix" them here.
- **Every task leaves all five workspaces green.** This plan is ordered so none needs a broken intermediate state.
- Baselines to preserve: pa-cockpit 363, frontend 836, pa-demo 96, public-site 140, backend 1576.

---

## File Structure

### Modified — `packages/pa-cockpit`

| File                               | Change                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/PADashboardV2.tsx`      | `PaCockpitHost` gains two optional callbacks; the three control sites become conditional; five hardcoded host facts deleted |
| `src/host.ts`                      | `PaCockpitAuth` loses `logout` (Task 3)                                                                                     |
| `src/pages/PADashboardV2.test.tsx` | behavioural cases for present/absent callbacks                                                                              |
| `src/no-host-protocol.test.ts`     | **new** — source-text guard that the package names no host route or storage key                                             |

### Modified — `packages/frontend`

| File                                | Change                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/pages/PaCockpitRoute.tsx`      | **new** — route component supplying the callbacks; needs `useNavigate`, which neither `App` nor the host module can call |
| `src/App.tsx:94`                    | route element becomes `<PaCockpitRoute />`                                                                               |
| `src/pages/pa-cockpit-host.tsx`     | `logout` removed from the auth adapter (Task 3)                                                                          |
| `src/pages/PaCockpitRoute.test.tsx` | **new**                                                                                                                  |

### Modified — `packages/pa-demo`

| File                               | Change                                               |
| ---------------------------------- | ---------------------------------------------------- |
| `src/demo/pa-cockpit-host.tsx`     | supplies neither callback, with a comment saying why |
| `src/demo/shims/keycloak.ts`       | `logout` removed (Task 3)                            |
| `src/demo/pa-cockpit-host.test.ts` | asserts neither callback is supplied                 |

**Why a new route component.** `App.tsx:70` renders `<BrowserRouter>` itself, so `App`'s own body is outside router context and cannot call `useNavigate`. `pa-cockpit-host.tsx` is a plain module (`export const paCockpitHost`), not a component, so it cannot either. A component rendered _as_ the route is the only place with router context. Every frontend sibling that begins a login (`LoginChoice.tsx:12`, `AuthCallback.tsx:89`) uses `useNavigate`; this follows them rather than introducing `window.location`.

---

## Task 1: Add the callbacks to the contract and wire both hosts

Adding optional props and supplying them changes no behaviour — the package does not read them yet. The repo stays green.

**Files:**

- Modify: `packages/pa-cockpit/src/pages/PADashboardV2.tsx` (the `PaCockpitHost` interface only)
- Create: `packages/frontend/src/pages/PaCockpitRoute.tsx`, `packages/frontend/src/pages/PaCockpitRoute.test.tsx`
- Modify: `packages/frontend/src/App.tsx:94`
- Modify: `packages/pa-demo/src/demo/pa-cockpit-host.tsx`
- Modify: `packages/pa-demo/src/demo/pa-cockpit-host.test.ts`

**Interfaces:**

- Produces: `PaCockpitHost.onLogin?: () => void` and `PaCockpitHost.onLogout?: () => void`; `PaCockpitRoute` as the default export of its file.

- [ ] **Step 1: Extend the interface**

In `packages/pa-cockpit/src/pages/PADashboardV2.tsx`, add to `PaCockpitHost`:

```ts
  /**
   * Begin a login. Absent means this host offers no login, and no login control
   * renders — see the render rules in
   * docs/superpowers/specs/2026-08-27-cockpit-session-seam-design.md §4.
   */
  onLogin?: () => void;

  /**
   * End the session. Absent means this host has no session to end; the avatar
   * still renders as an identity display, but not as a button.
   */
  onLogout?: () => void;
```

- [ ] **Step 2: Write the failing frontend test**

`packages/frontend/src/pages/PaCockpitRoute.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const logout = vi.fn();
vi.mock('../services/keycloak', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/keycloak')>()),
  default: { authenticated: true, token: 't', logout, updateToken: vi.fn() },
  getUser: () => null,
}));

const cockpit = vi.fn(() => null);
vi.mock('@ronl/pa-cockpit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ronl/pa-cockpit')>()),
  PADashboardV2: (props: { host: Record<string, unknown> }) => cockpit(props),
}));

import PaCockpitRoute from './PaCockpitRoute';

beforeEach(() => vi.clearAllMocks());

function hostArg() {
  render(
    <MemoryRouter>
      <PaCockpitRoute />
    </MemoryRouter>
  );
  return (cockpit.mock.calls[0][0] as { host: Record<string, () => void> }).host;
}

describe('PaCockpitRoute', () => {
  it('supplies both session callbacks to the cockpit', () => {
    const host = hostArg();
    expect(typeof host.onLogin).toBe('function');
    expect(typeof host.onLogout).toBe('function');
  });

  it('onLogin writes the two keys its sibling dashboards write, then routes to /auth', () => {
    // Same protocol as LoginChoice.tsx:19, WooDashboard.tsx:103,
    // InfraBoardDashboard.tsx:216 and CaseworkerDashboardV2.tsx:170 —
    // AuthCallback.tsx reads both back. Moved here, not invented.
    hostArg().onLogin();
    expect(sessionStorage.getItem('selected_idp')).toBe('medewerker');
    expect(sessionStorage.getItem('post_login_redirect')).toBe('/dashboard/public-affairs');
    expect(navigate).toHaveBeenCalledWith('/auth');
  });

  it('onLogout ends the real session', () => {
    hostArg().onLogout();
    expect(logout).toHaveBeenCalledWith({ redirectUri: window.location.origin + '/' });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run --root packages/frontend src/pages/PaCockpitRoute`
Expected: FAIL — cannot resolve `./PaCockpitRoute`.

- [ ] **Step 4: Write the route component**

`packages/frontend/src/pages/PaCockpitRoute.tsx`:

```tsx
/**
 * Supplies the cockpit its session callbacks.
 *
 * This exists as a component rather than living in pa-cockpit-host.tsx because
 * onLogin needs useNavigate, and neither of the two obvious homes can call it:
 * App.tsx renders <BrowserRouter> itself, so App's body is outside router
 * context, and pa-cockpit-host.tsx is a plain module, not a component. A
 * component rendered as the route is the only place with the context.
 *
 * The login protocol is this app's house convention, not the cockpit's — the
 * same two sessionStorage keys are written by LoginChoice, WooDashboard,
 * InfraBoardDashboard and CaseworkerDashboardV2, and read back by AuthCallback.
 * It moved out of the package so the package stops naming this app's routes and
 * IdP vocabulary.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PADashboardV2, type PaCockpitHost } from '@ronl/pa-cockpit';
import keycloak from '../services/keycloak';
import { paCockpitHost } from './pa-cockpit-host';

export default function PaCockpitRoute() {
  const navigate = useNavigate();

  const host = useMemo<PaCockpitHost>(
    () => ({
      ...paCockpitHost,
      onLogin: () => {
        sessionStorage.setItem('selected_idp', 'medewerker');
        sessionStorage.setItem('post_login_redirect', '/dashboard/public-affairs');
        navigate('/auth');
      },
      onLogout: () => {
        keycloak.logout({ redirectUri: window.location.origin + '/' });
      },
    }),
    [navigate]
  );

  return <PADashboardV2 host={host} />;
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run --root packages/frontend src/pages/PaCockpitRoute`
Expected: 3 passed.

- [ ] **Step 6: Point the route at it**

In `packages/frontend/src/App.tsx`, change line 94 from
`element={<PADashboardV2 host={paCockpitHost} />}` to `element={<PaCockpitRoute />}`,
add the import, and remove the now-unused `PADashboardV2` / `paCockpitHost` imports **only if nothing else in the file uses them** — check before deleting.

- [ ] **Step 7: Say the demo supplies neither**

In `packages/pa-demo/src/demo/pa-cockpit-host.tsx`, add to the exported host object a comment and nothing else:

```ts
// No onLogin or onLogout: plato is public and unauthenticated, so there is no
// session to begin or end. Their absence is what removes the login controls and
// makes the avatar inert — see the cockpit's render rules. Do not add a no-op
// callback here; a no-op would restore a control that does nothing, which is
// the defect this replaced.
```

- [ ] **Step 8: Pin that absence**

Append to `packages/pa-demo/src/demo/pa-cockpit-host.test.ts`:

```ts
it('supplies no session callbacks, so the cockpit renders none', () => {
  expect(demoCockpitHost.onLogin).toBeUndefined();
  expect(demoCockpitHost.onLogout).toBeUndefined();
});
```

- [ ] **Step 9: Verify the whole repo**

Run: `npm run type-check`, `npm run lint`, then `npm test` for pa-cockpit (363), frontend (836 + 3 new), pa-demo (96 + 1 new).
Expected: all green. Behaviour is unchanged — the package does not read the new callbacks yet.

- [ ] **Step 10: Report what is staged and ask before committing**

Suggested subject: `feat(pa-cockpit): accept optional session callbacks on the host contract`

---

## Task 2: Switch the package to the callbacks and delete the hardcoded protocol

**Files:**

- Modify: `packages/pa-cockpit/src/pages/PADashboardV2.tsx` (the three control sites and both handlers)
- Modify: `packages/pa-cockpit/src/pages/PADashboardV2.test.tsx`
- Create: `packages/pa-cockpit/src/no-host-protocol.test.ts`

**Interfaces:**

- Consumes: `host.onLogin` / `host.onLogout` from Task 1.

**The three control sites**, all in `PADashboardV2.tsx`:

| Line | Control                                                              | With the callback                  | Without                                                |
| ---- | -------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| ~553 | avatar, `className="pac-avatar"`, initials + 📋, `title="Uitloggen"` | `<button onClick={host.onLogout}>` | identical markup as `<span>`, no `onClick`, no `title` |
| ~570 | header "Inloggen" button                                             | renders                            | not rendered                                           |
| ~616 | "Inloggen als medewerker" in the login-required panel                | renders                            | not rendered                                           |

- [ ] **Step 1: Write the failing tests**

Append to `packages/pa-cockpit/src/pages/PADashboardV2.test.tsx`:

```tsx
it('renders the avatar as a button and calls onLogout when a host supplies it', async () => {
  const onLogout = vi.fn();
  const user = userEvent.setup();
  render(<PADashboardV2 host={{ ...testHost, onLogout }} />);

  const avatar = screen.getByTitle('Uitloggen');
  expect(avatar.tagName).toBe('BUTTON');
  await user.click(avatar);
  expect(onLogout).toHaveBeenCalledTimes(1);
});

it('renders the avatar inert when the host supplies no onLogout', () => {
  // The avatar is the identity display, not a labelled logout button — a public
  // demo still wants the initials. What it must not have is a control that does
  // nothing, which is what the shimmed logout produced before this seam existed.
  render(<PADashboardV2 host={testHost} />);

  const avatar = document.querySelector('.pac-avatar');
  expect(avatar).not.toBeNull();
  expect(avatar!.tagName).not.toBe('BUTTON');
});
```

`testHost` already exists in this file and supplies neither callback.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run --root packages/pa-cockpit src/pages/PADashboardV2`
Expected: the first fails because no `onLogout` is wired; the second fails because the avatar is unconditionally a `<button>`.

- [ ] **Step 3: Rewrite the two handlers**

Delete `handleLogin` and `handleLogout` entirely, along with both `sessionStorage.setItem` calls, the `'medewerker'` literal, `navigate('/auth')`, and `navigate('/dashboard/public-affairs')`.

**Keep `useNavigate`** — `PADashboardV2.tsx:523`'s logo click still uses it.

**Leave `getPaCockpitAuth()`'s other call sites alone.** Only the one inside the deleted `handleLogout` goes; the lazy `useState` initialiser and the tenant effect stay.

- [ ] **Step 4: Make the three sites conditional**

At the avatar, render the same children either way:

```tsx
{
  host.onLogout ? (
    <button type="button" className="pac-avatar" onClick={host.onLogout} title="Uitloggen">
      {initials}
      <span aria-hidden="true">📋</span>
    </button>
  ) : (
    <span className="pac-avatar">
      {initials}
      <span aria-hidden="true">📋</span>
    </span>
  );
}
```

At both login sites, wrap the existing button in `{host.onLogin && ( … )}`, calling `host.onLogin` instead of the deleted `handleLogin`. The login-required panel keeps its heading and explanatory paragraph — only the button is conditional.

- [ ] **Step 5: Run and watch them pass**

Run: `npx vitest run --root packages/pa-cockpit src/pages/PADashboardV2`
Expected: all pass, including every pre-existing case unchanged.

- [ ] **Step 6: Write the source-text guard**

`packages/pa-cockpit/src/no-host-protocol.test.ts` — follow the shape of the existing `no-tailwind.test.ts`: walk `packages/pa-cockpit/src` recursively, read every non-test `.ts`/`.tsx`, and fail if any names a host protocol string. Assert on all four, and report the offending file paths rather than a bare boolean:

```ts
const FORBIDDEN = ['selected_idp', 'post_login_redirect', '/dashboard/public-affairs', "'/auth'"];
```

Give it a header explaining what it guards: the package is embedded by more than one application, and naming one application's routes, storage keys or IdP vocabulary is the leak this seam closed.

- [ ] **Step 7: Prove the guard fails**

Temporarily restore one `sessionStorage.setItem('selected_idp', …)` call to `PADashboardV2.tsx`, run the guard, confirm it goes red **naming that file**, then revert and confirm `git diff` is clean. Report the exact assertion output. A guard that has never failed is indistinguishable from one that cannot.

- [ ] **Step 8: Verify the whole repo**

Run: `npm run type-check`, `npm run lint`, and the three suites. pa-demo's avatar is now inert, which is the intended outcome — its own tests should be unaffected, but say so explicitly.

Hand off to the user: "`npm run test:e2e --workspace=@ronl/pa-demo` — expected 11 passed." Do not run it yourself.

- [ ] **Step 9: Report what is staged and ask before committing**

Suggested subject: `refactor(pa-cockpit): take session controls from the host instead of naming its protocol`

---

## Task 3: Drop `logout` from the auth contract

Now that no package code calls it, the member has no consumer. Doing this last keeps every earlier task green.

**Files:**

- Modify: `packages/pa-cockpit/src/host.ts`, `packages/pa-cockpit/src/host.test.ts`
- Modify: `packages/frontend/src/pages/pa-cockpit-host.tsx`
- Modify: `packages/pa-demo/src/demo/shims/keycloak.ts`

- [ ] **Step 1: Confirm it really has no caller**

Run: `grep -rn "\.logout(" packages/pa-cockpit/src`
Expected: no output. If anything appears, stop and report — Task 2 missed a site.

- [ ] **Step 2: Remove it from the interface**

In `packages/pa-cockpit/src/host.ts`, delete the `logout` member from `PaCockpitAuth`. Update the interface's doc comment, which currently enumerates what the cockpit touches — it must not keep listing a member that is gone. That comment was corrected once before for overclaiming; keep it accurate.

- [ ] **Step 3: Remove it from both adapters**

`packages/frontend/src/pages/pa-cockpit-host.tsx` — drop `logout` from the `auth` object. The real `keycloak.logout` is still called, now from `PaCockpitRoute.onLogout`.

`packages/pa-demo/src/demo/shims/keycloak.ts` — drop `logout`. Check whether the shim's own test asserts on it and update if so.

- [ ] **Step 4: Update the host contract test**

`packages/pa-cockpit/src/host.test.ts` builds a `PaCockpitAuth` literal in its fixtures. Remove `logout` there too. Do not weaken any assertion — if one becomes meaningless, say so rather than deleting it quietly.

- [ ] **Step 5: Verify**

Run: `npm run type-check` (the compiler is the real check here — an excess property on a typed literal is an error), `npm run lint`, all five suites, and `npm run build` for frontend and pa-demo.

- [ ] **Step 6: Report what is staged and ask before committing**

Suggested subject: `refactor(pa-cockpit): drop logout from the auth contract, now host-owned`

---

## Self-Review

**Spec coverage.** §3 contract → Task 1 (callbacks) and Task 3 (`logout` removal). §4 render rules, all three sites including the avatar's degradation → Task 2. §5 host wirings → Task 1 for both hosts, Task 3 for the adapter cleanup. §6 testing: behavioural → Task 2 Step 1; the source-text guard → Task 2 Steps 6–7; the demo's absence assertion → Task 1 Step 8. §7's "does not change frontend behaviour" is why Task 1 Step 4 moves the protocol verbatim rather than rewriting it.

**The spec's one open question is closed.** It said to "check how `AuthCallback.tsx` and its siblings navigate before choosing." Checked: both use `useNavigate`, and neither `App` (which renders `<BrowserRouter>` itself) nor the plain-module host can call a hook. Hence `PaCockpitRoute`. Recorded in the File Structure section rather than left to the implementer.

**Ordering.** Every task leaves all five workspaces green: Task 1 adds optional props nothing reads, Task 2 starts reading them once both hosts supply what they intend to, Task 3 removes a member once nothing calls it. No pre-ruled broken intermediate is needed.

**Type consistency.** `onLogin` / `onLogout` are named identically in Tasks 1, 2 and 3 and in both hosts. `PaCockpitHost` and `PaCockpitAuth` match the spec's §3. `testHost` in Task 2 is the fixture that already exists in `PADashboardV2.test.tsx`, not a new one.

**A trap worth naming.** Task 1 Step 7 forbids a no-op `onLogout` in the demo. Supplying `() => {}` would type-check, satisfy the contract, and restore exactly the dead control this work removes — the most plausible wrong turn in the whole plan.
