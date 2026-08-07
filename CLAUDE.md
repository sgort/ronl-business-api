# CLAUDE.md — working rules for this repo

## 🚫 Git: NEVER merge without explicit, in-the-moment approval

**Do not run `git merge` — for any branches, in either direction (`feature/* → acc`,
`acc → main`, or anything else) — until the user has explicitly approved that specific
merge and told you to go ahead.**

- Committing on a working/feature branch when asked is fine. **Integrating branches
  (merging) is not** — always stop, say what you intend to merge, and wait for an
  explicit "yes / go ahead / merge it".
- Approval given earlier in the session does **not** carry over to a later merge. Ask
  every time.
- The same caution applies to a `git push` that would deploy or fast-forward a shared
  branch: confirm first.
- If in doubt, don't merge — ask.

**One exception:** invoking `/bump-release` is itself the approval for that
command's single fast-forward of the release commit onto `acc` (see
`.claude/commands/bump-release.md`, step 8). No other merge is covered by it.
