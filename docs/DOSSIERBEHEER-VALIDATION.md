# Dossierbeheer validation runbook

How to validate the full PA-Cockpit **Dossierbeheer** flow — the authoring source
for `/pa/dossiers` — from a mock-only UI walkthrough through to live backend
persistence.

The surface lives under **Beheer → Strategisch kompas → Dossierbeheer** (overview)
and **Nieuw dossier** (create). Mock vs. live is a **runtime toggle**, not just a
build flag: the flag banner flips a persisted `localStorage` override
(`paV2.dossiers.mock`) that [`fetchDossiers`](../packages/pa-cockpit/src/services/pa.api.ts)
reads, defaulting to `VITE_PA_DOSSIERS_MOCK`. So you can validate the whole UI on
mocks first, then flip to live in the same session — no rebuild.

- **Mock mode** — the entire surface runs on a local in-memory store seeded from
  `MOCK_DOSSIERS`; mutations are illustrative and reset on reload. No backend or
  Keycloak roles required.
- **Live mode** — reads/writes hit the backend; the same Keycloak roles gate the
  write routes; changes persist to `pa_dossiers` with version history.

---

## Prerequisites

- The stack is up (`docker-compose up`) — Keycloak, Postgres, backend, frontend.
- Log in to the PA-Cockpit as **`test-pa-flevoland`** (password `test123`).
  This user is a full **Beheerder** — it carries `public-affairs` plus
  `pa-author` / `pa-editor` / `pa-admin`
  ([realm config](../config/keycloak/ronl-realm.json)).
  - If the role bar shows **"Geen dossierrol"**, the roles aren't on the token:
    apply them via Keycloak admin UI **Realm settings → Partial import → overwrite
    existing users** (a plain restart won't re-import an existing realm), then
    log out and back in.
- Capability tiers, for reference:

  | Role      | Keycloak    | Aanmaken | Bewerken | Sjablonen | Publiceren | Archiveren | Verwijderen |
  | --------- | ----------- | :------: | :------: | :-------: | :--------: | :--------: | :---------: |
  | Auteur    | `pa-author` |    ✓     |    ✓     |           |            |            |             |
  | Redacteur | `pa-editor` |    ✓     |    ✓     |     ✓     |     ✓      |            |             |
  | Beheerder | `pa-admin`  |    ✓     |    ✓     |     ✓     |     ✓      |     ✓      |      ✓      |

---

## Part A — Validate the UI in mock mode

No backend calls; safe to click everything. The flag banner should read
**"Dossiers resolven nu naar `MOCK_DOSSIERS`…"** (amber).

1. **Overview renders.** Open **Beheer → Dossierbeheer**. Confirm:
   - Role bar shows **Beheerder** active with all six capability chips green,
     `Keycloak: pa-admin`.
   - Stats read **4 actief · 1 sluimerend · 1 gearchiveerd · 5 gepubliceerd**.
   - Groups: five active/sluimerend dossiers plus one **Gearchiveerd**
     (Invoering Omgevingswet) with a dashed card and Archiefwet meta.
2. **Navigation.** Click **Nieuw dossier** in the rail → template gallery.
   Click **Dossierbeheer** → back to the overview. Both directions must switch
   cleanly (the two rail items are distinct views).
3. **Create flow.** **+ Nieuw dossier** (or the rail item) → pick **Standaard
   PA-dossier** → **Doorgaan met dit sjabloon →**. In the editor:
   - Kerngegevens: type a Naam (watch the `/pa/dossiers/{slug}` preview) and an
     Onderwerp. Save stays disabled until Naam ≥ 3 chars and Onderwerp is filled.
   - Kompas: click the 0/1/2 steppers; the total and band chip update.
   - Markdown: toggle **Schrijven / Split / Voorbeeld**; the toolbar buttons
     wrap/prefix the selection; the preview footer shows
     "✓ veilig gerenderd — rehype-sanitize".
   - Snippets: focus a narrative field, click **Invoegen** on a snippet — it
     lands at the caret with `{{today}}`/`{{currentUser}}` expanded.
   - **Dossier aanmaken** → returns to the overview with the new dossier on top.
4. **Edit + publish.** Open a dossier via **Bewerken** → change something →
   **Wijzigingen opslaan** (bumps the version; see Versiegeschiedenis) or
   **Opslaan & publiceren**.
5. **Archive (Archiefwet).** From a row or the editor lifecycle → **Archiveren
   (Archiefwet)…** → pick classificatie + bewaartermijn, enter a reason →
   **Archiveren**. The dossier moves to **Gearchiveerd**; the Archiefwet button
   requires **Beheerder**.
   - **Archived = read-only.** Open the archived dossier (**Bekijken**): every
     field is locked and there's no Save/publish — archiving is terminal, so you
     cannot silently flip it back to Actief.
   - **Un-archive (Beheerder-only).** Restore it via **Herstellen** on the row,
     or **Dearchiveren (herstellen)…** in the editor lifecycle. It returns as a
     **concept** (status → actief, `archief` cleared, `gepubliceerd = false`,
     version appended) — re-publish to put it back in the cockpit.
6. **Delete.** **Definitief verwijderen…** → type the exact dossier name to
   enable the danger button → confirm. Admin-only.
7. **Role gating (optional).** These actions are gated on the token role. To see
   the locked states, sign in as a user without the sub-roles — publish/archive/
   delete render disabled with lock notes.

> Mock mutations are in-memory: reload the page to reset to the seed.

---

## Part B — Validate live against the backend

Now confirm the same actions persist. **You need the Beheerder roles on your
token (Part A prerequisites).**

1. **Flip the flag.** On the Dossierbeheer overview, click **"Zet vlag om naar
   live →"**. The banner turns green ("De cockpit leest deze dossiers live via
   `GET /pa/dossiers`"). The choice persists across navigation and reloads
   (`localStorage['paV2.dossiers.mock'] = '0'`).
2. **Seeded data is served.** The overview list now comes from the backend
   (`GET /v1/pa/dossiers?admin=1`). The five seeded dossiers + the archived
   example should appear, seeded from the shared dossier data on first backend
   start (`initDossiersDb`).
3. **Create persists.** Create a dossier as in A.3 → it is written to
   `pa_dossiers` via `POST /v1/pa/dossiers`, with version **v1** appended.
   Verify:
   ```bash
   docker compose exec postgres psql -U <user> -d <db> \
     -c "SELECT id, versie, gepubliceerd, status FROM pa_dossiers ORDER BY updated_at DESC LIMIT 5;"
   docker compose exec postgres psql -U <user> -d <db> \
     -c "SELECT dossier_id, v, note FROM pa_dossier_versions ORDER BY id DESC LIMIT 5;"
   ```
4. **Edit appends a version.** Edit + save → `versie` increments and a new
   `pa_dossier_versions` row is appended (visible in the aside history too).
5. **Publish gate.** As Beheerder, **Opslaan & publiceren** sets
   `gepubliceerd = true`. (An Auteur-only token gets `403 FORBIDDEN_PUBLISH`.)
6. **Archive captures metadata.** Archive a dossier → `status = 'gearchiveerd'`,
   `gepubliceerd = false`, and the `archief` JSONB carries classificatie,
   bewaartermijn, reden, `at`, and `by`. Editing an archived dossier is refused
   server-side (`PATCH /dossiers/:id` → `409 ARCHIVED_READONLY`).
7. **Un-archive restores a concept.** **Herstellen / Dearchiveren** →
   `POST /dossiers/:id/unarchive` (pa-admin) sets `status = 'actief'`, clears
   `archief`, keeps `gepubliceerd = false`, and appends a version. Un-archiving a
   non-archived dossier → `400 NOT_ARCHIVED`.
8. **Delete removes the row + versions.** Hard delete → the `pa_dossiers` row and
   all its `pa_dossier_versions` are gone.
9. **Cockpit reads live.** Switch to **Dossiers / Vandaag / Monitoring /
   Voortgang** — `usePaData().dossiers` now serves the live, **published,
   non-archived** dossiers (archived ones and concepts are hidden from the
   cockpit). Publishing a new dossier makes it appear; archiving removes it.

### API smoke (optional, without the UI)

```bash
TOKEN=... # a test-pa-flevoland access token
BASE=http://localhost:3000/v1/pa   # adjust to your API base

curl -s "$BASE/dossiers" -H "Authorization: Bearer $TOKEN" | jq '.data | length'          # cockpit list
curl -s "$BASE/dossiers?admin=1" -H "Authorization: Bearer $TOKEN" | jq '.data | length'   # admin list
curl -s "$BASE/templates" -H "Authorization: Bearer $TOKEN" | jq '.data | map(.id)'
```

Expected gating without the sub-roles: `POST/PATCH /dossiers` → `403`,
`.../archive`, `.../unarchive` and `DELETE` → `403` (needs `pa-admin`);
anonymous → `401`.

---

## Rollback / reset

- **Back to mock:** click **"↩ Terug naar mock"** on the banner, or clear
  `localStorage['paV2.dossiers.mock']` (falls back to the env default).
- **Default for everyone:** `VITE_PA_DOSSIERS_MOCK` is `true` on dev + acceptance
  and `false` on production
  ([.env files](../packages/frontend/)). Flip these to change the build-time
  default when you're ready to ship live by default.
- **Re-seed:** the seed is idempotent (`ON CONFLICT DO NOTHING`); to reset a
  local DB, drop the `pa_dossiers` / `pa_dossier_versions` rows and restart the
  backend.
