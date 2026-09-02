# RIP roles: three vocabularies, one gap, and what closing it did not cover

Found on 2026-09-02 while correcting `RollenSection`'s role descriptions after
the RIP ladder was completed (R2.1 → R6.1, eleven modelled phases).

**The RIP process models addressed tasks to 34 candidate groups; the Keycloak
realm defined 6 of them. The measured effect was that 113 of the ladder's 201
user tasks — 56% — were never returned to the seeded infra user.**

Not "cannot claim". Not listed at all. `GET /v1/task` passes the caller's
Keycloak realm roles to Operaton as `candidateGroups`, so a task whose groups
all fall outside the caller's roles is filtered out before it reaches the
client. `task.routes.ts` states the assumption that made this invisible:

```ts
// Candidate groups in the BPMN map 1:1 to realm role names in this platform,
// so passing req.user.roles verbatim is correct.
```

The mapping was 6 of 34.

---

## The three lists

| List                  | What it is                                   | Source of truth             |
| --------------------- | -------------------------------------------- | --------------------------- |
| Keycloak roles        | What a person was granted                    | the realm — per environment |
| BPMN candidate groups | Who a task is addressed to                   | the deployed process models |
| `ROLE_DESCRIPTIONS`   | The line under each role on Rollen & rechten | `RollenSection.tsx`         |

They are easy to conflate because they share the `rip-` prefix. They are not
the same thing, and they are maintained separately even now that the first two
coincide.

### What it cost, before the fix

Counting each deployed model's user tasks against the roles the seeded
`test-infra-flevoland` held:

| Phase         | Tasks   | Visible | Invisible |
| ------------- | ------- | ------- | --------- |
| RipR21Process | 13      | 13      | 0         |
| RipR22Process | 9       | 3       | **6**     |
| RipR23Process | 12      | 6       | **6**     |
| RipR24Process | 18      | 13      | **5**     |
| RipR31Process | 12      | 12      | 0         |
| RipR32Process | 18      | 10      | **8**     |
| RipR41Process | 17      | 3       | **14**    |
| RipR51Process | 19      | 5       | **14**    |
| RipR52Process | 36      | 9       | **27**    |
| RipR54Process | 26      | 5       | **21**    |
| RipR61Process | 21      | 9       | **12**    |
| **Total**     | **201** | **88**  | **113**   |

It grew down the ladder: R4.1 onward was majority-invisible, and R5.2 — the
phase representing the whole execution period — showed 9 of its 36 tasks.

### Why nothing caught it

Only the task surfaces are affected, and the ones exercised most are not:

- **Affected**: Mijn dag and the infra task list, both reading `GET /v1/task`.
- **Not affected**: the Faseladder, its per-phase WIP and Gereed lists, and the
  portfolio. Those read `/v1/rip/phases/:code/active|completed`, which filter
  on the `municipality` process variable and never look at candidate groups.

The walkthrough scripts could not have surfaced it either: they complete tasks
straight over the Operaton REST API, which applies no candidate-group filter.

---

## What was changed

**`config/keycloak/ronl-realm.json`** — the 28 missing roles added and granted
to `test-infra-flevoland`, bringing the seed to 34 `rip-*` roles, matching the
ladder exactly. Applied as text edits rather than by re-serialising the JSON:
`json.dumps` reformats every `realmRoles` array in the file from one line to
many, turning a 28-role addition into a 470-line diff nobody can review.

**`RollenSection.tsx`** — every `rip-*` realm role now has a description.

The map is maintained **additively**, and that is a deliberate correction to a
first attempt at this change. An entry for a role that exists in no realm is
harmless — it simply never renders. A missing entry for a role a user _does_
hold degrades their page to a bare identifier. The first attempt removed
`rip-verkenner`, `rip-planner`, `rip-inkoop`, `rip-contractbeheer` and
`rip-toetser` for being absent from the seed file; a screenshot of ACC showed
`test-infra-flevoland` holding three of them. **The seed is one environment's
realm, not a mirror of all of them.** They were restored.

---

## What this does NOT cover

**Only the local seed was changed.** `config/keycloak/ronl-realm.json` is
imported when a local Keycloak is provisioned. ACC and production run their own
realms, and editing this file does not touch them.

So on ACC the gap stays open until the roles are created there too.
`scripts/keycloak-add-rip-roles.sh` does that against any Keycloak over the
Admin API, in preference to a realm import (SKIP policy skips what already
exists; OVERWRITE replaces whole definitions and would discard whatever ACC
configured by hand).

```bash
# Look first - creates nothing.
KEYCLOAK_URL=https://acc.keycloak.open-regels.nl \
  ADMIN_USER=<admin> \
  bash scripts/keycloak-add-rip-roles.sh --dry-run

# Then for real. Omitting ADMIN_PASSWORD makes it prompt, which keeps the
# password out of shell history.
KEYCLOAK_URL=https://acc.keycloak.open-regels.nl \
  ADMIN_USER=<admin> \
  bash scripts/keycloak-add-rip-roles.sh
```

It reads the role list from `config/keycloak/ronl-realm.json`, creates the ones
that are missing, grants them to `GRANT_USER` (default `test-infra-flevoland`;
set it empty to create roles without granting anyone), and re-reads the realm
afterwards to verify rather than trusting the status codes. Re-running is a
no-op.

Two things that will otherwise cost time:

- If the admin account lives in the application realm rather than `master`,
  pass `ADMIN_REALM=ronl`. The token error message says so explicitly.
- **A grant only reaches the user on their NEXT token.** Sign out and back in
  before judging whether the board changed.

**The two open modelling questions are unaffected by any of this.** Both were
already with the business owners, and both are about what the _candidate
groups_ should be:

1. Is `rip-beheerder` (R5.4, R6.1) the same party as
   `rip-beheerder-assetmanagement` (R2.1)? Two design sheets label the lane
   differently and the models followed each sheet.
2. Does an external party get a candidate group at all? `rip-opdrachtnemer` is
   the first non-internal party to occupy a lane — R5.2 gives the contractor
   eight activities of its own.

Both roles now exist, so answering either means removing or renaming one rather
than adding it. That is a smaller change than leaving them absent would have
been, and it does not block anything meanwhile.
