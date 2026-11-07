# Operaton on the VM

`prod/docker-compose.yml` is the Operaton engine on the VM (`operaton.open-regels.nl`), shared by ACC and PROD
until PROD moves to its own engine. It runs **Operaton 1.0.0**. The upgrade is #423, and the VM applying this
directory itself is #196. Until then, everything here is applied **by hand**, and merging changes nothing on
the VM.

Since #415 the engine's REST API requires a login, except for reading the rules:

- **Operaton** (`prod/docker-compose.yml`, `JAVA_OPTS`): REST authentication, authorization checks, and its own
  CORS off. The tenant check stays on: DMNs are deployed without a tenant.
- **Accounts** (`provision-accounts.sh`): a service account per backend and tier in `operaton-admin`, and
  `publicReader`, which may only read definitions and deployments and evaluate decisions.
- **Caddy** (`../caddy/operaton-engine-rest.caddy`): requests to the public rule paths without credentials are
  forwarded as `publicReader`. Everything else needs the caller's own login.

`test/` proves all of it against Operaton 1.0.0 and Caddy 2.10.2: run `check-engine.sh`, then
`check-allowlist.sh`, as the harness's `docker-compose.yml` describes.

Design: `docs/superpowers/specs/2026-11-06-operaton-engine-rest-auth-design.md`. Plan:
`docs/superpowers/plans/2026-11-07-operaton-engine-rest-auth.md`.

**Remaining exposure after #415:** linked-data-explorer's deploy routes (`/v1/dmns/deploy`, `/drd/deploy`,
`/process/deploy`) are anonymous and deploy to this engine with that backend's `operaton-admin` login. Who may
call them is linked-data-explorer#163.

## Accounts

| Account                           | Group            | Used by                                            |
| --------------------------------- | ---------------- | -------------------------------------------------- |
| `rbaBackendAcc`, `rbaBackendProd` | `operaton-admin` | the RBA backend, its worker and the AI assistant   |
| `ldeBackendAcc`, `ldeBackendProd` | `operaton-admin` | the LDE backend and its worker                     |
| `demo`                            | `operaton-admin` | operators: curl, RIP scripts, e2e against ACC/PROD |
| the four personal accounts        | `operaton-admin` | Cockpit and Tasklist                               |
| `publicReader`                    | none             | Caddy only, for the public rule paths              |

Account IDs are camelCase: Operaton rejects dashes (`[a-zA-Z0-9]+`). Passwords never go in this repository.

**A locked account.** After a failed login Operaton refuses that user for 3 s, doubling up to 60 s, and after
10 failures it locks the account. Anyone who knows an account name can trigger this (#425). To unlock: Admin app
(`/operaton/app/admin/`) → Users → the user → unlock, as `demo` or another `operaton-admin` member.

## Rollout (#415)

Every step before 6 is harmless while authentication is still off: Operaton ignores an `Authorization` header it
does not check. Step 1 has been running since 7 November 2026 (#424).

1. **Find every caller.** Caddy logs `/engine-rest` for 7 days:
   `docker exec caddy cat /data/logs/operaton-engine-rest.log`. Account for every client before step 5.
2. **Create the accounts**, on the VM, from a checkout of this directory. Choose a long random password per service
   account and keep it for step 3. Type the four personal IDs; do not save them in a file.

   ```sh
   OPERATON_URL=http://172.18.0.10:8080/engine-rest \
   OPERATON_ADMIN_USER=demo OPERATON_ADMIN_PASSWORD='<demo password>' \
   SERVICE_ACCOUNTS='rbaBackendAcc rbaBackendProd ldeBackendAcc ldeBackendProd' \
   PW_RBABACKENDACC='...' PW_RBABACKENDPROD='...' PW_LDEBACKENDACC='...' PW_LDEBACKENDPROD='...' \
   EXISTING_ADMIN_MEMBERS='<four personal IDs>' \
   PUBLIC_READER_PASSWORD='...' \
   sh provision-accounts.sh
   ```

   Expected last line: `provision-accounts: done`. Running it again changes nothing.

3. **Set the backends' credentials** in the App Service settings: read what is there first, then set
   `OPERATON_USERNAME`/`OPERATON_PASSWORD` to that tier's account.

   | App Service                    | Resource group       | Account          |
   | ------------------------------ | -------------------- | ---------------- |
   | `ronl-business-api-acc`        | `rg-ronl-acc`        | `rbaBackendAcc`  |
   | `ronl-business-api-prod`       | `rg-ronl-prod`       | `rbaBackendProd` |
   | `ronl-linkeddata-backend-acc`  | `RONL-Preproduction` | `ldeBackendAcc`  |
   | `ronl-linkeddata-backend-prod` | `RONL-Preproduction` | `ldeBackendProd` |

   RBA PROD's stray `OPERATON_URL` setting can go in the same pass. Restart each app, and check that `/v1/health`
   reports Operaton up: `acc.api.open-regels.nl`, `api.open-regels.nl`,
   `acc.backend.linkeddata.open-regels.nl` and `backend.linkeddata.open-regels.nl`.

4. **Merge the code**, and promote it to PROD: the RBA #415 pull request and the linked-data-explorer one
   (`fix/operaton-basic-auth`). Both backends then refuse to start on ACC or PROD without the settings from step 3,
   so step 3 comes first. Credentials are now sent, and still ignored.

5. **Apply the Caddy allowlist**, while the engine's login is still off. Operaton ignores the injected
   header until step 6, so the public rules never answer 401 in between. Create `caddy.env` next to Caddy's compose
   file (never committed). `-w0` matters: GNU `base64` wraps at 76 characters, and a wrapped value means wrong
   credentials on every anonymous call, which locks `publicReader` within seconds of step 6.

   ```sh
   printf 'OPERATON_PUBLIC_READER_AUTH=%s
   ```

' "$(printf '%s' 'publicReader:<password>' | base64 -w0)" > caddy.env
wc -l < caddy.env # expected: 1
sed 's/^OPERATON_PUBLIC_READER_AUTH=//' caddy.env | base64 -d; echo # expected: publicReader:<password>

````

Copy `Caddyfile`, `operaton-engine-rest.caddy` and `docker-compose.yml` into place, then `docker compose up -d`.
A new `env_file` needs a recreate, as a reload does not read it. **Recreating Caddy briefly interrupts every site
on the VM** (Keycloak, Nextcloud, CPRMV, Skosmos), not only Operaton, so pick a quiet moment.

6. **Switch on the login.** Check that the colleagues' accounts are in `operaton-admin`. Copy
`prod/docker-compose.yml` into place, remove `OPERATON_TAG` from the VM's `.env` (the tag is now in the file),
then `docker compose up -d`. Brief engine outage. The engine starts normally on this existing database; the
invoice example only fails on an empty one. **Right away**, check that Caddy's injected login works:

```sh
curl -s -o /dev/null -w '%{http_code}
' https://operaton.open-regels.nl/engine-rest/deployment/count
# expected: 200. Anything else: undo step 6 at once (rollback below), before publicReader is locked
````

7. **Verify from outside.**

   ```sh
   H=https://operaton.open-regels.nl/engine-rest
   for p in process-instance/count task/count version; do curl -s -o /dev/null -w "$p %{http_code}\n" "$H/$p"; done
   # expected: 401 for all three
   curl -s -o /dev/null -w 'deployment/count %{http_code}\n' "$H/deployment/count"
   # expected: 200 (deployments are part of the public rules)
   curl -s -o /dev/null -w 'demo, wrong password %{http_code}\n' -u demo:wrong "$H/version"
   # expected: 401
   ```

   Then: a DMN source fetch and an `evaluate` without credentials answer 200, all four `/v1/health` endpoints are
   green, one RIP run completes on ACC, and the ACC e2e suite passes. Against ACC, pass `OPERATON_USERNAME` and
   `OPERATON_PASSWORD` (an `operaton-admin` account) to the scripts and the e2e suite.

8. **Remove the temporary access log**: delete its block from `Caddyfile`, reload Caddy, and delete the log
   (`docker exec caddy rm /data/logs/operaton-engine-rest.log`).

**Rollback.** Step 6: set `-Doperaton.bpm.run.auth.enabled=false` and `-Doperaton.bpm.authorization.enabled=false`,
then `docker compose up -d`. Step 5: restore the previous `Caddyfile` and reload. Steps 1 to 4 can stay in place.
If `publicReader` was locked, unlock it in the Admin app (see Accounts).
