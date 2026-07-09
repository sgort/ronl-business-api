# Next-session prompt — live smoke suite (Phase 2)

Paste the block below into a fresh Claude Code session to kick off Phase 2 of
the backend test work. Everything above the `---` is orientation for a human;
everything below it is the prompt.

**Phase 1 (unit coverage) is complete.** The campaign closed all meaningful
branch gaps: `operaton.service`, the four MCP providers, `ob.client`, and the
route-level tenant-mismatch / error-path branches. The suite is now at **829
tests**, all green, with the following headline:

| Stmts | Branch | Funcs | Lines |
| ----- | ------ | ----- | ----- |
| 94.2% | 74.0%  | 94.5% | 95.7% |

Remaining sub-80% branch files are all **documented artifacts**: `capacity` /
`rip` routes (`!req.user` guards), `m2m.routes` (two unreachable `notAllowed`
/ `default` branches), `mcp.routes` (catch-block lines 129-132 where
`req.emit('close')` fires before the catch runs in supertest). Do not reopen
these; they are noted in `docs/TESTS.md`.

---

## Prompt

We're on branch `test/backend-coverage` (off `acc`). Phase 1 is done — 829
tests, 94% stmts / 74% branch / 96% lines. Read `docs/TESTS.md` for the
per-file inventory.

### Working style (unchanged)

- Sanity-check each batch with `npx jest <path>` + `npx eslint <testfile>`,
  then run the full suite (`npm test --workspace=@ronl/backend`) before each
  commit. One logical batch per commit.
- Pre-commit hook runs `lint:fix` + prettier — lint test files first.
- Do not read a populated `.env.development`; use `sed`/masked inspection if
  you need to inspect env structure.

### Phase 2 — live smoke suite

Add a **thin, gated** live suite that exercises the critical cross-app seams
that unit tests mock out. Model it on `scripts/test-edocs-live.sh` (see
`docs/EDOCS-GO-LIVE.md` for structure and gating pattern): a shell runner,
per-check pass/fail output, hard precondition gate before anything hits a live
service.

**Design goals:**

- Runs against the running `ronl-business-api` and `linked-data-explorer` on
  **localhost** — not CI. Developer / pre-deploy smoke check only; never wired
  into the Jest unit run.
- **A handful of high-signal cross-app checks** — examples to confirm with me
  before writing:
  - LDE MCP / SPARQL reachability through the backend
  - eDOCS reachable-vs-authenticated split (reuse the existing health
    distinction from `test-edocs-live.sh`)
  - Operaton round-trip (list processes or check health)
  - PA feed / media path end-to-end
- Gated like the eDOCS script: check each service is up first; skip (don't
  fail loudly) when a dependency is disabled by env flag; never require secrets
  to be present in context.
- Lives under `scripts/` with a short `docs/` companion (one section in
  `docs/TESTS.md` is fine unless it grows a runbook).

**Start here:** propose the concrete check list, where the runner lives
(`scripts/…`), and how it's invoked. Build after I confirm the list.

### Definition of done

A runnable, gated live smoke suite covering the agreed cross-app paths, with
docs, not wired into the unit `npm test`.
