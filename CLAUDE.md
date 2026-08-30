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

**No exceptions any more.** `/bump-release` used to carry one: invoking it
pre-approved a single fast-forward of the release commit onto `acc`. The `acc`
ruleset now requires a pull request and a passing `audit` check, so that
fast-forward no longer exists — step 8 of `.claude/commands/bump-release.md`
pushes a branch and opens a PR, which the user merges. The exception is removed
rather than left standing as authorisation for an operation GitHub would reject.

Releases are therefore merged the same way as everything else: by the user, in
the moment, with the gate having passed first.
