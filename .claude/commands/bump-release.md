# bump-release

Cut a release: flip the current Upcoming changelog entry to Released, version
**only the package(s) the release actually changed**, reconcile the root
endpoint map, and land the result on `acc`. Handles both changelog entry
shapes — the current per-commit format (`format: 'commits'`, used by every
new entry) and the legacy sections-based format still carried by historical
entries.

> Why scope matters: the ACC build workflows are path-filtered
> (`packages/backend/**`, `packages/frontend/**`, `packages/shared/**`). Bumping
> `packages/backend/package.json` on a frontend-only release triggers _Build
> Backend for ACC_ for nothing — and makes the backend's runtime `/health`
> version lie. So bump-release versions per scope, and the package versions are
> allowed to drift apart.

## Steps

### 1. Determine the released version and scope

- Read `packages/frontend/src/pages/changelog-data.ts`
- The first entry in `changelog.versions` is the one being released — extract
  its `version` string (e.g. `'3.7.3'`). If an explicit version was passed as an
  argument, use that instead and find it in the array.
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
- Read that entry's `scope` field: `'frontend' | 'backend' | 'both'`.
  - `frontend` → bump root + `packages/frontend/package.json`
  - `backend` → bump root + `packages/backend/package.json`
  - `both` → bump all three
  - If `scope` is **absent** (only possible on a legacy entry — new entries
    require it at the type level), do not guess silently — infer it from the
    diff in step 2, tell the user what you inferred, and ask them to add the
    `scope` field to the entry before continuing.

#### Authoring a new entry (when there is no pending one)

Every new entry uses the `format: 'commits'` shape — see `ChangelogVersionV2`,
`ChangelogCommit`, and `CommitType` in `changelog-data.ts` for the exact
fields, and the `3.9.2` entry for a worked example.

1. Find the commit range: the same `$PREV` lookup step 2 uses (previous
   release commit), then `git log $PREV..HEAD --oneline` lists everything
   since. Drop any commits already covered by an existing changelog entry
   (check the top entry's own content — a release is sometimes cut
   mid-stream, leaving a few already-documented commits still in range).
2. For each remaining commit, pull its real SHA (short form), author, and
   full subject + body: `git log -1 --format='%h|%an|%s%n%b' <sha>`. Derive
   `type` from the commit's conventional-commit prefix — `feat`, `fix`,
   `test`, `docs`, `chore`, or `refactor` — falling back to `other` for
   anything non-conforming.
3. Write `subject` as a clean, readable release-note header — informed by
   the commit subject but not required to be verbatim (e.g. reword for
   clarity, the way `9248982`'s "route WatchBell toggles through
   PaDataProvider" became "WatchBell toggles now refetch Meldingen via
   PaDataProvider" in 3.9.2). Write `details` as 1–3 paragraphs adapted from
   the commit body at the **same technical depth** the body already has —
   this is a developer-facing changelog, not marketing copy. Strip any
   `Co-Authored-By` / `Claude-Session` trailer lines; never surface them.
4. Determine `scope` the same way step 2 below does (diff the touched
   packages). Set `status: 'Upcoming'` — bump-release flips it to `Released`
   in step 3.
5. If the release closes a tracked RONL feedback/use-case work item
   (external GitLab work item, a different project than this repo), ask
   the user for the item's `iid`/`title`/`url` rather than inferring one —
   set the entry's optional `feedback` field. Omit it otherwise.
6. **Show the drafted entry to the user and get confirmation before adding
   it to `changelog-data.ts`.** Do not silently commit authored changelog
   content — same rule as the legacy format always had.

### 2. Cross-check scope against what actually changed

Guard against a mislabeled release (which would drift the package versions out of
sync with CI). Diff the release's changes against the previous release commit:

```bash
PREV=$(git log --grep='^chore: bump release' -n 1 --format=%H)
git diff --name-only "$PREV"..HEAD -- packages/
```

Map the touched top-level dirs to a scope:

- `packages/shared/**` changed → scope **must** be `both` (shared feeds both builds)
- only `packages/frontend/**` → `frontend`
- only `packages/backend/**` → `backend`
- both frontend and backend → `both`

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

### 4. Bump the in-scope package.json files

Read each file before editing (required by the Edit tool). Set `"version"` to
the released version in:

- `package.json` (repo root) — **always** (canonical product version; triggers no CI)
- `packages/frontend/package.json` — only if scope is `frontend` or `both`
- `packages/backend/package.json` — only if scope is `backend` or `both`

Leave an out-of-scope package.json untouched — its version legitimately lags at
the last release that changed it. Run the in-scope edits in parallel.

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
- Skip this step if scope is `frontend` (no backend routes could have changed)

### 6. Normalize formatting before committing

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
commit is push-clean. Skip this only if `npm run format` reports no changes.

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

### 8. Fast-forward onto `acc` and clean up the working branch

Once the bump commit from step 7 exists, land it on `acc` by default — do not
ask first, this is now the standard flow. Skip this step only if the commit
was already made directly on `acc` (no separate working branch involved).

```bash
git checkout acc
git merge --ff-only <working-branch>
```

- If this isn't a clean fast-forward (`acc` has diverged — e.g. something
  else landed on it since the working branch forked), **stop and ask** how
  to proceed. Never force-merge, rebase, or `--no-ff` silently to route
  around a divergence.
- On success, delete the now-fully-merged working branch:

  ```bash
  git branch -d <working-branch>
  ```

  Use `-d`, not `-D` — a plain delete only succeeds when the branch is fully
  merged, which it will be immediately after an `--ff-only` merge. If `-d`
  refuses, stop and investigate rather than forcing it.

- This is local-only: it does **not** push `acc` to `origin`, and does not
  touch a same-named remote branch if one exists. Report the new local `acc`
  HEAD (short SHA) and ask separately whether to push — pushing to a shared
  branch still needs explicit confirmation, per the usual rule for actions
  visible to others.
