# RIP roles: three vocabularies, and a gap between two of them

Found on 2026-09-02 while correcting `RollenSection`'s role descriptions after
the RIP ladder was completed (R2.1 → R6.1, eleven modelled phases).

**28 of the 34 candidate groups the RIP process models address tasks to have no
corresponding role in Keycloak.** This is recorded rather than fixed, because
the resolution is an access-control decision for whoever owns the realm.

---

## The three lists

| List                   | Size       | What it is                                     | Source of truth                        |
| ---------------------- | ---------- | ---------------------------------------------- | -------------------------------------- |
| Keycloak `rip-*` roles | **6**      | What a user can be granted and can hold        | `config/keycloak/ronl-realm.json`      |
| BPMN candidate groups  | **34**     | Who a task is addressed to                     | The eleven deployed RIP process models |
| `ROLE_DESCRIPTIONS`    | 8 (was 10) | The line rendered under each of a user's roles | `RollenSection.tsx`                    |

They are easy to conflate because they share the `rip-` prefix and overlap in
six places. They are not the same thing: holding a role is about a person,
a candidate group is about a task.

### The six roles that exist

```
rip-aandrager        Aandrager: levert projectplan en intakeformulier aan
rip-ao               Ambtelijk opdrachtgever
rip-deelnemers-psu   Deelnemer project start-up (PSU)
rip-manager-pb       Manager planvoorbereiding
rip-projectleider    Projectleiding en decharge
rip-team             RIP-team
```

All six are also candidate groups, so they are the intersection rather than a
separate set. Their realm descriptions are all prefixed `RIP Fase 1 (R2.1)`,
written when R2.1 was the only modelled phase; they now appear across the
ladder, so the prefix is stale in the realm file too.

### The 28 with no role

```
rip-adviseur                         rip-manager-financien
rip-adviseur-veiligheid-gezondheid   rip-omgevingsmanager
rip-beheerder                        rip-ondersteuner
rip-beheerder-assetmanagement        rip-ontwerper
rip-communicatieadviseur             rip-opdrachtnemer
rip-concerndirecteur                 rip-pkt
rip-databeheerder                    rip-projectbeheersing
rip-deelnemers-evaluatie             rip-projectondersteuner
rip-directievoerder                  rip-technisch-administratief-medewerker
rip-financien                        rip-technisch-adviseur
rip-infra-overleg                    rip-toezichthouder
rip-inkoopadviseur                   rip-vestigingsmanager
rip-inkoopadviseur-werken            rip-kosten-contractdeskundige
rip-kostenadviseur                   rip-kwaliteit
```

R2.1 and R2.2 address tasks only to groups that exist. Every phase from R2.3
onward addresses tasks to groups that do not.

---

## What was fixed, and what was not

`ROLE_DESCRIPTIONS` was corrected against the realm. It had drifted badly:
only one of its seven `rip-*` entries described a role that exists, while five
of the six real roles had no description at all.

| Removed — described nothing that exists                                                            | Added — real roles with no description                                        |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `rip-verkenner`, `rip-planner`, `rip-inkoop`, `rip-contractbeheer`, `rip-toetser`, `rip-kwaliteit` | `rip-aandrager`, `rip-ao`, `rip-deelnemers-psu`, `rip-manager-pb`, `rip-team` |

`rip-kwaliteit` is worth noting: it is a real candidate group but not a
Keycloak role, which is exactly the conflation this document exists to
separate. It was removed from the descriptions on that basis, not because the
group is fictional.

**The 28 were not added anywhere.** Describing a role nobody can be granted
would restate the same confusion in a different file.

---

## Why this may matter, and what has not been established

The unverified part is whether the gap is a blocker or cosmetic. It has not
been tested end to end, and the answer should be measured rather than assumed:

- The infra board lists tasks filtered on the `municipality` process variable,
  **not** on candidate group, so tasks addressed to a non-existent group
  probably still appear on the board.
- Whether a user can **claim** a task they are not a candidate for is the open
  question. If Operaton refuses, then from R2.3 onward most of the ladder
  cannot be worked by a real user, and the walkthrough scripts — which complete
  tasks over the REST API without claiming — would not have surfaced it.

A ten-minute test settles it: start any R2.3+ instance, sign in as a user
holding only the six existing roles, and try to claim a task addressed to
`rip-kostenadviseur`.

---

## The decision this implies

Two questions were already open with the business owners when this was found,
and both turn out to be about the 34 rather than the 6:

1. Is `rip-beheerder` (R5.4, R6.1) the same party as
   `rip-beheerder-assetmanagement` (R2.1)? Two design sheets label the lane
   differently and the models followed each sheet.
2. Does an external party get a candidate group at all? `rip-opdrachtnemer` is
   the first non-internal party to occupy a lane — R5.2 gives the contractor
   eight activities of its own.

Whoever answers those is really deciding what the realm should contain, which
is the same decision as whether the 28 become roles. Worth treating as one
question rather than three.

Until it is answered, `ROLE_DESCRIPTIONS` should keep following the realm.
When roles are added there, the descriptions follow — not the other way round.
