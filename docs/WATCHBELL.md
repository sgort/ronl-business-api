# WatchBell & Meldingen — PA-Cockpit notification layer

How a PA officer gets notified when a new confirmed signal matches something
they care about, without polling the dashboard. tkconv-inspired: a "watch" is
a saved search with `notify=true`; a cross-watch matcher recomputes on every
signal-confirming event and delivers via an in-app inbox (**Meldingen**) plus
a personal RSS feed.

Backend: [`notifications.service.ts`](../packages/backend/src/pa-monitoring/notifications.service.ts),
routes in [`pa.routes.ts`](../packages/backend/src/pa-monitoring/pa.routes.ts).
Frontend: [`PaDataProvider.tsx`](../packages/frontend/src/pages/public-affairs-v2/PaDataProvider.tsx),
[`NotificationsPanel.tsx`](../packages/frontend/src/pages/public-affairs-v2/NotificationsPanel.tsx),
[`WatchBell.tsx`](../packages/frontend/src/components/PADashboardV2/WatchBell.tsx).

---

## The three levels of "interest"

A saved search (`pa_saved_searches`) carries three independent properties.
They're easy to conflate — they answer three different questions:

| Property                              | Question it answers                                                        | Where it's set                                                              |
| ------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Team** vs **Persoonlijk** (`scope`) | Does the 6-hourly curation cron read this search?                          | `↗ team` / `↩ persoonlijk` toggle, Zoekcriteria                             |
| **dossierId**                         | Which dossier does a match get filed under?                                | Zoekcriteria editor, or the WatchBell on a dossier page (empty-query watch) |
| **🔔 Volgen** (`notify`)              | Do _I_ get a Meldingen entry when this matches a _newly confirmed_ signal? | WatchBell — Zoekcriteria row, or a dossier's detail header                  |

`scope` and `notify` are orthogonal: a `Persoonlijk` search can be watched,
a `Team` search can be watched, and either can exist without being watched.
`notify` never affects what the cron fetches — it only affects delivery.

**Ownership caveat:** `notify` is a single flag on the row, not a per-user
subscription list. Delivery goes to the row's `user_id` (whoever created it),
not necessarily whoever last toggled the bell. For a `Persoonlijk` search this
is moot (only the owner can see/toggle it). For a shared `Team` search, a
colleague clicking your bell re-confirms _your_ subscription, not theirs. This
is documented in the Zoekcriteria intro copy; a genuine multi-user watch list
per row would need a schema change (out of scope for v1).

### Two ways to create a watch

1. **Topic watch** — toggle the bell on an existing saved search
   (`ZoekcriteriaSection.tsx`). Matches a confirmed signal when its title or
   duiding contains one of the search's OR-terms (optionally further scoped to
   a `dossierId`).
2. **Dossier watch** — toggle the bell in a dossier's detail header
   (`Issuekaart.tsx`). Idempotently creates/re-enables a personal
   `pa_saved_searches` row with `dossierId` set and an **empty query**
   (`{ q: '', types: [], source: [] }` — all three fields matter, see
   [Gotcha #1](#gotcha-1-the-query-json-shape-must-be-complete) below). An
   empty-query dossier watch matches **every** confirmed signal for that
   dossier — tkconv's "watch this entity" mode
   (`POST`/`DELETE /v1/pa/dossiers/:id/watch`).

---

## Data model

```sql
-- existing table, one column added
ALTER TABLE pa_saved_searches ADD COLUMN notify BOOLEAN NOT NULL DEFAULT false;

-- delivery + dedup ledger
CREATE TABLE pa_notifications (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  user_id           TEXT NOT NULL,
  signal_id         TEXT NOT NULL REFERENCES pa_signals(id) ON DELETE CASCADE,
  matched_searches  JSONB NOT NULL DEFAULT '[]',  -- [{id, dossierId, label}, ...]
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_at           TIMESTAMPTZ,
  UNIQUE (user_id, signal_id)                      -- the dedup key
);

-- personal RSS auth (readers can't send a Keycloak bearer token)
CREATE TABLE pa_feed_tokens (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  tenant_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`UNIQUE (user_id, signal_id)` is the whole dedup story: once a signal has
been notified to a user, it never resurfaces, even if the matcher reprocesses
every confirmed signal again on the next trigger (which it does, every time —
see below).

## The matching algorithm

`computeNotifications(tenantId, reason)` does a full O(watches × signals) scan
on every call — deliberately simple, no incremental diffing:

1. `SELECT` every `pa_saved_searches` row with `notify = true AND user_id IS NOT NULL`
   for the tenant (seed/taxonomy rows have `user_id IS NULL` and are silently
   excluded — see [Gotcha #2](#gotcha-2-seed-rows-cant-be-watched)).
2. `SELECT` every `pa_signals` row with `status = 'confirmed'`.
3. For each `(watch, signal)` pair, `matchWatch()` decides:
   - Dossier watch (empty query): matches iff `signal.dossier_id === watch.dossier_id`.
   - Topic watch (has a query): matches iff an OR-term hits `title`/`duiding`,
     optionally also requiring the dossier match.
4. Matches for the same `(user_id, signal_id)` collapse into **one**
   `pa_notifications` row — a signal caught by two overlapping watches
   produces one delivered item listing both, not two (tkconv's cross-monitor
   merge).
5. `INSERT ... ON CONFLICT (user_id, signal_id) DO NOTHING` — already-delivered
   pairs are silently skipped every time, which is _expected_ and shows up in
   the logs as `alreadyExisted`, not `inserted`.

### Trigger points

`computeNotifications` is called synchronously, `await`-ed **before** the
HTTP response is sent, from four places — every event that can newly satisfy
a watch:

| `reason`                      | Where                                                                                         | Why it's needed                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `confirm`                     | `POST /v1/pa/signals/:id/confirm`                                                             | A signal just became `confirmed` — the only status the matcher considers.                                                                                                                         |
| `link-dossier`                | `PATCH /v1/pa/signals/:id`                                                                    | A watchlist signal (confirmed with no dossier) just got `dossier_id` set — a dossier watch couldn't have matched it before this.                                                                  |
| `watch-toggle`                | `PATCH /v1/pa/searches/:id` (when `notify` flips to `true`), `POST /v1/pa/dossiers/:id/watch` | A watch just turned on — any already-confirmed signal it now covers must surface immediately, not sit undelivered until some unrelated later trigger dumps the whole backlog at once (see below). |
| `cycle` / `cycle-no-searches` | `runCurationCycle()` (6-hourly cron, or manual **Curatie nu uitvoeren**)                      | Catch-all — new signals confirmed by the cycle itself.                                                                                                                                            |

If you add a new place that changes a signal's `status` or `dossier_id`, it
needs its own `computeNotifications(tenantId, 'reason')` call — the matcher
never runs on a schedule tighter than "something just happened."

---

## Frontend wiring

`notifications` is a shared resource on `PaDataProvider` (`GET
/v1/pa/notifications?unseen=true`, polled once on mount, otherwise only via
explicit `refetch()`). The **Meldingen** bell badge and slide-over panel
(`NotificationsPanel.tsx`, styled to match `ChangelogPanel.tsx` — same
overlay/panel/ESC/click-outside pattern, never a toggle-on-the-trigger-button)
both read this one resource, so they're always in sync with each other.

### Gotcha #3: mutate through the context, never `pa.api.ts` directly

Every context method that can change a signal's confirm/dossier state
(`confirmSignal`, `linkSignalDossier`) refetches `signals`, `inbox`, and
`notifications` after the backend call resolves:

```ts
// PaDataProvider.tsx
const confirmSignal = useCallback(async (id, patch) => {
  const result = await apiConfirmSignal(id, patch);
  signalsResource.refetch();
  inboxResource.refetch();
  notificationsResource.refetch(); // <-- easy to forget
  return result;
}, [...]);
```

**This bit us twice** during development: `Issuekaart.tsx`'s dossier-page
Monitoring tab, and `Monitoring.tsx`'s "Koppel aan dossier" action, both
originally imported `confirmSignal`/`linkSignalDossier` straight from
`pa.api.ts` instead of destructuring them from `usePaData()`. The backend
worked perfectly (notification created immediately, provably in the logs) —
but the badge stayed stale because nothing told the shared `notifications`
resource to refetch. It only "fixed itself" on the next unrelated mutation
(whose refetch happened to pick up the backlog) or a full page reload.

**The rule:** any component that confirms a signal or links it to a dossier
must get that function from `usePaData()`, not import it directly from
`pa.api.ts`. If you add a new confirm/link call site, wire it through the
context or it will silently desync Meldingen.

---

## Personal RSS feed

`GET /v1/pa/signals.rss?token=...` — the "one query, two renderers" pattern:
the same `fetchSignalsRows()` + `rowToSignal()` behind `GET /v1/pa/signals`,
rendered as RSS 2.0 XML instead of JSON
([`rss.ts`](../packages/backend/src/pa-monitoring/rss.ts)). Registered
**before** the router's `jwtMiddleware` — RSS readers can't send a bearer
token, so it authenticates via `?token=` against `pa_feed_tokens` instead.
`GET /v1/pa/feed-token` (authenticated, normal JWT) finds-or-creates the
caller's token and returns the full feed URL. Surfaced as a copyable link in
**Beheer → Signaalbronnen**.

---

## Debugging

Every `computeNotifications()` call now logs its full lifecycle
(`module: pa-notifications`):

```
computeNotifications started    { reason, watches, signals }
computeNotifications: inserted  { reason, userId, signalId }     -- per new match
computeNotifications finished   { reason, matched, inserted, alreadyExisted, durationMs }
```

Or an early exit when there's nothing to do:

```
computeNotifications: nothing to match, exiting early   { watches: 0 or signals: 0 }
computeNotifications: no watch matched any confirmed signal
```

To debug a "Meldingen didn't update" report: reproduce with the backend
terminal open, find the `computeNotifications started`/`finished` pair for
that action, and check `inserted` vs `alreadyExisted`. If `inserted > 0` but
the UI didn't update, the bug is on the frontend (see Gotcha #3, above) — the
backend already did its job.

---

## Manual verification checklist

1. **Deselect** every active WatchBell (Zoekcriteria + any dossier) so you
   start from a clean `notify=false` state.
2. Toggle 🔔 on one Zoekcriteria row and on one dossier. Meldingen shows
   **0 signalen** — correct, nothing confirmed yet.
3. Confirm an inbox signal that already matches the topic watch's terms and
   dossier. Badge updates **immediately**, panel shows it, source line and
   `{nr} ↗` deep link match the signal card.
4. Confirm a _different_ inbox signal with **no** dossier match. Badge does
   **not** change — correct, nothing matches yet (it lands on the watchlist).
5. From the curated list, link that watchlist signal to the watched dossier
   (**Koppel aan dossier**). Badge updates immediately with that signal —
   this is the `link-dossier` trigger point, tested independently of confirm.
6. **Alles gelezen** → badge returns to 0. Re-run step 3's confirm action a
   second time (or trigger a curation cycle) — the same signal must **not**
   reappear (`alreadyExisted`, not `inserted`, in the logs).
7. Repeat steps 3–5 from a dossier's own **Monitoring** sub-tab
   (`Issuekaart.tsx`), not just the main Monitoring page — this is the path
   that regressed twice (Gotcha #3).

---

## Known limitations

- **Single shared `notify` flag on a Team row** (see the ownership caveat,
  above) — not a per-user subscription list.
- **Seed/taxonomy rows can't be watched** — see
  [Gotcha #2](#gotcha-2-seed-rows-cant-be-watched).
- **Candidates never notify, only confirmed signals** — deliberate: the
  cockpit's whole model is "a human decides," so pushing unreviewed inbox
  items as notifications would undercut that. Mirrors what a dossier's
  "Gecureerd" section shows.
- **No email digest** — in-app badge + personal RSS only. No SMTP
  infrastructure exists in this backend; adding one is a separate,
  ops-dependent decision.
- **Full rescan on every trigger** — fine at current scale (dozens of watches
  × hundreds of confirmed signals), would need indexing/incremental diffing
  well before it became a real cost. Note this used to produce a confusing
  symptom: turning a watch on didn't itself recompute anything, so an
  already-confirmed backlog for that watch sat silently undelivered until
  some unrelated later trigger (e.g. confirming a totally different signal)
  did the next rescan and dumped the whole backlog at once, misattributed to
  that unrelated action. Fixed by adding `watch-toggle` as its own trigger
  point (see [Trigger points](#trigger-points)) — the backlog now surfaces
  the moment the watch turns on.

### Gotcha #1: the `query` JSON shape must be complete

The dossier-watch INSERT originally wrote `{ q: '' }` instead of
`{ q: '', types: [], source: [] }`. `SavedSearch.query.source` came back
`undefined` for that row, and `ZoekcriteriaSection.tsx`'s `zcBestCase()`
calls `sources.includes(...)` unconditionally on every row — an unguarded
crash that blanked the whole Zoekcriteria page the moment a dossier watch
existed. Fixed on the backend (always write the full shape) _and_ defensively
on the frontend (`s.query.source ?? []`) so a legacy or malformed row degrades
instead of crashing.

### Gotcha #2: seed rows can't be watched

`computeNotifications`'s watch query requires `user_id IS NOT NULL`. The
taxonomy seed rows created by `seedTaxonomy()` (`pa-monitoring.db.ts`) have no
`user_id` — they're shared, tenant-wide topic filters, not owned by anyone.
Toggling `notify=true` on one via the PATCH route (which is intentionally
tenant-guarded, not user-guarded, so any PA officer can edit team criteria)
will silently persist but never produce a notification. Not a bug — there's
no single recipient to deliver to — but worth knowing if a watch seems inert.
