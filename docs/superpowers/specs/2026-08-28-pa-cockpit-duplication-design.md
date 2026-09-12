# Guarding the duplication the de-vendoring branch did not reach — design

**Goal:** make the surviving cross-workspace duplication impossible to drift
silently, without moving any CSS or changing anything that renders.

This is follow-up item 4 from
`docs/superpowers/plans/2026-08-27-pa-cockpit-follow-ups.md`.

---

## 1. What the investigation changed

The entry listed four duplications as one problem. They are not.

**Three of the four are required, not accidental.** `packages/pa-demo` never
imports `dashboard-v2.css` — the only importer anywhere is
`packages/frontend/src/pages/CaseworkerDashboardV2.tsx:55`. So every `v2-*`
class a package-owned component renders must also have a rule in the package's
own `dashboard-pa.css`, or the demo renders it unstyled. Both files already say
so: `dashboard-pa.css:1139` ("kept here so the PA cockpit renders the panel
correctly even when loaded standalone") and `PANoAccessPanel.tsx:5-7`.

That inverts the framing. The copies are the price of the package being
standalone-renderable, which is the demo's entire premise. Removing them would
break the demo; the thing worth guarding is drift, not the copy count.

**One of the four is not duplication at all.** The two `configurePaCockpit`
auth adapters differ in exactly two places, and each difference is _correct for
its side_:

|                 | `packages/frontend`                                                         | `packages/pa-demo`                                                            |
| --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `authenticated` | `!!keycloak.authenticated` — keycloak-js types it `authenticated?: boolean` | `keycloak.authenticated` — the shim is `authenticated: true`, already boolean |
| `updateToken`   | `keycloak.updateToken(minValidity ?? 0)` — keycloak-js requires a number    | `keycloak.updateToken(minValidity)` — the shim's parameter is optional        |

Two correct adaptations of one contract over different underlying objects. The
real finding inside that bullet is unrelated to duplication: **only the
frontend's adapter has a test.**

**A fifth item surfaced that the entry never listed.**
`PACommandPalette.tsx:6-7` claims the component "reuses the same
`.cwd-v2-palette*` styles (kept global) plus the `.pac-palette*` skin". It
renders only `pac-palette-overlay`, `pac-palette`, `pal-empty`, `label`, `mode`
and `pal-hint`, and `dashboard-pa.css:1050-1082` defines all of them. It reuses
nothing from the caseworker sheet. This is the same defect class as the
`v2-main-pad` comments corrected in `7196730`, and worse in effect: it tells a
reader that pa-demo depends on a stylesheet pa-demo never loads.

---

## 2. What was decided

Four guards and two comment corrections. **No runtime code changes, no CSS
moves, no visual risk** — nothing in this design needs to be looked at in a
browser to be verified.

Three alternatives were considered and rejected:

- **A shared `brand.css`** consumed by both apps. Rejected: it reverses a
  decision already made and written down at `pa-demo/src/index.css:1-16`, which
  states the app-shell CSS deliberately stays per-app and that
  `@ronl/pa-cockpit` leaves it out of `styles.css` on purpose.
- **A shared design-token module** feeding both `tailwind.config.js` files.
  Rejected: the configs are ESM (`export default`) while `@ronl/shared` builds
  to CommonJS (`tsconfig.json: "module": "commonjs"`), so this couples the
  Tailwind step to `@ronl/shared` having been built — for five constants that
  change approximately never.
- **Consolidating the CSS** into one package-owned source. Rejected: it forces
  the caseworker dashboard to take its chrome from the PA cockpit package, an
  ownership inversion, and it carries visual risk that only a human can clear.

---

## 3. Guard A — the five brand colours

**Lives in `packages/pa-demo`.** That workspace's own `index.css:1-16` declares
it "owns its own copy of the shell", so the demo asserting its copy has not
drifted is the matching ownership. It is also the only framing under which a
cross-workspace file read is honest rather than incidental.

To be explicit about what that read is and is not: it is a **dev-time
filesystem read of a sibling workspace's source**, not a package dependency.
`packages/pa-demo` gains no `@ronl/frontend` entry and nothing changes in the
bundle. The path is resolved from the test file upward to the repo root rather
than by module resolution, because module resolution would not find it — which
is the point. If the file is absent the test fails naming it, rather than
skipping.

Reads four files and asserts five values agree:

| File                                         | Form                                      |
| -------------------------------------------- | ----------------------------------------- |
| `packages/frontend/src/index.css:5-11`       | `:root { --color-primary: #01689b; … }`   |
| `packages/pa-demo/src/index.css:21-27`       | same block, currently byte-identical      |
| `packages/frontend/tailwind.config.js:10-14` | `var(--color-primary, #01689b)` fallbacks |
| `packages/pa-demo/tailwind.config.js:11-15`  | same                                      |

The five names are `--color-primary`, `--color-primary-dark`,
`--color-primary-light`, `--color-secondary`, `--color-accent`, currently
`#01689b`, `#014d73`, `#4da6e0`, `#e17000`, `#ff6b00`.

Both Tailwind configs also alias `dutch-blue` → `--color-primary` and
`dutch-orange` → `--color-secondary` with the same fallbacks. Those aliases are
in scope: they are the same fact spelled a second time in the same file.

**Failure behaviour.** The assertion names the file and the value that
disagrees. If a file is missing entirely the test fails loudly rather than
skipping — a skipped guard is a guard nobody notices has stopped working.
Comparison is case-insensitive on the hex digits.

---

## 4. Guard B — class coverage across the two stylesheets

**Lives in `packages/frontend`.** It is the only workspace that can legitimately
see both stylesheets: its own directly, and the package's through the
`@ronl/pa-cockpit` dependency, whose `node_modules` entry is a symlink to
`packages/pa-cockpit` (verified resolvable). The reverse is impossible and must
stay impossible — `packages/pa-cockpit` does not depend on `packages/frontend`
and must never read it.

**The rule, stated generally rather than per-case:**

> Every `v2-*` class rendered by a package-owned component must have a rule in
> both `dashboard-pa.css` and `dashboard-v2.css`.

This covers 4c (`v2-changelog-btn`) and 4d (`v2-no-access*`) and any future
class that inherits the caseworker vocabulary, which the entry's per-case
framing would not have.

**What it deliberately does not assert: value equality.** `.v2-no-access*` has
already diverged on purpose (`--v2-*` vs `--pac-*` tokens, `520px` vs `60ch`,
and PA adds a `border-left` accent), and `.v2-changelog-btn` may legitimately
want to theme differently later. The failure mode worth catching is a class
added to a package component with only one stylesheet updated — the other host
then loses styling silently, and today nothing would notice.

**Two implementation constraints, both found by testing the idea rather than
assuming it:**

1. **The extractor must not match `v2-` inside a longer token.** `\bv2-` matches
   inside `cwd-v2-palette`, because `-` is a word boundary. That false positive
   is what produced a phantom `v2-palette` finding during design. A match must
   be a complete class token — not preceded by `-` or an alphanumeric.
2. **Comments must be excluded.** The same phantom came from a comment, not
   from markup. Use the parse-don't-scan idiom already established in
   `no-module-scope-modes.test.ts` and `index.test.ts` rather than a third
   hand-rolled scanner.

**Allow-list.** One entry: `v2-main-pad`, carrying the ruling from `7196730` —
inert under `.pac`, kept because both PA hosts and the `.cwd-v2` family spell
their section wrappers the same way, and removing it from one of three would
make the convention inconsistent rather than absent. The allow-list is the
point, not a concession: it forces that decision to be written where the guard
can see it.

**Current state, measured.** Seven `v2-*` tokens appear in package `.tsx`
files. `v2-palette` is the comment artefact above and disappears once
extraction is correct. `v2-main-pad` is the allow-list entry. The remaining
five — `v2-changelog-btn`, `v2-no-access`, `v2-no-access-body`,
`v2-no-access-meta`, `v2-no-access-title` — all have rules in both stylesheets
today, so the guard is green on arrival.

---

## 5. Guard C — the demo's auth adapter

`packages/pa-demo/src/demo/pa-cockpit-host.test.ts` exists but pins only the
mode narrowing and the absence of `onLogin`/`onLogout`. It asserts nothing about
the auth adapter.

Mirror the four behavioural assertions from
`packages/frontend/src/pages/pa-cockpit-host.test.ts`, adapted to the shim:

- `authenticated` reads through to the shim rather than being captured at module
  load
- `token` is read at call time, not snapshotted — the getter-not-snapshot choice
  is the one the frontend's test calls out as passing every other test and then
  sending a stale bearer
- `getUser` delegates to the shim's `getUser`
- `updateToken` passes `minValidity` through unchanged, including when omitted

The last one is the assertion that would catch the demo silently acquiring the
frontend's `?? 0`, which would be wrong here — a difference this design has
established is correct and should stay.

Use `vi.hoisted` for anything referenced in a `vi.mock` factory, per the repo's
writing-tests guide.

---

## 6. Corrections

- **`PACommandPalette.tsx:6-7`** — remove the false `.cwd-v2-palette*` claim.
  State that the component is fully skinned by `.pac-palette*` in
  `dashboard-pa.css:1050-1082` and depends on no caseworker stylesheet, which is
  what makes it render correctly in pa-demo.
- **`dashboard-pa.css`** — a short note at the `v2-*` copies naming their
  counterpart in `dashboard-v2.css`, why the copy is required (pa-demo never
  loads that file), and that Guard B enforces name coverage while allowing the
  values to differ.

---

## 7. Testing

Each guard is mutation-proven before it is trusted, following the pattern used
for R3b/R5 in `217a5c1` and the type pin in `2071d2f`: introduce the defect,
watch the guard go red naming the right file, revert, confirm the tree is clean
with `git status`.

Revert probes with a file copy, never `git checkout --` — on uncommitted work
that restores HEAD and silently discards the change under test.

| Guard | Probe                                                            | Expected                      |
| ----- | ---------------------------------------------------------------- | ----------------------------- |
| A     | change one hex digit in `pa-demo/src/index.css`                  | red, naming that file         |
| A     | change a Tailwind fallback only                                  | red, naming that config       |
| B     | add a `v2-*` class to a package component, style it in one sheet | red, naming the missing sheet |
| B     | change `.pac .v2-no-access` `max-width`                          | **green** — values may differ |
| B     | rename `cwd-v2-palette` in a comment                             | **green** — no false positive |
| C     | make the demo adapter snapshot `token` at module load            | red                           |
| C     | give the demo adapter the frontend's `?? 0`                      | red                           |

The two green probes are as load-bearing as the red ones: a coverage guard that
also enforces value equality would fail on the existing, deliberate divergence,
and would be deleted rather than fixed.

---

## 8. What this does not do

- It does not move any CSS, introduce a shared package, or change anything that
  renders. No visual check is required.
- It does not reduce the copy count. Three of the four copies are required for
  standalone rendering; the fourth is five constants whose elimination costs
  more than it saves.
- It does not touch item 14 (changelog rotation), which is deferred until after
  the ACC deployment.
