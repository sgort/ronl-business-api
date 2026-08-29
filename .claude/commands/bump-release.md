# bump-release

Cut a release: flip the current Upcoming changelog entry to Released, version
**only the package(s) the release actually changed**, reconcile the root
endpoint map, and land the result on `acc`. Handles both changelog entry
shapes — the current per-commit format (`format: 'commits'`, used by every
new entry) and the legacy sections-based format still carried by historical
entries.

> Why scope matters: the ACC build workflows are path-filtered
> (`packages/backend/**`, `packages/frontend/**`, `packages/shared/**`,
> `packages/public-site/**` via its own `azure-publicsite-*.yml`, and
> `packages/pa-demo/**` via `azure-pa-demo-*.yml`). Bumping
> `packages/backend/package.json` on a public-site-only release triggers _Build
> Backend for ACC_ for nothing — and makes the backend's runtime `/health`
> version lie. So bump-release versions per scope, and the package versions are
> allowed to drift apart.

## Versioning: CalVer `YYYY.MM.patch`

Released versions use CalVer, not SemVer — matching the Norm Editor's
convention (`scripts/generate-changelog.mjs`'s release-tagging scheme) and
the same adoption already done for the CPSV Editor and for
`linked-data-explorer`:

- `2026.07.0` — first release cut in July 2026
- `2026.07.1` — a same-month follow-up release
- `2026.08.0` — the first release of the next month (patch resets to `0`)

To pick the next version: take the current date's `YYYY.MM`. If the most
recent **Released** entry in `changelog-data.ts` already has that same
`YYYY.MM` prefix, increment its patch number by 1. Otherwise (first release
of a new month, or no prior release at all this month) use patch `0`. This
is a single, product-wide version sequence — it does not vary by `scope`; a
backend-only release and a frontend-only release still share the same
next-CalVer-in-sequence number.

Note this is a CalVer _string_ only — no git tags are created, and nothing
else about the release workflow changes (no `generate-changelog.mjs`, no
commit-message enforcement, no `versions.json`). Historical entries already
in `changelog-data.ts` (SemVer strings like `3.9.6`, `3.7.3`) are left as-is;
only new entries going forward use CalVer.

## Steps

### 0. Reconcile outstanding pull requests

Run this **before touching any version**. A pull request merged outside a release
entry ships silently and appears in no changelog, so the release history stops
being a record of what is actually deployed.

```bash
gh pr list --state open --json number,title,author,files
```

Present the open PRs and ask which are in scope for this release: all, a subset,
or none. Out-of-scope PRs stay open and are gathered by the next release. Then:

1. **Merge the in-scope PRs before any version editing.** Dependency PRs rewrite
   `package-lock.json` — the same file step 4 edits. Bump the version first and
   the merge either conflicts or silently reverts it.
2. **Re-check mergeability between merges** when several PRs touch the same file.
   The `acc` ruleset does not require branches to be up to date, so merging one
   leaves the next based on a stale tree.
3. **Each merge to `acc` redeploys frontend, pa-demo and public-site** — those
   workflows trigger on push to `acc` with no `paths:` filter. Say so when
   proposing to merge several. The backend workflows are path-filtered and will
   not fire unless `packages/backend/**` or `packages/shared/**` changed.
4. **Bring the working branch up to date with `acc` afterwards** — rebase if the
   branch is unpushed, merge if it is not. Only then compute the commit range in
   step 1.

### 1. Determine the released version and scope

- Read `packages/frontend/src/pages/changelog-data.ts`
- The first entry in `changelog.versions` is the one being released — extract
  its `version` string (e.g. `'3.7.3'`, or a CalVer string like `'2026.07.0'`
  once new entries start using it). If an explicit version was passed as an
  argument, use that instead and find it in the array. If no version was
  passed and a new entry needs authoring, compute the next CalVer string per
  "Versioning" above.
- `changelog.versions` holds two entry shapes — `ChangelogEntry` is a union of
  `ChangelogVersion` and `ChangelogVersionV2` — discriminated by a `format`
  field:
  - **New entries** (`format: 'commits'`) — one bold, icon+color-coded header
    per commit, each carrying a real SHA + author, `scope` **required** on the
    type itself (`npm run type-check` fails without it). This is the format
    all new entries use going forward.
  - **Legacy entries** (no `format` field, the `sections`-based shape) —
    pre-existing history only; never author a new one of these.
- **If the first entry's `status` is already `Released`, there is no pending
  entry** — do not treat 3.8.2-already-released as "the release." Stop and
  author a new entry first (see "Authoring a new entry" below) before
  continuing. Do not fabricate changelog content without confirming it.
- Read that entry's `scope` field — on new (`format: 'commits'`) entries it is
  an **array** of the packages the release changed, e.g. `['backend',
'public-site']`. Bump the root `package.json` (always) plus one package.json
  per array member:
  - `'frontend'` → `packages/frontend/package.json`
  - `'backend'` → `packages/backend/package.json`
  - `'public-site'` → `packages/public-site/package.json`
  - `'pa-demo'` → `packages/pa-demo/package.json`
  - `ScopeTag` is only these four — there is **no `'shared'` tag**. A
    `packages/shared/**` change is expressed as `['frontend','backend']` (shared
    feeds both builds); bump root + frontend + backend, and bump
    `packages/shared/package.json` too if shared itself was versioned.
    `packages/pa-demo` also depends on `@ronl/shared`, but only for **types**
    (erased before Vite sees them), so a shared-only change does not imply
    `'pa-demo'`.
  - (Legacy entries carry a string `scope` like `'both'` instead — `'both'`
    means frontend + backend. Never author a new one of these.)
  - If `scope` is **absent** (only possible on a legacy entry — new entries
    require it at the type level), do not guess silently — infer it from the
    diff in step 2, tell the user what you inferred, and ask them to add the
    `scope` field to the entry before continuing.

#### Authoring a new entry (when there is no pending one)

Every new entry uses the `format: 'commits'` shape — see `ChangelogVersionV2`,
`ChangelogCommit`, and `CommitType` in `changelog-data.ts` for the exact
fields, and the `3.9.2` entry for a worked example.

1. Find the commit range: the same `$PREV` lookup step 2 uses (previous
   release commit), then `git log $PREV..HEAD --no-merges --oneline` lists
   everything since.

   **`--no-merges` is required.** Releases land through pull requests now, so
   every range contains merge commits, and a merge commit carries no content
   for a changelog.

   **Compute the range only after step 0 has brought the branch up to date.**
   Rebasing rewrites SHAs, so a range captured earlier records hashes that no
   longer exist — and nothing downstream will catch it.

   Drop any commits already covered by an existing changelog entry (check the
   top entry's own content — a release is sometimes cut mid-stream, leaving a
   few already-documented commits still in range).

2. For each remaining commit, pull its real SHA (short form), author, and
   full subject + body: `git log -1 --format='%h|%an|%s%n%b' <sha>`. Derive
   `type` from the commit's conventional-commit prefix — `feat`, `fix`,
   `test`, `docs`, `chore`, `refactor`, or `ci` — falling back to `other` for
   anything non-conforming. `ci` covers pipeline and supply-chain work; it is
   part of the `CommitType` union, so TypeScript will reject an entry using a
   type `COMMIT_TYPE_META` does not render. Order the `commits` array **descending** —
   most recent commit first, oldest last (`ChangelogPanel.tsx` renders it
   in array order, no reversal). When extending an already-existing
   Upcoming entry with new commits found on a later pass, prepend the new
   ones above the existing list rather than appending — the whole array
   stays newest-first. Do not reorder or otherwise touch the commit lists
   of entries that are already `Released` — this convention is forward-only.
3. Write `subject` as a clean, readable release-note header — informed by
   the commit subject but not required to be verbatim (e.g. reword for
   clarity, the way `9248982`'s "route WatchBell toggles through
   PaDataProvider" became "WatchBell toggles now refetch Meldingen via
   PaDataProvider" in 3.9.2). Write `details` as 1–3 paragraphs adapted from
   the commit body at the **same technical depth** the body already has —
   this is a developer-facing changelog, not marketing copy. Strip any
   `Co-Authored-By` / `Claude-Session` trailer lines; never surface them.
4. Set `version` to the next CalVer string computed per "Versioning" above.
   Determine `scope` the same way step 2 below does (diff the touched
   packages). Set `status: 'Upcoming'` — bump-release flips it to `Released`
   in step 3.
5. If the release closes a tracked RONL feedback/use-case work item
   (external GitLab work item, a different project than this repo), ask
   the user for the item's `iid`/`title`/`url` rather than inferring one —
   set the entry's optional `feedback` field. Omit it otherwise.
6. **Show the drafted entry to the user and get confirmation before adding
   it to `changelog-data.ts`.** Do not silently commit authored changelog
   content — same rule as the legacy format always had.
7. **If the entry needs a source change to render correctly** — a commit type
   missing from the `CommitType` union, for example — commit that change
   _before_ the bump and list it in the entry. The bump commit is the boundary
   marker `git log --grep` searches for and is never listed in its own entry, so
   a source change folded into it ships unlisted.

### 2. Cross-check scope against what actually changed

Guard against a mislabeled release (which would drift the package versions out of
sync with CI). Diff the release's changes against the previous release commit:

```bash
PREV=$(git log --grep='^chore: bump release' -n 1 --format=%H)
git diff --name-only "$PREV"..HEAD -- packages/
```

Map the touched top-level dirs to the `scope` array (one entry per package):

- `packages/frontend/**` → include `'frontend'`
- `packages/backend/**` → include `'backend'`
- `packages/public-site/**` → include `'public-site'`
- `packages/pa-demo/**` → include `'pa-demo'`
- `packages/pa-cockpit/**` → include **both** `'frontend'` and `'pa-demo'` (the
  package is compiled into both apps and deployed on its own by neither; same
  rule `packages/shared/**` already follows for frontend + backend)
- `packages/shared/**` → include **both** `'frontend'` and `'backend'` (shared
  feeds both builds; there is no `'shared'` scope tag)

Do **not** count the changelog file itself
(`packages/frontend/src/pages/changelog-data.ts`) as a `'frontend'` change — every
release edits it, so it would make every release look frontend-scoped.

If the declared `scope` does not cover the changed packages, **stop and warn**
the user with the specifics (declared vs. detected) and ask how to proceed. Do
not bump a package the release didn't touch, and do not skip one it did.

This has caught a real case in practice, not just a hypothetical: an earlier
commit had already landed an unrelated frontend change (a small UI feature)
with no changelog entry or version bump of its own, sitting silently on top
of the branch a later backend-scoped release was cut from. Two resolutions
are valid — pick based on how related the extra change is to the one being
released:

- **Unrelated leftover work** (the common case) → add a **second, separate
  changelog entry** for it with its own accurate scope (backdate its `date`
  to when that commit actually landed, not today), and release both entries
  in the same pass. Keeps each entry's scope honest and each package's
  version tied to what it actually contains.
- **Genuinely part of the same change** → widen the current entry's `scope`
  to `both` and fold a description of the extra change into it instead of
  splitting.

### 3. Flip the released entry to Released

- **New entries** (`format: 'commits'`): set `status: 'Released'` — that's
  it. There is no `statusColor`/`borderColor` field on this shape; the panel
  derives the status pill and left-border color from the `status` string
  itself (`ChangelogPanel.tsx`'s `statusBadgeClass`/`newFormatBorderColor` —
  `'Released'` → green, `'Upcoming'` → blue, anything else → gray). Do not
  add color fields to a `format: 'commits'` entry; they're ignored.
- **Legacy entries**: set the Released status and green colours explicitly,
  whatever the current status (`Upcoming`, `Bug Fix`, etc.):

  ```ts
  status: 'Released',
  statusColor: '#2d7a33',
  borderColor: '#c3e6cd',
  ```

### 4. Bump the in-scope package.json files and the lockfile

Set `"version"` by hand in each in-scope `package.json` **and** in the matching
entries of the root `package-lock.json`:

- `package.json` (repo root) — **always** (canonical product version; triggers no CI)
- one package.json per `scope` array member:
  - `packages/frontend/package.json` — if scope includes `'frontend'`
  - `packages/backend/package.json` — if scope includes `'backend'`
  - `packages/public-site/package.json` — if scope includes `'public-site'`
  - `packages/pa-demo/package.json` — if scope includes `'pa-demo'`
  - **nothing** for `'ci'` — it is not a deployable. A `'ci'`-scoped release
    changes how the pipeline is built and gated (workflow pinning, the audit
    gate, release tooling) and touches no package, so it bumps the root
    `package.json` and the lockfile's root entries only. Bumping a package for
    it would trip that package's path-filtered workflow and deploy code that
    did not change.
  - `packages/shared/package.json` — only if a `packages/shared/**` change was
    part of the release (there is no `'shared'` scope tag; such a release carries
    `['frontend','backend']`). `shared` is otherwise pinned at `1.0.0`.
- `package-lock.json` — the top-level `version`, `packages[""].version`, and
  `packages["packages/<ws>"].version` for each workspace bumped above

Leave an out-of-scope package.json untouched — its version legitimately lags at
the last release that changed it, and that is true of its lockfile entry too.

A package version may also legitimately run **ahead** of the product sequence:
`packages/pa-demo` was created at `2026.08.24` while the last release was
`2026.08.23`, because the package was authored between releases and stamped
with its authoring date. Set an in-scope package to the released version
regardless of which direction that moves it, and never rewind an out-of-scope
one to "fix" the ordering — it reconciles on the first release that includes it.

**Do not use `npm version`.** It coerces its argument to strict SemVer, and a
zero-padded CalVer month is not a valid SemVer numeric identifier — so
`npm version 2026.08.3` silently writes **`2026.8.3`**, to every file it
touches. That was tried during the Linked Data Explorer's v2026.08.3 release and
reverted. There is no flag to disable the coercion. `npm pkg set version=...`
preserves the string but does not touch the lockfile, so it solves only half the
problem. Note this repo's own scheme (`2026.08.19`) has the same zero-padded
month and is affected identically.

**Why the lockfile is called out.** This step used to name only the
`package.json` files, so no release ever updated the lockfile. Through
v2026.08.19 it still recorded the root at `2026.08.3`, `packages/backend` at
`2026.08.1` and `packages/frontend` at `2026.07.0`.

The drift is not fatal: `npm ci` validates dependency satisfiability, and the
root depends on its workspaces by path rather than by version range, so those
`version` fields are never checked — it exits 0 either way (verified against the
drifted state). But the lockfile is what CI installs from and what SBOM, audit
and provenance tooling reads, so all of it reported the wrong versions. Re-run
`npm ci --dry-run` after editing, to confirm the lockfile still resolves.

**Releasing more than one entry in the same pass** (see the split-entry case in
step 2): process each entry's scope independently against root + its package,
but set root to the **highest** of the versions released, regardless of which
entry you processed first — root always tracks the latest overall release,
not "whichever ran last."

### 5. Reconcile the root endpoint map

- Read `packages/backend/src/index.ts`
- Collect every `app.use('/v1/...',` call (the mounted path is the key)
- Compare against the `endpoints` object in the root `app.get('/')` handler
- Add any missing routes; remove any stale ones
- Use camelCase keys that describe the domain, not the path
  (e.g. `curator` for `/v1/pa`, `mediaAggregator` for `/v1/media-aggregator`)
- Do not list `/v1/health` separately if it is already present — keep it
- Skip this step if scope does **not** include `'backend'` (no backend routes
  could have changed)

### 6. Normalize formatting, then lint, before committing

Windows checkouts drift package.json/changelog-data.ts line endings (LF vs
CRLF) enough to fail the pre-push hook's `npm run check-format` even though
`lint-staged` already ran on commit — the hook re-checks the **whole repo**,
not just staged files. Run this right before committing, after every edit
above is done:

```bash
npm run format
git add .
```

`npm run format` is `prettier --write` across the repo; `git add .` stages
whatever it touched (and everything else from the steps above) so the
commit is push-clean. Skip the `git add .` only if `npm run format` reports
no changes.

**Then run lint — formatting a file clean does not mean it's lint-clean.**
`npm run format` only fixes whitespace/style (Prettier); it does not run
ESLint, so a real lint warning (e.g. `react-refresh/only-export-components`
on a file that exports both a component and a plain function) can ship
silently in a release even after `npm run format` reports no changes. This
was a real gap in practice: HerkomstExplorer.tsx exported both its default
component and a helper function, `npm run format` found nothing to fix, and
the warning only surfaced when someone ran lint manually after the release
was already cut.

```bash
npm run lint
```

If it reports anything, fix it (or, for a mechanical one-file-exports-more-
than-a-component case like `react-refresh/only-export-components`, extract
the non-component export into its own module — matching how this repo's
other pages already split pure logic/data out of component files) and
re-run `npm run format && npm run lint` until both are clean before
proceeding to commit. Do not release with an outstanding lint warning.

### 7. Report and ask to commit

State:

- The version that was released, and its **scope**
- Which package.json files were bumped, and which were deliberately left behind
  (with their lagging version)
- Any endpoint keys that were added or removed
- If scope was inferred or a cross-check mismatch was found, say so
- For a new-format entry: how many commits it covers

Then ask whether to commit. Do not commit unless the user confirms.
When committing, use the message format:
`chore: bump release to v<released-version>`
and do **not** include a Co-Authored-By line. If more than one entry was
released in the same pass, use the highest version as the headline (matching
root's version) and summarize the other entry/entries in the commit body.

### 8. Land the release through a pull request

`acc` is protected by a ruleset requiring a pull request and a passing `audit`
check. A locally created bump commit has never been through CI, so **the old flow
— `git checkout acc` followed by `git merge --ff-only` and a direct push — is
rejected outright.** Do not work around it: the gate applies to releases like
everything else, and bypassing a verification gate is never a step in this task.

**This supersedes the pre-authorization this step used to carry.** There is no
fast-forward left to pre-approve, so `CLAUDE.md`'s exception for it has been
removed. Every merge in this repo now needs explicit, in-the-moment approval,
with no exceptions — and the release PR is merged by the human, not by this
command.

```bash
git push -u origin <working-branch>
gh pr create --base acc --title "chore: bump release to v<version>" --body "..."
```

- **Merge with a merge commit.** The changelog entry names each commit by its
  SHA, and both alternatives rewrite those hashes: squashing collapses them into
  one new commit, and rebasing replays them as new commits — deceptively, since
  it preserves the commit count while replacing every hash. Either leaves the
  entry pointing at commits that do not exist on `acc`. This repository allows
  merge commits only, so the failure is impossible by construction rather than
  forbidden by a rule.

  ```bash
  gh pr merge <n> --merge --delete-branch
  ```

- Report the PR URL and let the human merge it. The release is audited before it
  lands, which is the point of the change.
- The PR runs `audit` alongside the acceptance deploys. **Merging redeploys
  frontend, pa-demo and public-site**; there is no separate "ask whether to push"
  step any more, because merging _is_ the push.
- Afterwards, sync local and clean up:

  ```bash
  git checkout acc && git pull --ff-only
  git branch -d <working-branch>
  ```

  Use `-d`, not `-D` — it only succeeds when the branch is fully merged. If it
  refuses, stop and investigate rather than forcing it.

- **Confirm the branch is gone from the remote too.** `gh pr merge --delete-branch`
  removes both copies, and both repositories now have `delete_branch_on_merge`
  enabled so a merge through the GitHub UI does the same. But a release merged some
  other way leaves the remote branch behind — `chore/release-2026-08-33` survived
  exactly that way, and was only noticed later:

  ```bash
  git fetch origin --prune
  git ls-remote --heads origin '<working-branch>'   # expect no output
  git push origin --delete <working-branch>          # only if it survived
  ```

  A stale merged branch is harmless on its own. They accumulate, and every one of
  them makes it harder to see which branches are genuinely in flight — which is the
  question step 0 has to answer at the next release.

### Why this changed

Through v2026.08.x this step fast-forwarded `acc` locally and asked separately
about pushing. That stopped working when `acc` gained a ruleset requiring a pull
request and a passing `audit` check — enforcement introduced by the
supply-chain pinning work, recorded in `SECURITY-PIPELINE.md`.

The other corrections here were all found by running the equivalent command twice
in `ttl-editor` under its own gate, rather than by reasoning about it: the
missing `--no-merges`, the missing `ci` type, the PR reconciliation in step 0,
the range being computed before a rebase had rewritten its SHAs, the rule that a
source change an entry needs must precede the bump, and the merge method — where
the first attempt said "never squash" and missed that rebase rewrites hashes just
as thoroughly.
