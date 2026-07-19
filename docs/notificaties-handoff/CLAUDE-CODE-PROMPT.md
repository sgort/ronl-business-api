# Claude Code prompt — implement Notificaties (Beheer → Monitoring)

Port the confirmed design (`reference/NotificatiesSection.reference.tsx` +
`reference/notificaties.css.snippet.css`, signed off in the PA-Cockpit UX Design reference)
into the real app at `ronl-business-api/packages/frontend`. The screen is a **read-only
explainer** of the WatchBell & Meldingen notification layer — a sibling of the existing
**Curatiepijplijn** and **Afwegingskader** spec pages. It teaches a PA officer how a
notification is produced and delivered; it does **not** add or change any notification
behaviour (that machinery already ships — see below).

Paste this whole file to Claude Code with the repo open. `reference/WATCHBELL.md` is the
canonical description of the feature and the source of truth for the copy.

---

## Goal

A new **Beheer → Monitoring → Notificaties** page, positioned **directly under Zoekcriteria**
(between `zoekcriteria` and `curatie-spec`). It contains:

1. Header (eyebrow + `Notificaties` title + two intro paragraphs).
2. A **three-properties table** (`scope` · `dossierId` · `notify`) making explicit that these
   answer three _different_ questions — the single most-confused thing about the feature.
3. **NotificatiesFlow** — a fluid vertical diagram of the matcher loop, reusing the exact
   `.pac-cspec-flow` vocabulary as `CuratiePijplijnFlow`: the four trigger points →
   `computeNotifications` (fed by topic- and dossier-watches from the left lane) → `matchWatch`
   → dedup/collapse on `UNIQUE(user_id, signal_id)` → Meldingen inbox → in-app + personal RSS.
4. **Three footnotes**: watch is orthogonal to the cron; a team/seed search is watched via a
   personal derivative; only confirmed signals notify.

No mutations, no data fetching — it is a static reference like `CuratieSpecSection`.

## What already exists (reuse — do NOT rebuild)

The notification **feature** is already implemented; this task only documents it. Do not touch
the runtime behaviour.

- **Backend**: `packages/backend/src/pa-monitoring/notifications.service.ts`
  (`computeNotifications`), routes in `pa.routes.ts`, tables `pa_notifications` + `pa_feed_tokens`,
  RSS in `rss.ts`. All described in `reference/WATCHBELL.md`.
- **Frontend delivery UI**: `pages/public-affairs-v2/NotificationsPanel.tsx` (the Meldingen
  slide-over + bell/badge), `components/PADashboardV2/WatchBell.tsx` (the 🔔 toggle),
  `PaDataProvider.tsx` (the shared `notifications` resource).
- **Beheer plumbing** (mirror these for the new page):
  - `pages/public-affairs-v2/modes.config.ts` — the beheer mode's **Monitoring** group.
  - `components/PADashboardV2/PASectionRouter.tsx` — `BEHEER_IDS` set + the `switch` that maps
    a section id to a component.
  - Sibling spec pages: `CuratieSpecSection.tsx`, `KompasSpecSection.tsx`, `ZoekcriteriaSection.tsx`.
  - Shared diagram: `CuratiePijplijnFlow.tsx` (the `.pac-cspec-flow` markup your new flow copies).
  - Scoped CSS: `pages/public-affairs-v2/dashboard-pa.css` under `.pac`.
- **Command palette** is automatic: ⌘K is driven by `allStaticSections()` in `modes.config.ts`,
  so adding the nav item (step 1) registers the palette entry too — no separate change needed.

## Steps

### 1. Nav (frontend)

`pages/public-affairs-v2/modes.config.ts` → in the beheer mode's **Monitoring** group, insert
**between `zoekcriteria` and `curatie-spec`**:

```ts
{ id: 'notificaties', label: 'Notificaties', authRequired: true },
```

### 2. Router (frontend)

`components/PADashboardV2/PASectionRouter.tsx`:

- Add `'notificaties'` to the `BEHEER_IDS` set.
- Import the new section and add a case:
  ```ts
  import NotificatiesSection from './NotificatiesSection';
  // …
  case 'notificaties':
    content = <NotificatiesSection />;
    break;
  ```
  (The router already wraps Beheer content in `<div className="v2-main-pad">`, so the section
  returns a bare `.pac-cspec` block — same as `CuratieSpecSection`.)

### 3. The screen (frontend)

- Create `components/PADashboardV2/NotificatiesSection.tsx` from
  `reference/NotificatiesSection.reference.tsx` — it is already TSX with typed data. Keep the
  export name `NotificatiesSection` and **keep every class name exactly** (the CSS depends on them).
- Append `reference/notificaties.css.snippet.css` to `dashboard-pa.css`. It is already `.pac`-scoped
  and only adds two new rules — everything else the page uses already exists in that file (the
  snippet header lists exactly which shared classes it reuses).

### 4. Keep the copy honest

The page describes real machinery. If `notifications.service.ts` changes (a new trigger point, a
different dedup key, an email digest finally added, etc.), update the flow/footnotes so the page
can't lie. The four trigger points, the `UNIQUE(user_id, signal_id)` dedup, the empty-query
dossier watch, the team→personal-derivative rule, and "confirmed-only" are the load-bearing
claims — cross-check them against `reference/WATCHBELL.md` and the service.

### 5. Tests (optional but preferred)

- Frontend render test: the section renders, the three-properties table has 3 rows, the flow's
  four trigger tags (`confirm`, `link-dossier`, `watch-toggle`, `cycle`) are present, and the
  three footnotes render.
- A nav test asserting `notificaties` sits between `zoekcriteria` and `curatie-spec` in
  `PA_MODES` and resolves through `findPaModeForSection` / `allStaticSections`.

## Definition of done

- Beheer → Monitoring shows **Notificaties** as the item **directly under Zoekcriteria**
  (order: Signaalbronnen · Zoekcriteria · **Notificaties** · Curatiepijplijn).
- The page renders header + three-properties table + matcher flow + three footnotes + source line.
- ⌘K → "notificaties" jumps to it (free via `allStaticSections`).
- Purely additive: no change to `notifications.service.ts`, `WatchBell.tsx`,
  `NotificationsPanel.tsx`, routes, or the shell.

---

## ⚠️ Two things the design agent could NOT do — you must

1. **Write into the repo.** `ronl-business-api` was mounted read-only, so this is a handoff, not a
   commit. Every change above is **manual** — nothing was applied to your working tree. The
   `reference/` files are the source of truth for layout, class names and content; lift values
   from them.
2. **Run or type-check it.** The agent couldn't run Vite, `tsc` or the test suite, so the TSX
   section is **unverified against a build**. Run `tsc` + the frontend and `npx jest` after wiring,
   and click through Beheer → Monitoring → Notificaties to confirm the flow diagram and table
   render (they reuse proven `.pac-cspec*` / `.pac-spec-table` CSS, so they should).
