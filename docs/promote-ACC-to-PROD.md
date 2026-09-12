# Promoting RBA from ACC to PROD

Runbook for taking `ronl-business-api` from `acc` to `main` — and so to
production — on **12 September 2026**, followed by what comes after it: aligning
CI with [`ci-posture-across-repos.md`](https://github.com/sgort/linked-data-explorer/blob/acc/docs/ci-posture-across-repos.md)
and walking the open issue backlog.

**Everything in §2 and §4 was verified by command on 11 September 2026 between
21:40 and 22:00 CEST**, against `origin/acc` `0068444`, `origin/main` `d6a3cee`,
the live endpoints, the Azure subscriptions and the GitHub API. It was not written
from memory or copied from the older go-live checklists. Several of those
checklists turned out to be wrong on points that matter tomorrow; the differences
are called out where they occur. **Run §10 first thing in the morning** — it takes
two minutes and tells you whether anything moved overnight.

---

## Contents

0. [The short version](#0-the-short-version)
1. [Decisions to make before starting](#1-decisions-to-make-before-starting)
2. [Verified starting state](#2-verified-starting-state)
3. [What the promotion delivers — changelog 3.8.2 → 2026.09.5](#3-what-the-promotion-delivers--changelog-382--2026095)
4. [What PROD needs besides the code](#4-what-prod-needs-besides-the-code)
5. [The runbook](#5-the-runbook)
6. [Rollback](#6-rollback)
7. [Risks and gotchas](#7-risks-and-gotchas)
8. [After PROD: aligning CI with the cross-repo posture](#8-after-prod-aligning-ci-with-the-cross-repo-posture)
9. [Open issues walkthrough](#9-open-issues-walkthrough)
10. [T-0 re-verification](#10-t-0-re-verification)

---

## 0. The short version

- **PROD runs 3.8.2, last deployed 17 July. ACC runs 2026.09.5 (4 September)
  plus five unreleased commits.** Between them: 51 releases, 477 changelog
  entries, 638 commits, 714 files (+148,512 / −14,595).
- **The merge is clean — and that is the trap.** A trial merge produced zero
  conflicts. It also silently keeps `main`'s `VITE_PA_DOSSIERS_MOCK=true`, which
  under ACC's code puts the **whole** PA cockpit into mock mode on PROD:
  dossiers, signals, inbox and saved searches. Today only dossiers are mock on
  PROD. This has to be decided explicitly (**D1**).
- **PROD's App Service runs Node 20; the code needs 22.** `operaton-mcp` 1.1.0
  declares `engines.node >=22.0.0`, and ACC has run `NODE|22-lts` since March.
- **Two of the four deploy targets do not exist in production yet — and both
  are in scope (D2).** Public site and PA demo have no production Static Web
  App, no deploy token secret and no DNS. `plato.open-regels.nl` currently
  points at your own older "Parlementair Dashboard" SWA, in a subscription this
  Azure login does not list; the hostname moves in Phase 2B.
- **The backend must go first.** It still deploys through the manual
  `deploy-backend-to-prod.sh` from a clean local `main`. The public site's build
  prerenders against the production API, which returns 404 on `/v1/public/*`
  today. The recommended order is: disable the three production SWA workflows →
  merge the PR → deploy the backend → re-enable and dispatch each frontend.
- **PROD Keycloak needs 28 RIP roles and 3 token-claim mappers.** There are
  idempotent Admin-API scripts for both. Without the roles, 113 of the RIP
  ladder's 201 user tasks are invisible.
- **PROD App Service needs `LDE_API_URL`** (its code default is the _ACC_ LDE)
  **and `https://publiek.open-regels.nl` in `CORS_ORIGIN`.**
- **`main` has no ruleset.** It has classic protection with 0 approvals, no
  required checks, and force-push **allowed**.
- **GitLab mirror:** re-synced on 11 September — both heads match GitHub — so
  Phase 8 is two small fast-forwards.
- **All six decisions are recorded (§1):** live PA cockpit, all four surfaces,
  release cut first, `main` ruleset first, `CORS_ORIGIN` = `mijn` + `publiek`,
  and `test-infra-flevoland` gets every RIP role, as on ACC.

### Time budget (estimates)

| Phase                                    | Estimate                               |
| ---------------------------------------- | -------------------------------------- |
| 0 Prep                                   | 20 min                                 |
| 1 Release cut (D3)                       | 30–45 min, mostly waiting on ACC       |
| 2 Provision SWAs, secrets, ruleset       | 45–60 min; TLS validation async, ≤ 1 h |
| 3 PROD App Service prep                  | 15 min                                 |
| 4 PROD Keycloak                          | 15 min                                 |
| 5 Promotion branch and PR                | 15 min                                 |
| 6 Merge window (backend, then frontends) | 45–60 min                              |
| 7 Functional verification                | 30–45 min                              |
| 8 Close-out, mirror, docs                | 20–30 min                              |

---

## 1. Decisions to make before starting

Recorded on 11 September 2026. The runbook page keeps the live record, and the
runbook below already follows these choices.

|     | Decision                                              | Where it lands         |
| --- | ----------------------------------------------------- | ---------------------- |
| D1  | Live — flip `VITE_PA_DOSSIERS_MOCK` to `false`        | Phase 5.2              |
| D2  | All four surfaces                                     | Phases 2A, 2B, 6.6–6.8 |
| D3  | Cut v2026.09.6 first                                  | Phase 1                |
| D4  | Create the `main promotion gate` first                | Phase 2C               |
| D5  | `mijn` + `publiek`; `localhost:5173` removed          | Phase 3.3              |
| D6  | `test-infra-flevoland` gets every RIP role, as on ACC | Phase 4                |

The reasoning behind each follows.

### D1 — PA cockpit on PROD: live or mock? (**blocking**)

`main` carries one real commit that `acc` does not: `171f32b` "fix: enable PA
dossiers mock in production" (9 July), which sets
`packages/frontend/.env.production` → `VITE_PA_DOSSIERS_MOCK=true`.

`acc` never touched that line after the merge base (`f7de4cf`, 15 July), so a
three-way merge takes **`main`'s side**. Verified by a real trial merge in a
throwaway worktree: 0 conflicts, and the merged tree differs from `acc` in
exactly that one line.

> Issue #71 states the opposite ("a merge that takes `acc`'s side silently turns
> the PA dossiers mock off"). The trial merge disproves that: the merge keeps it
> **on**. Correct the issue when closing it.

The line also means more than it used to. Since 2026.08.22 the two legacy flags
are ORed into **one** default for the whole cockpit
(`packages/pa-cockpit/src/services/pa.api.ts`, `PA_MOCK_DEFAULT`):

| State                           | Dossiers | Signals / inbox / zoekcriteria    |
| ------------------------------- | -------- | --------------------------------- |
| PROD today (3.8.2)              | mock     | **live**                          |
| After merge as-is (`true` kept) | mock     | **mock** ← regression for signals |
| After merge + flip to `false`   | live     | live                              |

In either case a browser can override the default through the Dossierbeheer
banner (`paV2.mock` in localStorage). The old `paV2.dossiers.mock` key is dead,
so existing overrides reset once.

**Decided: live (`false`).** That matches ACC, where it has been
validated, keeps signals live as they are today, and leaves the banner for
anyone demonstrating. If PROD is meant to show fixtures, the purpose-built
surface for that is `plato` (pa-demo), not the caseworker app. A live cockpit
with no authored dossiers is a correct empty install, not a failed deploy.

How each choice is implemented: [Phase 5](#phase-5--promotion-branch-and-pr).

### D2 — Scope: which surfaces go live tomorrow

| Surface                            | Prerequisites                                                           | Decision                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Backend (`api.open-regels.nl`)     | Phase 3, Phase 4                                                        | **in**                                                                           |
| Caseworker (`mijn.open-regels.nl`) | none beyond the backend                                                 | **in** — it depends on the new backend, so they ship together                    |
| Public site (`publiek.…`)          | new SWA + token secret + CNAME + CORS (Phase 2A)                        | **in**; the domain can bind after the deploy                                     |
| PA demo (`plato.…`)                | new SWA + token + OG card recapture + `plato` freed from your older SWA | **in** — you own the current `plato` target, so the hostname can move (Phase 2B) |

**Decided: all four.** Phase 6.1 still disables the three SWA workflows before
the merge — that is about order, not scope — and Phase 6 re-enables each one in
turn.

### D3 — Cut a release first?

Five commits on `acc` postdate v2026.09.5: `66940d9` (#79, build id in the
changelog), `e352614` (#82, check-supply-chain), `04e38c8` (#86, branch floor +
pa-cockpit in CI), `11d1e49` (#89, prerender seed revalidation) and `0068444`
(#90, build id in the public-site footer).

**Decided: yes — `/bump-release` to v2026.09.6 before promoting, as Phase 1 of
this runbook.** The version string and the changelog then describe what PROD
actually serves. Since this was written, `acc` has also gained #91 (this
runbook) and its decisions update; the release picks those up too, and the Open
Graph card from Phase 2B should land before it as well.

### D4 — Protect `main` with a ruleset before opening the PR?

Today `main` has classic branch protection only: PR required, 0 approvals, **no
required status checks**, `allow_force_pushes: true`, `enforce_admins: false`
(so an admin can push directly). Linked Data Explorer closed the same hole on
2026-09-09 by creating a `main promotion gate` ruleset **before** its promotion
PR, and let the PR itself prove the gate bites.

**Decided: yes** — [Phase 2C](#2c--main-promotion-gate-ruleset-d4). Two
consequences to accept knowingly:

- With no bypass actors, you can no longer push to `main` directly either. A
  rollback then also goes through a PR ([§6](#6-rollback)).
- `require_extra_approval_for_unattributed_changes` must be set to **`false`
  explicitly**. GitHub stores `true` when it is omitted, and this promotion
  carries three author identities (Steven Gort 585, Datafluisteraar 47,
  renovate[bot] 6) with no second maintainer to approve anything.

### D5 — `CORS_ORIGIN` on PROD

- Today: `https://mijn.open-regels.nl,http://localhost:5173`.
- `https://publiek.open-regels.nl` must be added: its CSP `connect-src` already
  names `https://api.open-regels.nl`, and `/zoeken` searches client-side.
- ACC also allows `https://iou-architectuur.open-regels.nl`; PROD does not.

**Decided:** add `publiek`, **remove** `http://localhost:5173`, and keep
`iou-architectuur` off PROD. PROD's value becomes
`https://mijn.open-regels.nl,https://publiek.open-regels.nl` (Phase 3.3).
Dropping `localhost:5173` only affects someone pointing a local frontend at the
production API; the default local setup talks to the local backend.

### D6 — Who receives the RIP roles on PROD?

`keycloak-add-rip-roles.sh` creates any `rip-*` role missing from the realm file,
then grants **all** of them to `GRANT_USER` (default `test-infra-flevoland`). If
that user does not exist, it creates the roles and grants nothing.

Compared in the Keycloak admin console on 11 September (Users →
`test-infra-flevoland` → Role mapping, inherited roles hidden):

|                   | ACC                                                   | PROD                                                                                                   |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `rip-*` roles     | 34                                                    | 6 — `rip-aandrager`, `rip-ao`, `rip-deelnemers-psu`, `rip-manager-pb`, `rip-projectleider`, `rip-team` |
| other realm roles | `caseworker`, `infra-medewerker`, `infra-projectteam` | the same three                                                                                         |
| total             | 37                                                    | 9                                                                                                      |

The difference is exactly the 28 roles the script adds, and the user exists on
PROD.

**Decided: grant them to `test-infra-flevoland`, as on ACC** — the script's
default. One run brings PROD to the same 37 roles; Phase 4 checks it.

---

## 2. Verified starting state

### 2.1 Git

|                          | `origin/acc`                  | `origin/main`                     |
| ------------------------ | ----------------------------- | --------------------------------- |
| head                     | `0068444` (10 Sep, #90)       | `d6a3cee` (17 Jul)                |
| merge base               | `f7de4cf` (15 Jul) — single   |                                   |
| commits not on the other | 638                           | 7 — six merge commits + `171f32b` |
| diff `main`→`acc`        | 714 files, +148,512 / −14,595 |                                   |
| package version          | 2026.09.5                     | 3.8.2                             |

**Trial merge** (`origin/acc` into `origin/main`, detached throwaway worktree,
`--no-commit`, removed afterwards): _"Automatic merge went well"_, 0 unmerged
paths. The merged tree differs from `origin/acc` only in
`packages/frontend/.env.production` (`VITE_PA_DOSSIERS_MOCK=true`). See D1.

`main`-only **content** since the merge base is that single line. Everything else
`main` carries is merge bookkeeping.

### 2.2 Running systems

|                        | PROD               | ACC                                                                                                           |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `GET /` version        | 3.8.2              | 2026.09.5                                                                                                     |
| endpoints advertised   | 15                 | 17                                                                                                            |
| `/v1/health` deps      | keycloak, operaton | keycloak, operaton, **cache**                                                                                 |
| `/v1/public/processen` | **404**            | 200                                                                                                           |
| App Service runtime    | **`NODE\|20-lts`** | `NODE\|22-lts`                                                                                                |
| last backend deploy    | 17 Jul (`d6a3cee`) | = `acc` head for backend: no `packages/backend/src` or `packages/shared/src` change since the v2026.09.5 bump |
| last CI on that code   | —                  | backend build+tests green on `04e38c8` (8 Sep); frontend green on `04e38c8`; public-site green on `0068444`   |

### 2.3 Azure

Two subscriptions, and the split matters for which commands take
`--subscription`:

| Subscription                                         | Holds                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PDR – C1380** (default)                            | `ronl-business-api-{acc,prod}` App Services; `ronl-business-frontend-{acc,prod}` SWAs (**Free**)                                                      |
| **Platform Regelbeheer 2025 – C1427** (`24eac314-…`) | `ronl-business-public-site-acc`, `ronl-business-pademo-site-acc` SWAs (Standard); the **`open-regels.nl` DNS zone** (RG `RG_PlatformRegelbeheer2025`) |

| Hostname                     | DNS                                               | Serves                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mijn.open-regels.nl`        | CNAME → `gray-glacier-07cf98403…` (frontend-prod) | 3.8.2 caseworker app ✅                                                                                                                                                |
| `acc.publiek.open-regels.nl` | CNAME → `calm-water-068f8b303…`                   | ACC public site ✅                                                                                                                                                     |
| `publiek.open-regels.nl`     | **no record**                                     | nothing — PROD SWA does not exist                                                                                                                                      |
| `acc.plato.open-regels.nl`   | CNAME → `red-river-0ce4c9803…`                    | ACC PA demo ✅                                                                                                                                                         |
| `plato.open-regels.nl`       | **CNAME → `red-meadow-0e67bf103…`**               | your older "Parlementair Dashboard" (`index-ZA87jyV-.js`, last-modified 15 Apr 2026), in a subscription this `az` login does not list — the hostname moves in Phase 2B |

`skosmos.open-regels.nl` already sends the new `frame-ancestors` CSP naming both
`mijn` and `publiek` (header observed live). The Caddy change in this delta is
**already deployed**.

**SCM basic auth is disabled** on both App Services
(`basicPublishingCredentialsPolicies/scm` → `allow: false`). That matters for
the rollback backup ([3.1](#31-take-a-rollback-artifact)) and for issue #35.

### 2.4 GitHub

| Setting             | State                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| default branch      | `acc`                                                                                                                                      |
| merge methods       | merge commit only; title = PR title, message = **blank**; `delete_branch_on_merge: true`                                                   |
| `acc` ruleset       | `acc supply-chain gate`: PR (merge only, 0 approvals), required check `audit`. **No** `deletion` / `non_fast_forward` rules (LDE has both) |
| `main`              | classic protection only — see D4                                                                                                           |
| environments        | `acc`, `production` — **no protection rules** (nothing waits for approval)                                                                 |
| secrets present     | `…_TOKEN_ACC`, `…_TOKEN_PROD` (frontend), `…_PA_DEMO_ACC`, `…_PUBLIC_SITE_ACC`, `AZURE_WEBAPP_PUBLISH_PROFILE_ACC`, `KEYCLOAK_VM_*`        |
| secrets **missing** | `AZURE_STATIC_WEB_APPS_API_TOKEN_PUBLIC_SITE_PROD`, `AZURE_STATIC_WEB_APPS_API_TOKEN_PA_DEMO_PROD`, `SEMGREP_APP_TOKEN`                    |
| open PRs            | #20 (draft, Renovate dashboard approval, 183 behind `acc`)                                                                                 |

**What fires when the promotion lands on `main`** — every production workflow,
because the delta touches every path filter (including each workflow's own file):

| Workflow                          | On push to `main` | Effect if left enabled                                      |
| --------------------------------- | ----------------- | ----------------------------------------------------------- |
| Supply-chain audit (`zizmor.yml`) | fires             | read-only; harmless                                         |
| Build Backend for Production      | fires             | lint + 2008 tests + build + artifact; **deploys nothing**   |
| Deploy Frontend to Production     | fires             | **deploys `mijn` immediately**, possibly before the backend |
| Deploy Public Site to Production  | fires             | prerender against the 3.8.2 API → 404 → fails; and no token |
| Deploy PA Demo to Production      | fires             | builds, then fails at deploy — no token                     |

`workflow_dispatch` is present on all four production workflows (verified), which
is what makes the disable → dispatch ordering in Phase 6 possible.

### 2.5 GitLab mirror

|        | GitHub    | GitLab    | relation                              |
| ------ | --------- | --------- | ------------------------------------- |
| `acc`  | `6257df9` | `6257df9` | in sync (fast-forward from `66940d9`) |
| `main` | `d6a3cee` | `d6a3cee` | in sync (fast-forward from `53a4c0a`) |

Re-synced on 11 September after #91 merged: both were strict ancestors, so two
plain fast-forwards from GitHub's refs, confirmed with `git ls-remote`. GitLab
still carries `feat/public-pa-cockpit` (`c421cdf`), fully merged into
`origin/acc`; deleting it is a separate decision. The repository has no
`.gitlab-ci.yml`, so a push starts no pipeline.

---

## 3. What the promotion delivers — changelog 3.8.2 → 2026.09.5

PROD's changelog tops out at **3.8.2**. ACC's carries **51 newer releases**
(3.8.3 → 2026.09.5) with 477 entries, plus the five unreleased commits listed
under D3. All of it appears in PROD's changelog drawer on first open. What
follows is the walkthrough by period and theme. For the full text, open the
drawer on `acc.mijn.open-regels.nl` or read
`packages/frontend/src/pages/changelog-data.ts`.

### 3.1 By period

**15–23 July — 3.8.3 → 2026.07.0 (frontend + backend)**

- **PA cockpit notifications** (3.9.1–3.9.3): WatchBell 🔔 on saved searches and
  dossiers, the Meldingen/Notificaties slide-over, a personal RSS feed
  (`/v1/pa/signals.rss?token=…`), five live-verified notification bugs, and two
  privilege-escalation holes in dossier editing closed.
- **eDOCS as an AI Assistant source** (`EdocsMcpProvider`, off unless
  `EDOCS_MCP_ENABLED=true`), and five live-verified eDOCS client fixes.
- **Doccle document delivery** (3.9.0): new `/v1/doccle` routes, stubbed unless
  configured.
- **Test coverage** P1–P11 across the frontend (3.9.4/3.9.5); the **Playwright
  E2E harness** and a local Operaton container (2026.07.0).
- **CalVer** (`YYYY.MM.patch`) adopted from 2026.07.0 onwards.

**6–7 August — 2026.08.0 → 2026.08.3 (the public site)**

- New package `packages/public-site` (`publiek.open-regels.nl`): federated
  search, Regelcatalogus (Organisaties / Services / Rules / Concepts), Woordenboek
  (Skosmos embed), processen, toegankelijkheid, open data.
- New unauthenticated, GET-only backend surface **`/v1/public/*`**, plus an LDE
  process-bundle proxy (this is what reads `LDE_API_URL`).
- Prerender + sitemap + robots, a **bundle-cleanliness gate** that fails the
  build on any auth or telemetry code, and the Skosmos framing fix.

**10–18 August — 2026.08.4 → 2026.08.19 (Infra board / RIP ladder, Regelsimulatie, Herkomst)**

- RIP phase catalogue, `GET /v1/rip/phases/deployment-status` and `/counts`,
  the Faseladder overview, phase detail with the Starten / WIP / Gereed tabs, the
  ladder grown to **twelve phases**, parked projects (R5.3).
- **Regelsimulatie** ("Subsidie thuisbatterij") in the V2 shell.
- The public site's **Herkomst** page and Open Graph card.
- **Tenant-mandatory deployment** (2026.08.19): fixes a cross-tenant data leak
  in RIP deployment-status and instance counts.

**20–23 August — 2026.08.20 → 2026.08.23 (hardening and PA correctness)**

- Deploys gated on lint, tests and a performance budget.
- **Required-env checks now actually fire** (2026.08.21): `DATABASE_URL`,
  `OPERATON_BASE_URL`, `KEYCLOAK_CLIENT_SECRET` and `ANTHROPIC_API_KEY` are
  checked at import, so a missing one is a backend that does not boot. `/v1/health`
  reports the deployment tier.
- Backend branch and function coverage above 80 % for every file.
- PA: Europarl gets a User-Agent and an empty `202` is no longer read as a feed;
  EP motions collapse per political group; **mock/live becomes one switch**; demo
  dossiers and taxonomy are **no longer seeded into the live database**;
  `PA_USE_MOCK` is dropped; TK is fetched one term at a time; an empty cached
  feed is no longer served for the whole TTL; deleting a dossier takes its
  signals with it.
- The rate-limit **code default** went 100 → 1000. Both App Services pin
  `RATE_LIMIT_MAX_REQUESTS=100` explicitly, so neither tier picks this up (§4.1).

**28 August — 2026.08.24 → 2026.08.32 (PA demo, the cockpit package, the supply chain)**

- New package `packages/pa-demo` (`plato`): a public, unauthenticated,
  **mock-only** PA cockpit, fenced off from the backend four independent ways.
- The cockpit is extracted into a real workspace package, `@ronl/pa-cockpit`,
  consumed by both the caseworker app and the demo, behind a host auth/session
  seam.
- **Supply-chain pinning**: every action at a digest, least-privilege tokens,
  Renovate under a 14-day cooldown, the zizmor `audit` gate, and releases landing
  through PRs.

**29–30 August — 2026.08.33 → 2026.08.36 (CI v7 pins, advisories, ValidSign)**

- Actions pinned to v7; `pull_request` triggers path-filtered; Azure deploys
  serialised per environment.
- `uuid` and `@anthropic-ai/sdk` advisories closed.
- **ValidSign signing of RIP phase-exit approvals** — a signable PDF with placed
  fields, secret-verified callback plus a poller, and a live-tier allowlist.
  Stubbed unless `VALIDSIGN_STUB_MODE=false`.
- `rip-pdp` rendered from its deployed LDE template.
- **Email and name claims** mapped from the token (this needs the PROD Keycloak
  mappers, §4.3).
- The rate limiter keys on the client, not the connection.

**1–4 September — 2026.09.0 → 2026.09.5 (the ladder completes, EU moves, caching)**

- RIP ladder complete — **R2.2 through R6.1, twelve of twelve deelprocessen**.
  The **28 roles** the models address work to (§4.3). "Finishing a phase makes
  the project ready for the next."
- **Ongefilterd**: browse each signaalbron's raw feed unfiltered.
- **vite 5 → 6** (security).
- **The EU signaalbron moves to the EP Open Data API** (`data.europarl.europa.eu`),
  away from the `www.europarl.europa.eu` RSS that refuses ACC's egress range
  (#54/#55).
- An **80 % per-file branch floor** in every workspace.
- **PA cache**: a bounded connect, retry after failure, and cache state in
  `/v1/health` (#62/#64).
- The changelog drawer loads on demand.
- **Every phase swimlane is derived from deployed BPMN**, and the board fetches
  once instead of 48 times (2026.09.4/2026.09.5).

**Unreleased on `acc`:** a build id in the changelog (#79) and in the
public-site footer (#90), prerender seed revalidation (#89), check-supply-chain
as a non-blocking audit step (#82), and the branch floor enforced in CI with
pa-cockpit's suite (#86).

### 3.2 What PROD users will notice

| Surface        | Change                                                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caseworker app | Infra board with the full twelve-phase RIP ladder (**needs the roles**, §4.3); Regelsimulatie; PA cockpit reworked (Ongefilterd, notifications, dossier authoring); ValidSign signing panel (stub); Rollen & rechten; changelog drawer showing a build id |
| AI assistant   | eDOCS source present in code, **off** on PROD (`EDOCS_MCP_ENABLED` unset)                                                                                                                                                                                 |
| Public site    | new — `publiek.open-regels.nl`                                                                                                                                                                                                                            |
| PA demo        | new — `plato.open-regels.nl` (the hostname moves from your older SWA, Phase 2B)                                                                                                                                                                           |
| API            | root advertises 17 endpoint groups instead of 15; `/v1/public/*`, `/v1/doccle`, `/v1/rip/phases/*`, signing routes; `/v1/health` gains `cache`                                                                                                            |

### 3.3 Expected behaviour changes — not regressions

These are stated up front so nobody spends time chasing them.

- **EU signals become English-only, with no press releases and an empty
  `commissie`.** These are accepted trade-offs of the EP Open Data API (#55,
  #71). Note that PROD will also run the `ep-teksten` sub-source against
  `www.europarl.europa.eu`. That host still serves PROD's `20.73.x` egress
  today, so `commissie` may keep appearing on PROD while it cannot on ACC (#57).
- **An empty PA cockpit is a valid live state** (with D1 = live): nothing is
  seeded any more.
- **A missing required setting stops the backend from booting**, where 3.8.2
  would have run misconfigured. The names are verified present (§4.1).
- **The rate limit stays at 100/min per tenant**, because it is pinned in App
  Settings on both tiers.

**Read these entries in full before promoting:** 2026.08.21 (required env),
2026.08.22 (the mock switch), 2026.08.36 (ValidSign, the rate limiter),
2026.09.2 (the EU move) and 2026.09.3 (the cache).

---

## 4. What PROD needs besides the code

### 4.1 Backend App Service (`ronl-business-api-prod`, `rg-ronl-prod`)

Setting names were compared between the two App Services; values were read only
for non-secret keys.

| Setting                                                                                                                  | PROD today                              | ACC                                           | Action                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| runtime (`linuxFxVersion`)                                                                                               | `NODE\|20-lts`                          | `NODE\|22-lts`                                | **set `NODE\|22-lts`** — `operaton-mcp` 1.1.0 requires Node ≥ 22                                                                                                                                    |
| `LDE_API_URL`                                                                                                            | unset                                   | unset (ACC is happy with the ACC default)     | **set `https://backend.linkeddata.open-regels.nl/v1`** — the default is the _ACC_ LDE, so PROD's process library would silently proxy ACC data. Target verified live: LDE `2026.09.4`, `production` |
| `CORS_ORIGIN`                                                                                                            | `mijn`, `localhost:5173`                | `acc.mijn`, `iou-architectuur`, `acc.publiek` | **set to `mijn` + `publiek`, dropping `localhost:5173`** (D5)                                                                                                                                       |
| `DEPLOYMENT_ENV`                                                                                                         | `production` ✅                         | `acceptance`                                  | none                                                                                                                                                                                                |
| `DATABASE_URL`, `OPERATON_BASE_URL`, `KEYCLOAK_CLIENT_SECRET`, `ANTHROPIC_API_KEY`                                       | present ✅                              | present                                       | none — `validateConfig()` throws at import without them                                                                                                                                             |
| `CPRMV_URL`                                                                                                              | `https://cprmv.open-regels.nl/mcp` ✅   | unset (default is `acc.cprmv`)                | none                                                                                                                                                                                                |
| `EDOCS_MCP_*`                                                                                                            | unset → disabled                        | `ENABLED=false`, client id + secret           | none — leave off                                                                                                                                                                                    |
| `VALIDSIGN_*`                                                                                                            | unset → stub (default `true`)           | `STUB_MODE=true`                              | none                                                                                                                                                                                                |
| `DOCCLE_*`                                                                                                               | unset → stub (default `true`)           | unset                                         | none                                                                                                                                                                                                |
| `PUBLIC_SHOW_WIP_PROCESSES`                                                                                              | unset → `false`                         | `true`                                        | none — **must stay unset/false on PROD**                                                                                                                                                            |
| `PA_SEED_DEMO_DATA`                                                                                                      | unset → `false`                         | unset                                         | none                                                                                                                                                                                                |
| `EU_SOURCE_ENABLED`, `EP_TEXTS_SUBMITTED_ENABLED`, `EU_API_BASE`                                                         | unset → on, on, `data.europarl…/api/v2` | same                                          | none                                                                                                                                                                                                |
| `RATE_LIMIT_MAX_REQUESTS`                                                                                                | `100`                                   | `100`                                         | none — parity with ACC (see §3.3)                                                                                                                                                                   |
| `TRUST_PROXY`                                                                                                            | `true`                                  | `true`                                        | none — so the "one shared budget per deployment" caveat in PUBLIC-SITE-GO-LIVE §7b does **not** apply                                                                                               |
| PROD-only legacy (`DSO_*`, `ENABLE_*`, `OPENAI_API_KEY`, `OPERATON_URL`, `RONL_SPARQL_ENDPOINT`, `MEDIA_AGGREGATOR_*` …) | present                                 | absent                                        | leave                                                                                                                                                                                               |

Two cosmetic observations. Neither blocks, but both are worth an issue:

- `LOG_FILE_PATH` is `C:/Program Files/Git/home/site/wwwroot/logs` on **both**
  tiers. This is Git Bash path conversion from when it was set; on Linux it is a
  literal relative path.
- `health.routes.ts:165-167` hardcodes `acc.cprmv…/docs` and
  `acc.linkeddata…` links, which PROD will serve too.

### 4.2 Database — nothing to do

All DDL is idempotent and runs at boot: `CREATE TABLE IF NOT EXISTS` for
`pa_dossiers`, `pa_dossier_versions`, `pa_templates`, `pa_snippets`,
`pa_saved_searches`, `pa_signals`, `pa_notifications` and `pa_feed_tokens`, plus
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` for `pa_signals.{subbron, commissie,
routing, regio, sentiment}` and `pa_saved_searches.{notify, source_search_id}`.
PROD's database already has the tables 3.8.2 created, and the new columns apply
themselves. 3.8.2 ignores them, so this is rollback-safe.

One unknown: whether 3.8.2 seeded fixture dossiers into PROD's `pa_dossiers`
(the seed stopped on `acc` in 2026.08.22). Look after the deploy, in live mode.

### 4.3 Keycloak — PROD realm `ronl` at `keycloak.open-regels.nl`

Realm-file delta `main` → `acc` (`config/keycloak/ronl-realm.json`):

| Change                                                                            | Needed on PROD?                                                                                              | How                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| +28 `rip-*` realm roles (34 in total)                                             | **yes** — without them 113 of the ladder's 201 user tasks are filtered out (`docs/RIP-ROLE-VOCABULARIES.md`) | `scripts/keycloak-add-rip-roles.sh`           |
| +3 protocol mappers on `ronl-business-api` (`email`, `given_name`, `family_name`) | **yes** — signing refuses with `MISSING_SIGNER_EMAIL` without `email`                                        | `scripts/keycloak-add-token-claim-mappers.sh` |
| +`edocs-mcp-client` (service account, audience mapper)                            | no — only if `EDOCS_MCP_ENABLED`                                                                             | skip                                          |

**Do not import the realm file.** Partial import with SKIP skips existing
definitions; with OVERWRITE it replaces whole clients and discards hand-set
redirect URIs, web origins and secrets. Both scripts talk to the narrow Admin API
endpoints instead, and are idempotent.

Context worth knowing: PROD's Keycloak was provisioned from the realm file in
early February. Between then and `main`, the file gained 23 roles, 14 test users
and 2 clients. PROD received those by hand or not at all — nothing in the repo
records which. The dry run below shows the RIP half. For the rest, check that
the accounts you will test with on PROD actually exist.

### 4.4 Operaton — nothing to do

ACC and PROD point at the **same** engine (`OPERATON_BASE_URL` and
`OPERATON_M2M_BASE_URL` are identical on both), so the twelve RIP process models
are already deployed. The backend deploys no BPMN itself. Side effect worth
remembering: RIP instances started from ACC live in the same engine,
tenant-scoped.

### 4.5 Static Web Apps, DNS and secrets for the two new sites

See Phase 2. One correction to `PUBLIC-SITE-GO-LIVE.md` §5: **`publiek` is not a
zone apex.** The zone is `open-regels.nl`, so `publiek.open-regels.nl` is an
ordinary `publiek` record, exactly like `acc.publiek` (a plain CNAME, which is
what ACC uses). No Alias record is needed.

---

## 5. The runbook

Checkboxes are for use on the day. Commands assume the repository root
(`~/Development/ronl-business-api`) and a Bash shell with `az`, `gh`, `jq` and
`curl`.

```bash
export C1427=24eac314-4634-4da2-85a5-35bdce38a384   # SWAs for public-site/pa-demo + DNS zone
export ZONE_RG=RG_PlatformRegelbeheer2025
```

### Phase 0 — Prep (no production impact)

- [ ] **0.1** D1–D6 on the runbook page still read as recorded in §1.
- [ ] **0.2 A clean working tree before 6.4.** `deploy-backend-to-prod.sh` aborts
      on _any_ `git status --porcelain` output, untracked files included. This
      document now lives in `acc` (#91), so it no longer counts — but any other
      stray file does.
- [ ] **0.3 A working Azure session.** `az account show` is not proof; the deploy
      script's own preflight explains why.

```bash
az logout && az login
az account set --subscription "PDR - C1380"
az webapp show -n ronl-business-api-prod -g rg-ronl-prod -o none && echo "ARM ok"
az staticwebapp list --subscription $C1427 -o none && echo "C1427 ok"
```

- [ ] **0.4** Have at hand: the PROD Keycloak admin credentials, the PROD M2M
      client secret (for the smoke test), and a GitHub session (`gh auth status`).
- [ ] **0.5 Local dependencies current:** `npm run deps:check`. If it asks for an
      install and dev servers are running, stop them yourself first — `npm ci`
      removes `node_modules` from under them.
- [ ] **0.6** Run [§10](#10-t-0-re-verification). If any head moved, re-run the
      trial merge before continuing.

### Phase 1 — Release cut on `acc` (D3)

- [ ] **1.0** Merge the pending `acc` PRs first — the Open Graph card (2B) and
      the decisions update to this document — so v2026.09.6 carries both.
- [ ] **1.1** `/bump-release` → it reconciles open PRs, writes the changelog
      entry, pushes a branch and opens a PR against `acc`.
- [ ] **1.2** Merge that PR (you). Wait for the ACC workflows to finish green.
- [ ] **1.3** Optional: `bash deploy-backend-to-acc.sh` from a clean `acc` so ACC
      reports the new version string too. The backend source is unchanged, so
      this is cosmetic.

### Phase 2 — Provision what must exist before the merge

#### 2A — Public site, production (D2: in scope)

Names follow the ACC pattern (`ronl-public-site-acc` /
`ronl-business-public-site-acc`). Confirm them before creating anything. Create
with no GitHub source, so Azure does not write a competing workflow into the
repo.

- [ ] Resource group and Static Web App:

```bash
az group create --subscription $C1427 -n ronl-public-site-prod -l westeurope
az staticwebapp create --subscription $C1427 \
  -n ronl-business-public-site-prod -g ronl-public-site-prod \
  -l westeurope --sku Standard
az staticwebapp show --subscription $C1427 -n ronl-business-public-site-prod \
  -g ronl-public-site-prod --query "{host:defaultHostname,provider:provider}"
```

- [ ] Deploy token straight into the repo secret, without it touching the
      terminal (`gh secret set` reads stdin when `--body` is absent):

```bash
az staticwebapp secrets list --subscription $C1427 \
  -n ronl-business-public-site-prod -g ronl-public-site-prod \
  --query properties.apiKey -o tsv \
  | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN_PUBLIC_SITE_PROD
gh secret list | grep PUBLIC_SITE_PROD
```

- [ ] DNS + custom domain. This can wait until after Phase 6.7, since the site
      works on its default hostname. DNS alone is not enough — the hostname must
      also be registered on the resource, or you get a name that resolves and is
      not served. The managed certificate follows validation.

```bash
HOST=$(az staticwebapp show --subscription $C1427 -n ronl-business-public-site-prod \
         -g ronl-public-site-prod --query defaultHostname -o tsv)
az network dns record-set cname set-record --subscription $C1427 \
  -g $ZONE_RG -z open-regels.nl -n publiek -c "$HOST"
az staticwebapp hostname set --subscription $C1427 \
  -n ronl-business-public-site-prod -g ronl-public-site-prod \
  --hostname publiek.open-regels.nl
```

#### 2B — PA demo, production (D2: in scope)

- [ ] **Re-capture the Open Graph card first.** The shipped
      `packages/pa-demo/public/og-pa-demo.png` has **ACCEPTATIEOMGEVING** and
      `acc.plato.open-regels.nl` baked into its pixels (checked by viewing the
      file). Follow `PA-DEMO-GO-LIVE.md` §3b and land it on `acc` through a PR
      _before_ Phase 1, so v2026.09.6 carries it.
- [ ] Resource group, Static Web App and deploy token — the same pattern as 2A:

```bash
az group create --subscription $C1427 -n ronl-pademo-site-prod -l westeurope
az staticwebapp create --subscription $C1427 \
  -n ronl-business-pademo-site-prod -g ronl-pademo-site-prod \
  -l westeurope --sku Standard
az staticwebapp secrets list --subscription $C1427 \
  -n ronl-business-pademo-site-prod -g ronl-pademo-site-prod \
  --query properties.apiKey -o tsv \
  | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN_PA_DEMO_PROD
gh secret list | grep PA_DEMO_PROD
```

- [ ] **Move `plato` only after 6.8 has verified the new site on its default
      hostname.** Three steps, in this order: take the hostname off your older
      "Parlementair Dashboard" SWA (it lives in a subscription this `az` login
      does not list — use the portal, or `az staticwebapp hostname delete` from
      the account that owns it), then repoint the CNAME, then register the
      hostname on the new SWA. Azure will not bind a hostname another SWA still
      holds, and `plato` is unavailable from the first step until the new
      certificate is issued.

```bash
HOST=$(az staticwebapp show --subscription $C1427 -n ronl-business-pademo-site-prod \
         -g ronl-pademo-site-prod --query defaultHostname -o tsv)
az network dns record-set cname set-record --subscription $C1427 \
  -g $ZONE_RG -z open-regels.nl -n plato -c "$HOST"
az staticwebapp hostname set --subscription $C1427 \
  -n ronl-business-pademo-site-prod -g ronl-pademo-site-prod \
  --hostname plato.open-regels.nl
```

#### 2C — `main promotion gate` ruleset (D4)

- [ ] Save as `main-ruleset.json` outside the repo. It mirrors LDE's, which is
      verified working:

```json
{
  "name": "main promotion gate",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["merge"],
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "require_extra_approval_for_unattributed_changes": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [{ "context": "audit" }]
      }
    }
  ]
}
```

- [ ] Create it, then **read it back** — omitted parameters are not false:

```bash
gh api -X POST repos/sgort/ronl-business-api/rulesets --input main-ruleset.json --jq .id
gh api repos/sgort/ronl-business-api/rulesets/<id> \
  --jq '{name, conditions, rules: [.rules[] | {type, parameters}]}'
```

Check that `require_extra_approval_for_unattributed_changes` is `false` and that
`audit` is the **only** required check. `audit` is safe to require because
`zizmor.yml` triggers on a bare `pull_request:`. Do **not** require any deploy
workflow: they are push-only and would never report on the PR, wedging it
permanently. Do not test the ruleset by pushing to `main` — the promotion PR
proves it (Phase 5.4).

### Phase 3 — PROD App Service prep (live, low risk; 3.8.2 keeps serving)

#### 3.1 Take a rollback artifact

SCM basic auth is disabled, so use an Entra ID bearer token. This path has
**not** been exercised on this App Service yet. If it fails, fall back to the
rebuild route in §6.

```bash
TOKEN=$(az account get-access-token --query accessToken -o tsv)
OUT=~/rba-prod-wwwroot-3.8.2-$(date +%F).zip
curl -fSL -H "Authorization: Bearer $TOKEN" -o "$OUT" \
  https://ronl-business-api-prod.scm.azurewebsites.net/api/zip/site/wwwroot/
unzip -l "$OUT" | tail -1                   # thousands of entries (node_modules)
unzip -l "$OUT" | grep -c 'dist/index.js'   # ≥ 1
```

- [ ] Backup present and non-trivial.

#### 3.2 Node 22

```bash
az webapp config set -n ronl-business-api-prod -g rg-ronl-prod --linux-fx-version "NODE|22-lts" -o none
az webapp config show -n ronl-business-api-prod -g rg-ronl-prod --query linuxFxVersion -o tsv
# give it a minute to restart, then:
curl -s https://api.open-regels.nl/v1/health | jq '.data | {version, status}'   # 3.8.2, healthy
```

- [ ] 3.8.2 healthy on Node 22. It already depends on `operaton-mcp`, which
      wants 22, so this is the direction it needs anyway.

#### 3.3 Settings

This restarts the app. `LDE_API_URL` is new and 3.8.2 does not read it;
`CORS_ORIGIN` gains `publiek` and loses `http://localhost:5173` (D5).

```bash
az webapp config appsettings set -n ronl-business-api-prod -g rg-ronl-prod -o none --settings \
  LDE_API_URL=https://backend.linkeddata.open-regels.nl/v1 \
  "CORS_ORIGIN=https://mijn.open-regels.nl,https://publiek.open-regels.nl"
az webapp config appsettings list -n ronl-business-api-prod -g rg-ronl-prod \
  --query "[?name=='CORS_ORIGIN' || name=='LDE_API_URL'].{n:name,v:value}" -o table
```

- [ ] Both read back correctly: `CORS_ORIGIN` is exactly
      `https://mijn.open-regels.nl,https://publiek.open-regels.nl`.

#### 3.4 Boot-blocking names present

```bash
az webapp config appsettings list -n ronl-business-api-prod -g rg-ronl-prod --query "[].name" -o tsv \
  | grep -xE 'DATABASE_URL|OPERATON_BASE_URL|KEYCLOAK_CLIENT_SECRET|ANTHROPIC_API_KEY' | sort
```

- [ ] All four listed (they were on 11 Sep).

### Phase 4 — PROD Keycloak (additive; do before anyone tests)

```bash
# GRANT_USER defaults to test-infra-flevoland (D6). Look first — creates nothing:
KEYCLOAK_URL=https://keycloak.open-regels.nl ADMIN_USER=<admin> \
  bash scripts/keycloak-add-rip-roles.sh --dry-run
# Then for real (omitting ADMIN_PASSWORD makes it prompt — keeps it out of history):
KEYCLOAK_URL=https://keycloak.open-regels.nl ADMIN_USER=<admin> \
  bash scripts/keycloak-add-rip-roles.sh
# Token-claim mappers (no --dry-run flag; idempotent, touches only the three mappers):
KEYCLOAK_URL=https://keycloak.open-regels.nl ADMIN_USER=<admin> \
  bash scripts/keycloak-add-token-claim-mappers.sh
```

- [ ] The dry run should report 28 roles to create and 28 to grant to
      `test-infra-flevoland`. If the admin account lives in `ronl` rather than
      `master`, add `ADMIN_REALM=ronl`.
- [ ] Roles created and granted: `test-infra-flevoland`'s Role mapping on PROD
      reads **1–37**, as on ACC.
- [ ] Mappers added.
- [ ] Grants only reach a user on their **next** token: sign out and back in
      before judging the Infra board.

### Phase 5 — Promotion branch and PR

Why a promotion branch rather than a PR straight from `acc`: to make the merge
land on `false` (D1 = live), the flip has to be a change _relative to `main`_.
`acc` already reads `false`, which is identical to the merge base, so git will
not prefer it. Merging `main` into the promotion branch first moves the merge
base to `main`'s head, and the flip then wins. It also keeps
`delete_branch_on_merge` away from `acc`.

- [ ] **5.1** Build the branch. The merge is clean and brings `main`'s 7 commits;
      `.env.production` then reads `true`.

```bash
git fetch --prune origin
git switch -c promote/2026-09-12 origin/acc
git merge --no-ff origin/main -m "chore: merge main into the promotion branch"
```

- [ ] **5.2** Apply D1. Both commits in this phase are commits on a working
      branch: confirm each one when it comes up.

```bash
# D1 = live (decided):
sed -i 's/^VITE_PA_DOSSIERS_MOCK=true$/VITE_PA_DOSSIERS_MOCK=false/' packages/frontend/.env.production
git diff                                   # exactly one line
git commit -am "fix(frontend): PROD reads live PA data by default"
git diff --stat origin/acc                 # expect empty: the branch's tree now equals acc
```

- [ ] **5.3** Push and open the PR. The title becomes the merge commit's subject
      (`merge_commit_title=PR_TITLE`, message blank), so it **must not contain a
      CI-skip marker**. Adjust the version if D3 was skipped.

```bash
git push -u origin promote/2026-09-12
gh pr create --base main --head promote/2026-09-12 \
  --title "chore: promote acc to main (v2026.09.6)" \
  --body "Promotion of acc to production. Runbook: docs/promote-ACC-to-PROD.md. PA mock decision (D1): <live|mock>."
```

- [ ] **5.4** Read the gate:
      `gh pr view <n> --json mergeStateStatus,statusCheckRollup`. With 2C in place
      it reads `BLOCKED` while `audit` runs, then clears. That is the ruleset
      proving itself. `audit` is the only check the PR gets: the production
      workflows are push-only, and backend tests do not run on PRs (#87). The
      identical backend tree last passed its full suite on `acc` at `04e38c8`.

### Phase 6 — The merge window (in this order)

#### 6.1 Disable the three production SWA workflows

```bash
gh workflow disable azure-frontend-prod.yml
gh workflow disable azure-publicsite-prod.yml
gh workflow disable azure-pa-demo-prod.yml
gh workflow list --all | grep -i production
```

Why: all three fire on the merge push. The frontend would deploy before the
backend, and the public site would prerender against 3.8.2 (`/v1/public/processen`
returns 404 on PROD today) and fail. A disabled workflow drops the push event and
nothing replays later, which is exactly what we want: each one is dispatched by
hand. **Leave enabled** `azure-backend-prod.yml` (build + tests only — it gives
`main` its first test run of the new code) and `zizmor.yml`.

- [ ] Three workflows report `disabled_manually`.

#### 6.2 Merge the PR

- [ ] You, in the GitHub UI, with "Create a merge commit" (the only method
      enabled).

#### 6.3 Local `main` to the merge commit

```bash
git fetch --prune origin
git switch main
git merge --ff-only origin/main
git status --porcelain      # must print NOTHING (see 0.2)
git log -1 --format='%h %s'
```

- [ ] Local `main` = `origin/main`, clean.

#### 6.4 Deploy the backend

In a second terminal: `az webapp log tail -n ronl-business-api-prod -g rg-ronl-prod`.

```bash
bash deploy-backend-to-prod.sh
```

The script runs its preflights (branch `main`, clean tree, archiver, a real ARM
call), builds `@ronl/shared` and the backend with your local Node (v22.22.0),
installs production dependencies **without a lockfile** (#34 — resolved today,
not the tree ACC runs), zips, and runs `az webapp deploy`. In the log tail, watch
for a `validateConfig` error (boot-blocking) and for the first EU and cache lines.

- [ ] Script ends `✅ Done — ronl-business-api-prod deployed successfully`.

#### 6.5 Smoke-test the backend — the go/no-go gate

```bash
curl -s https://api.open-regels.nl/ | jq '{version, environment, endpoints: (.endpoints|length)}'
#   → 2026.09.x, production, 17
curl -s https://api.open-regels.nl/v1/health | jq '.data | {version, status, environment, deps: (.dependencies|keys)}'
#   → healthy; deps include "cache"
curl -s -o /dev/null -w '%{http_code}\n' https://api.open-regels.nl/v1/public/processen
#   → 200
TARGET=acc BASE_URL=https://api.open-regels.nl KEYCLOAK_URL=https://keycloak.open-regels.nl \
  CLIENT_SECRET=<prod-m2m-secret> bash scripts/test-smoke-live.sh
#   (the script has no prod preset; TARGET=acc picks the non-local path, the two URLs override it)
gh run list --workflow azure-backend-prod.yml --limit 1
```

- [ ] All green → continue. **Not green → [§6](#6-rollback) now.** The
      frontends are still 3.8.2 and consistent with a rolled-back backend.
- [ ] If the backend-prod CI run failed on a test, re-run that test **in
      isolation** before calling it a defect. A parallel-only failure is
      contention until proven otherwise.

#### 6.6 Caseworker frontend

The workflow runs pa-cockpit tests, frontend tests, the performance budget and
`build:prod`, then deploys.

```bash
gh workflow enable azure-frontend-prod.yml
gh workflow run azure-frontend-prod.yml --ref main
sleep 5; gh run list --workflow azure-frontend-prod.yml --limit 1   # note the id
gh run watch <id>
```

- [ ] Hard-refresh `https://mijn.open-regels.nl`. The changelog drawer reads
      **`build <first 7 of the main merge sha> · #<run number>`**. This is the
      first time the provenance `env:` block has run on RBA production (the one
      open item `ci-posture-across-repos.md` §1 lists for this repository).
      **`local build`** would mean the block never reached the artifact; a green
      run proves nothing about it.

#### 6.7 Public site

```bash
gh workflow enable azure-publicsite-prod.yml
gh workflow run azure-publicsite-prod.yml --ref main
```

- [ ] Green. Its prerender now reads the 2026.09.x API.
- [ ] On the SWA default hostname: home, `/regels`, a detail page, and a footer
      showing the build id (#90) and `publiek.open-regels.nl`.
- [ ] `E2E_BASE_URL=https://<default-host> npm run test:e2e -w @ronl/public-site`
- [ ] Bind the domain (2A DNS step), then repeat the e2e run against
      `https://publiek.open-regels.nl`.

#### 6.8 PA demo

- [ ] Same as 6.7 with `azure-pa-demo-prod.yml`, then
      `E2E_BASE_URL=https://<default-host> npm run test:e2e --workspace=@ronl/pa-demo`.
- [ ] Move the `plato` hostname (the three 2B steps), then repeat the e2e run
      against `https://plato.open-regels.nl`.
- [ ] The link preview for `plato.open-regels.nl` reads production, not
      ACCEPTATIEOMGEVING.

### Phase 7 — Functional verification on PROD (by eye)

- [ ] Log in to the caseworker app with one account per role; each dashboard
      loads.
- [ ] **Infra board**: the Faseladder shows twelve phases; a RIP-role user (after
      re-login) sees tasks; the swimlane diagrams render.
- [ ] **PA cockpit**: the Dossierbeheer banner reports the mode chosen in D1;
      Monitoring → Europa returns items (English, sourced from
      `data.europarl.europa.eu`); Ongefilterd browses raw feeds; WatchBell toggles.
- [ ] `/v1/health` reports `dependencies.cache`.
- [ ] Optional: a ValidSign **stub** ceremony on an R2.1 phase-exit approval.
- [ ] The changelog drawer lists 3.8.3 → 2026.09.x.
- [ ] Tick the **#71** acceptance criteria and attach the evidence (health JSON,
      an EU item, the D1 decision).

### Phase 8 — Close-out

- [ ] All four production workflows are enabled again
      (`gh workflow list --all` shows nothing `disabled_manually`).
- [ ] **Housekeeping** (per the global rules):

```bash
git fetch --prune origin
git switch acc && git merge --ff-only origin/acc
git switch main && git merge --ff-only origin/main
git merge-base --is-ancestor promote/2026-09-12 origin/main && git branch -d promote/2026-09-12
git worktree list; git stash list
```

- [ ] **GitLab mirror** — fast-forward only, pushing the remote-tracking refs
      rather than local branches. Decide separately whether to delete GitLab's
      merged `feat/public-pa-cockpit`.

```bash
git fetch gitlab
git merge-base --is-ancestor gitlab/acc  origin/acc  && \
git merge-base --is-ancestor gitlab/main origin/main && echo "ff-safe"
git push gitlab origin/acc:refs/heads/acc
git push gitlab origin/main:refs/heads/main
git ls-remote gitlab refs/heads/acc refs/heads/main
git ls-remote origin refs/heads/acc refs/heads/main       # heads must match
```

- [ ] **Docs:** tick `PUBLIC-SITE-GO-LIVE.md` §2/§3/§5/§7 and correct its apex
      claim (§4.5 above), its "rate limit shared per deployment" caveat, and its
      §7c "already false, just confirm". Tick `PA-DEMO-GO-LIVE.md`. Update the RBA
      rows in LDE's `ci-posture-across-repos.md` (production build id exercised;
      mirror synced).
- [ ] Close **#71**; comment on **#54** (§9).
- [ ] Report the deploy runs (backend-prod CI, frontend, public-site, pa-demo).

---

## 6. Rollback

**Triggers:** a backend boot loop (`validateConfig`), `/v1/health` unhealthy,
login broken, or widespread 5xx. Reverse in the opposite order of the deploy.

| Layer                 | How                                                                                                                                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend               | `az webapp deploy -n ronl-business-api-prod -g rg-ronl-prod --src-path ~/rba-prod-wwwroot-3.8.2-<date>.zip --type zip`. Keep Node 22. **If the 3.1 backup failed:** `git switch main && git reset --hard d6a3cee` (local only), `bash deploy-backend-to-prod.sh`, then `git reset --hard origin/main` |
| Caseworker frontend   | Nothing to undo before 6.6. After it: push a ref at the old head, `git push origin d6a3cee:refs/heads/rollback/prod-3.8.2`, then `gh workflow run azure-frontend-prod.yml --ref rollback/prod-3.8.2`. `main` had that workflow on 17 July. The permanent fix is a revert PR against `main`            |
| Public site / PA demo | Unbind the domain or disable the workflow; there was nothing there before                                                                                                                                                                                                                             |
| App settings          | Additive (`LDE_API_URL`, one CORS origin) — leave                                                                                                                                                                                                                                                     |
| Node 22               | Leave — 3.8.2 wants it too                                                                                                                                                                                                                                                                            |
| Keycloak              | Additive roles and mappers — leave                                                                                                                                                                                                                                                                    |
| Database              | Additive tables and columns, ignored by 3.8.2 — leave                                                                                                                                                                                                                                                 |

With the D4 ruleset in place, nobody can push to `main` directly. A revert
travels as a PR like everything else.

---

## 7. Risks and gotchas

| #   | Risk                                                                                                                        | Mitigation                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | The clean merge keeps `VITE_PA_DOSSIERS_MOCK=true` → the whole cockpit mock                                                 | D1, Phase 5.2                                                       |
| 2   | PROD on Node 20; `operaton-mcp` needs ≥ 22                                                                                  | Phase 3.2                                                           |
| 3   | Dirty tree (any untracked file) aborts the deploy script                                                                    | Phase 0.2                                                           |
| 4   | Frontends deploy before the backend on the merge push                                                                       | Phase 6.1                                                           |
| 5   | Public-site prerender vs PROD API 404                                                                                       | Backend first (6.4 before 6.7)                                      |
| 6   | Missing SWA token secrets → red deploy steps                                                                                | Phase 2A/2B, or keep disabled                                       |
| 7   | `plato.open-regels.nl` is still bound to your older SWA                                                                     | Remove it there first, after 6.8 checks out (Phase 2B)              |
| 8   | PA-demo OG card reads ACCEPTATIEOMGEVING                                                                                    | Phase 2B recapture                                                  |
| 9   | `LDE_API_URL` default is the ACC LDE → PROD silently proxies ACC data                                                       | Phase 3.3                                                           |
| 10  | RIP roles missing → tasks invisible; mappers missing → `MISSING_SIGNER_EMAIL`                                               | Phase 4                                                             |
| 11  | Deploy bundle resolved without a lockfile (#34)                                                                             | Accepted for tomorrow; fixed properly by #35                        |
| 12  | A missing required env var → boot loop                                                                                      | Phase 3.4 (names verified 11 Sep)                                   |
| 13  | A CI-skip marker in the PR title suppresses the main-branch runs                                                            | Title in 5.3 is clean; body never reaches the merge commit          |
| 14  | Requiring a push-only check on `main` wedges the PR                                                                         | Require only `audit`                                                |
| 15  | Ruleset created with `require_extra_approval_for_unattributed_changes` defaulting to `true`                                 | Set `false` explicitly; read back                                   |
| 16  | A test flakes in a production CI run under parallel load                                                                    | Re-run in isolation before concluding                               |
| 17  | ACC and PROD share one Operaton engine                                                                                      | Known; read RIP counts with that in mind                            |
| 18  | Older docs are wrong in places (#71's merge claim; PUBLIC-SITE-GO-LIVE §5 apex, §7b rate-limit caveat, §7c "already false") | This document supersedes them for tomorrow; correct them in Phase 8 |

---

## 8. After PROD: aligning CI with the cross-repo posture

`ci-posture-across-repos.md` (in linked-data-explorer) describes how ttl-editor
and LDE were brought to one posture in September 2026. Where RBA stands,
re-checked against its `acc` today:

|                                  | ttl-editor | LDE    | **RBA today**                                                      | Target / work item |
| -------------------------------- | ---------- | ------ | ------------------------------------------------------------------ | ------------------ |
| Build id in the changelog        | ✅         | ✅     | ✅ ACC; PROD exercised tomorrow (6.6)                              | —                  |
| `main` protected by a ruleset    | PR only    | ✅     | ❌ classic, force-push allowed                                     | C1                 |
| `acc` ruleset: deletion + non-ff | —          | ✅     | ❌ PR + `audit` only                                               | C1                 |
| Backend tests before merge       | ✅         | ✅     | ❌ push-only (#87)                                                 | C2                 |
| check-supply-chain blocking      | ✅         | ✅     | ⚠️ `continue-on-error` (#83)                                       | C3                 |
| Formatting checked in CI         | ✅         | ✅     | ❌ pre-push hook only                                              | C4                 |
| Semgrep Code + Supply Chain      | ✅         | ✅     | ❌ no workflow, no token                                           | C5                 |
| Renovate lock-file maintenance   | ❌         | ✅     | ❌ none; global `dependencyDashboardApproval: true`                | C6                 |
| One Node version                 | —          | ⚠️ #80 | ❌ workflows 20, `.nvmrc` 22, App Services 22 after tomorrow (#36) | C7                 |
| Mirror in sync                   | ✅         | ✅     | ⚠️ synced 11 Sep and in Phase 8; nothing keeps it so               | C8                 |
| Per-file 80 % branch floor       | ✅         | ✅     | ✅ five runners                                                    | C10 loose ends     |

Order of work, cheapest and highest-leverage first. Each item follows the
pattern the other two repositories proved: **make the gate fail once on purpose,
and confirm the failure names the file or the action**, before trusting a green
run.

**C1 — Rulesets.** If D4 was not done tomorrow, do it first. Then add the
`deletion` and `non_fast_forward` rules to `acc supply-chain gate` (a `PUT` with
the full rules array; read it back). Record in `SECURITY-PIPELINE.md` that `acc`
and `main` differ by the unattributed-changes parameter on purpose.

**C2 — #87, backend tests on pull requests.** Add a `pull_request` trigger to
`azure-backend-acc.yml` with the same paths. Nothing in the job has an external
side effect, so no `if:` guards are needed. Decide the `environment:` question
(the recommended conditional is
`${{ github.event_name == 'push' && 'acc' || '' }}`), and write the
production-exclusion reasoning into `azure-backend-prod.yml`. Unlike the SWA
workflows, the backend holds no Static Web Apps staging slot, so its filter can
safely include the root `package.json` and `package-lock.json`; then
lockfile-only changes get tested (LDE #97). Prove it with a probe file below
80 % branches, and check that the PR check fails naming it.

**C3 — #83, check-supply-chain blocking.** The register habit has not been
exercised here yet, and a bump is waiting: **`zizmorcore/zizmor-action` v0.6.4**
sits under _Pending Status Checks_ on the Dependency Dashboard (#16). Force it via
its checkbox, update `SECURITY-PIPELINE.md` on that PR's branch before merging,
and confirm `audit` is green there. Then remove `continue-on-error: true`, with a
comment and register note saying why it started non-blocking. C5 adds a
`uses: actions/checkout`, which moves the `(×N)` count and the totals headline:
that is a second, self-made exercise.

**C4 — Formatting in CI.** Add `npm ci` + `npm run check-format` to the `audit`
job, each with `if: always()`, placed before the supply-chain step. RBA's
pre-push hook runs the **root** `check-format` script
(`prettier --check "**/*.{ts,tsx,json,md}" --ignore-path .gitignore`), so the
root command _is_ the right one here. Do not copy LDE's per-workspace fan-out.
Run it locally first; any existing drift gets fixed on the same PR. While there,
note that Prettier 3.8 mangles fenced code blocks nested inside markdown list
items. This document keeps its fences at the top level for that reason, and
other docs should too.

**C5 — Semgrep.** Port LDE's `semgrep.yml` as it is: unfiltered `pull_request`,
push on `acc`/`main`, cancel only on pull requests, `semgrep==1.176.1` in a venv,
`--no-suppress-errors`, `fetch-depth: 0`. Create `SEMGREP_APP_TOKEN` (Agent/CI
scope), and let the first **push** run create the `sgort/ronl-business-api`
project, not a laptop. Derive `.semgrepignore` for RBA rather than copying it:
`/examples/` anchored (a root `examples/` exists), `*.test.ts`, `*.test.tsx`,
and the restored `test/` / `tests/` defaults. **Check the set, not the count** —
diff the scanned file lists with and without the file. Run it as a reporting
check, triage the baseline with every suppression in code (`nosemgrep` with a
reason and an expiry condition), then add `scan` to both rulesets. Register the
pip pin in `SECURITY-PIPELINE.md`.

**C6 — Renovate.** Supersede draft PR #20 (183 behind `acc`) rather than rebasing
it:

- drop the global `dependencyDashboardApproval`;
- keep **majors** behind approval with a `packageRules` entry (LDE's fix for a
  queue starved by majors);
- add `lockFileMaintenance` with a weekly schedule, not grouped;
- set `vulnerabilityAlerts.dependencyDashboardApproval: false`;
- size `prConcurrentLimit` against **`ronl-business-frontend-acc` being on the
  Free plan** (3 staging environments). The two C1427 ACC sites are Standard.

The `audit` job's `renovate-config-validator --strict` validates the result.

**C7 — #36, one Node.** After tomorrow both App Services and your machine are on
22, and `operaton-mcp` requires it. Settle on 22: `node-version-file: .nvmrc` in
the eight deploy workflows (leave the validator's pinned 24 alone), and raise
`engines.node` to `>=22` so it stops understating what the backend needs.

**C8 — Mirror discipline.** Add the four-second `git ls-remote` comparison of
both remotes to `/bump-release`'s closing steps, so drift is seen at each release
rather than months later.

**C9 — #35 → #34 → #38, backend deploy in a workflow.** This is the largest item
and wants its own design. One fact changes #35's plan: **SCM basic auth is
disabled on both RBA App Services** (verified), so the publish-profile route that
works for LDE would fail here unless re-enabled per app. Prefer OIDC
(`azure/login`, a federated credential, `id-token: write`) over re-enabling
basic auth. A workflow deploy installs from the lockfile, which closes #34 and
makes #38 moot.

**C10 — Coverage loose ends.**

- #84: keep `@ronl/shared` declarations-only and enforce it with a check that
  names the file and says where the logic belongs.
- #85: delete the unreachable `PHASE_NOT_MODELLED` branch and its three skipped
  tests, and make `processDefinitionKey` required now that the ladder is closed.

**C11 — Keep the prose true.** `docs/the-gate-has-teeth.md` §4 still says "every
PR to `acc` redeploys three sites (no `paths:` filter)". The filters landed in
2026.08.34. Update it, `SECURITY-PIPELINE.md`, and LDE's cross-repo table as each
item lands.

---

## 9. Open issues walkthrough

23 open issues plus draft PR #20, as of 11 September.

### 9.1 Closed or moved by the promotion

| #   | Title (short)                         | Assessment                                                                                                                                    | Action                                               |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 71  | Bring `main` up to date with `acc`    | This runbook. Its merge-direction claim is inverted (§1 D1)                                                                                   | Close after Phase 7 with evidence; correct the claim |
| 54  | EU signaalbron returns nothing on ACC | Root cause is external (europarl refuses ACC's egress). Plenary fixed by #55, which reaches PROD tomorrow                                     | Close as resolved by #55; #57 carries the rest       |
| 57  | `ep-teksten` blocked on ACC           | Still open. After promotion PROD also runs `ep-teksten`, which works from `20.73.x` today — so PROD may populate `commissie` while ACC cannot | Keep. Do the overlap measurement from PROD as well   |

### 9.2 CI and pipeline — §8 order

| #   | Title (short)                                   | Maps to | Note                                                                                                                       |
| --- | ----------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| 87  | Backend runs no tests on PRs                    | C2      | small; do first                                                                                                            |
| 83  | check-supply-chain blocking                     | C3      | **unlabelled — add `ci`**; exercise on the zizmor-action bump                                                              |
| 36  | Pin the Node runtime                            | C7      | the target is 22                                                                                                           |
| 35  | Backend deploy in a workflow                    | C9      | basic auth is disabled — OIDC                                                                                              |
| 34  | Pin the deploy bundle's dependencies            | C9      | dissolved by #35                                                                                                           |
| 38  | package.json-only change triggers backend build | C9      | dissolved by #35; the interim filter tweak is optional                                                                     |
| 37  | PR previews cannot reach the backend            | —       | needs CORS for preview origins and Keycloak redirects; after C9, as the issue suggests                                     |
| 84  | `@ronl/shared` has no test runner               | C10     | option 2 (declarations-only, enforced)                                                                                     |
| 85  | Unreachable `PHASE_NOT_MODELLED` branch         | C10     | option 1 (delete + narrow the type)                                                                                        |
| 69  | R5.3 is re-enterable, nothing exercises it      | —       | labelled `ci` but is a RIP modelling/test gap: relabel; a `--variant` for the walkthrough script plus readiness-rule tests |

### 9.3 Small defects — good fillers between larger items

| #   | Title (short)                                       | Recommendation                                                                                                                                                     |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 67  | Root advertises `/v1/docs`, which was never mounted | PROD has advertised it since the first commit and still will. Quick honest fix: drop the field and the log line; serving an OpenAPI document is a separate feature |
| 61  | `tk.client` unreachable multi-term arm              | Replace the arm with a throw that names the fan-out (keeps the invariant executable)                                                                               |
| 78  | Two Infra-board hooks fetch 3× each                 | Extend the existing provider; re-check every consumer renders inside it                                                                                            |

### 9.4 Features

| #   | Title (short)                                                      | Assessment                                                                                                                                            |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 73  | Reuse the BPMN-derived process diagram in the Caseworker dashboard | Unblocked (#72 landed in 2026.09.4). Contextual first, addressed by `processDefinitionId`, not key                                                    |
| 13  | Present rules inside their published ruleset                       | External request (bkaptijn, 7 Aug), **no labels, no reply yet**. The public Regelcatalogus goes live on PROD tomorrow, which makes these more visible |
| 12  | Filter and drill-down on the public catalogue                      | Partly started: 2026.08.0 added rule drill-down, 2026.08.19 DMN download. Build after #13's ruleset tab                                               |
| 14  | Follow `cprmv:isBasedOn` to legal rulesets and their services      | Builds on #13 + #12; needs the relation in the data and a cycle-safe walk                                                                             |

Suggested: label 12–14 `enhancement`, reply with the order **#13 → #12 → #14**
and what already exists, and scope #13 first.

### 9.5 Parked branches

| #   | Branch                           | Recommendation                                                                                                                                                                                                                                                         |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 47  | `feature/custom-connector-x-api` | Not superseded, but ~640 behind now. Rebuild against `EdocsMcpProvider` **when Copilot Studio is actually needed**, with a separate security review of the API-key middleware (it bypasses Keycloak). Until then it stays parked; the tip SHA is recorded in the issue |
| 48  | `docs/custom-connector-plan`     | Superseded code. Salvage the `ad951a4` plan document if it still reflects intent (the Azure OpenAI provider question is open), then delete the branch                                                                                                                  |

### 9.6 Dependency Dashboard (#16) and PR #20

- **Pending approval:** ~35 updates, mostly majors (React, Express 5, ESLint 10,
  Jest 30, TypeScript 7, Vite 8, Tailwind 4, Node 24, …). C6 turns this into a
  managed queue.
- **Pending status checks:** zizmor-action v0.6.4 (**use for C3**), the zizmor
  image 1.30.1 (hand-pinned `version:` input — bump alongside), `@anthropic-ai/sdk`
  ^0.125.0, vitest 5 (major), and **`quay.io/keycloak/keycloak` 26**. The last
  touches `deployment/vm/keycloak/{acc,prod}/docker-compose.yml`: Keycloak 23 → 26
  is a server migration, not a routine bump. Do not merge it casually.
- **Deprecation:** `@types/uuid`. `uuid` ships its own types; remove the package.
- **PR #20:** superseded by C6. Close it with a pointer.

### 9.7 Suggested sequence after tomorrow

1. **Day of:** the promotion; close #71; comment on #54.
2. **Next:** C1 + C2 (#87) → C3 (#83, via the zizmor-action bump) → C4 → C5
   (Semgrep, reporting then required) → C6 (Renovate; close #20) → C7 (#36).
3. **Fillers:** #61, #67, #78, #85, #84.
4. **Then:** #57 (measure the overlap), #73, the catalogue trio #13 → #12 → #14.
5. **Own design:** C9 (#35 → #34, #38), then #37.

---

## 10. T-0 re-verification

Run these first thing tomorrow. The expected values are the state at the end of
11 September, after #91 and the mirror sync. `origin/acc` moves with every merged
PR (the decisions update, the Open Graph card, the release cut), so for `acc` the
checks that matter are the merge base and the trial merge, not the SHA. Any other
difference is not necessarily a problem, but it must be understood before Phase 5.

```bash
cd ~/Development/ronl-business-api
git fetch --prune origin && git fetch gitlab

git rev-parse --short origin/acc origin/main          # <last merged PR>, d6a3cee
git merge-base origin/acc origin/main                 # f7de4cf…
git log --oneline origin/acc ^origin/main | wc -l     # ≥ 640
git ls-remote gitlab refs/heads/acc refs/heads/main   # 6257df9… (until the next sync), d6a3cee…

curl -s https://api.open-regels.nl/ | jq -r .version       # 3.8.2
curl -s https://acc.api.open-regels.nl/ | jq -r .version   # 2026.09.5
az webapp config show -n ronl-business-api-prod -g rg-ronl-prod --query linuxFxVersion -o tsv   # NODE|20-lts

gh secret list | grep -E 'PROD'                       # only AZURE_STATIC_WEB_APPS_API_TOKEN_PROD
gh api repos/sgort/ronl-business-api/rulesets --jq '.[].name'   # "acc supply-chain gate" only
gh workflow list --all                                # 9 × active
gh pr list --state open                               # only #20 (draft)
```

If `origin/acc` or `origin/main` moved, redo the trial merge. It is read-only
apart from a temporary worktree:

```bash
S=$(mktemp -d)
git worktree add --detach "$S/tm" origin/main
git -C "$S/tm" -c user.name=trial -c user.email=trial@local merge --no-commit --no-ff origin/acc
git -C "$S/tm" diff --name-only --diff-filter=U        # expect nothing
git -C "$S/tm" diff origin/acc --stat                  # expect only packages/frontend/.env.production
git worktree remove --force "$S/tm" && git worktree prune
```
