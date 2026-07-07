# Next-session prompt — finish coverage, then add a live smoke suite

Paste the block below into a fresh Claude Code session (run from
`packages/backend`) to resume the backend test-coverage work. Everything above the
`---` is orientation for a human; everything below it is the prompt.

This picks up after the unit-coverage campaign on branch `test/backend-coverage`
(~786 tests). The current state, per-file, is documented in [`docs/TESTS.md`](./TESTS.md)
— treat that file's inventory table as the source of truth for where coverage stands.

---

## Prompt

We're continuing the backend test-coverage work on branch `test/backend-coverage`
(off `acc`). Read `docs/TESTS.md` first — its per-file inventory (Lines + Branch %) is
the current state of truth. The suite is at ~786 tests, all green, ~94% lines / ~71%
branch overall.

Work in **two phases, in order**. Phase 1 first; do not start Phase 2 until the unit
gaps are closed and I've said so.

### Working style (unchanged from the campaign)

- **Per-batch handoff.** After each file/service, sanity-check with a focused
  `npx jest <path>` + `npx eslint <testfile>`, then hand me
  `npm test --workspace=@ronl/backend` with an expected pass count and wait for my
  green before committing. One logical batch per commit.
- **Depth: behavior + key branches.** Cover real behavior and the branches that carry
  logic (validation, error mapping, dedup, retries). Don't chase unreachable defensive
  defaults (`?? null`, `if (!req.user)` behind real middleware) just for the number —
  note them as artifacts instead, the way `docs/TESTS.md` already does.
- **Don't touch secrets.** The eDOCS password and any live credentials stay out of
  context — never `Read` a populated `.env.development`; use masked/`sed` inspection if
  you must look.
- A husky pre-commit hook runs `lint:fix` + prettier and can revert a commit on a lint
  error, so lint test files before committing.
- Prefer mocking at the module boundary (axios / global `fetch` / `pg` / MCP SDK), the
  patterns already established in the sibling test files.

### Phase 1 — finish the unit coverage (fast, deterministic, no infra)

Close the remaining **branch** gaps, biggest-value first. From `docs/TESTS.md`:

1. **`services/operaton.service.ts`** — 88% lines / **61% branch**, the single largest
   remaining block. Cover the per-endpoint upstream-error branches across its surface.
2. **`services/mcp/` providers** — `LdeMcpProvider` (42% branch),
   `OperatonMcpProvider` (53%), `TriplyDbMcpProvider` (45%), `CprmvMcpProvider` (54%).
   Cover the connect / guard / tool-error branches.
3. **`pa-monitoring/sources/ob.client.ts`** — 89% lines / **43% branch**; the fetch
   error/paging branches. Note: the `numberOfRecords → null` behaviour is a documented
   product quirk, not a gap — assert current behaviour, don't "fix" it here.
4. **Route branch gaps** where cheap and meaningful — `task`, `m2m`, `capacity`, `rip`,
   `mcp.routes` (validation/error branches). Skip anything that's purely a defensive
   default.

Leave the two documented artifacts alone: `utils/config.ts` (0%, self-validates on
import) and `utils/logger.ts` (73%, winston fully mocked). Update `docs/TESTS.md`
(inventory table + numbers) as part of each batch so the doc never drifts from reality.

### Phase 2 — a small live smoke / integration suite

Once unit coverage is done, add a **thin** live suite that exercises the critical
**cross-app** paths against running backends — the seams unit tests deliberately mock
out. Model it on the script we already built, `scripts/test-edocs-live.sh` (see
`docs/EDOCS-GO-LIVE.md` for how that one is structured and gated): a command-line
runner, clear per-check pass/fail, and a hard gate on preconditions before it hits
anything live.

Design intent:

- **Runs against the running `ronl-business-api` and `linked-data-explorer` on
  localhost**, not CI. It's a developer/pre-deploy smoke check, kept out of the Jest
  unit run so the unit suite stays fast and infra-free.
- **Critical cross-app paths only** — a handful of high-signal checks, e.g. the LDE
  MCP/SPARQL reachability behind the backend, the eDOCS reachable-vs-authenticated
  split (reuse the existing edocs health distinction), an Operaton round-trip, and the
  PA feed/media path end-to-end. Confirm the exact list with me before writing.
- **Gated like the edocs script**: check each service is up first; skip (don't fail
  loudly) when a dependency is intentionally disabled by env flag; never depend on
  secret values being present in context.
- Document it alongside `docs/TESTS.md` (a "Live smoke suite" section) and, if it grows
  its own runbook, a short `docs/` companion like the eDOCS one.

Start Phase 2 by proposing the concrete check list + where the runner lives
(`scripts/…`) and how it's invoked, then build after I confirm.

### Definition of done

- Phase 1: remaining branch gaps closed to the point where what's left is genuinely
  defensive/artifact, `docs/TESTS.md` refreshed, suite green.
- Phase 2: a runnable, gated live smoke suite covering the agreed cross-app paths, with
  docs, not wired into the unit `npm test`.
