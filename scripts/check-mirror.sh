#!/usr/bin/env bash
#
# check-mirror.sh — is the GitLab mirror telling the same story as GitHub?
#
# Every gate in SECURITY-PIPELINE.md runs on GitHub Actions. The `gitlab`
# remote is outside all of them, and it is pushed BY HAND — nothing else keeps
# it current, so it drifts on every merge. A mirror nothing checks is not a
# backup; it is a second place for content to be.
#
# This cannot run in CI, and that is a property of the mirror rather than a
# shortcoming here. The `gitlab` remote lives in .git/config, not in the
# repository: no tracked file names the host. An Actions runner has no such
# remote, no key for it, and no route to it. So the check runs where the push
# actually happens — a workstation — and is called at each release from
# .claude/commands/bump-release.md.
#
# WHAT IT DOES NOT DO: push. The decision to write to a shared remote stays
# with a human (CLAUDE.md, "never merge or force-push a shared branch
# unasked"). A script that pushed on its own would route around that rule
# rather than serve it. This prints the exact command and stops.
#
# Exit 0 when every branch matches, or when no mirror is configured. Exit 1 on
# any drift. Modelled on check-supply-chain.mjs, including its rule that
# anything unchecked is reported rather than passed over in silence.
#
# Usage:
#   bash scripts/check-mirror.sh              # check acc and main
#   bash scripts/check-mirror.sh acc          # check one branch
#   npm run check-mirror

set -euo pipefail

MIRROR_REMOTE="${MIRROR_REMOTE:-gitlab}"
SOURCE_REMOTE="${SOURCE_REMOTE:-origin}"

if [ "$#" -gt 0 ]; then
  BRANCHES=("$@")
else
  BRANCHES=(acc main)
fi

# No mirror here is a legitimate state, not a failure: a fresh clone has only
# `origin`, and so does any CI checkout. Say so and succeed, rather than
# failing for a condition the caller cannot fix and did not cause.
if ! git remote get-url "$MIRROR_REMOTE" >/dev/null 2>&1; then
  echo "check-mirror: no '$MIRROR_REMOTE' remote configured — nothing to compare."
  echo "  (expected on CI and on a fresh clone; the mirror is a per-clone remote)"
  exit 0
fi

echo "check-mirror: $SOURCE_REMOTE -> $MIRROR_REMOTE"
echo "  $(git remote get-url "$SOURCE_REMOTE")"
echo "  $(git remote get-url "$MIRROR_REMOTE")"
echo

# Classifying drift needs both commits present locally: `merge-base
# --is-ancestor` reads the object database, not the network. Fetching only
# moves remote-tracking refs -- it touches no local branch and no working
# tree -- but it IS a network call, so a mirror that is unreachable (VPN down,
# no SSH agent) fails here rather than silently reporting a stale comparison.
if ! git fetch --quiet "$SOURCE_REMOTE" 2>/dev/null; then
  echo "check-mirror: cannot reach '$SOURCE_REMOTE'. Nothing was compared." >&2
  exit 1
fi
if ! git fetch --quiet "$MIRROR_REMOTE" 2>/dev/null; then
  echo "check-mirror: cannot reach '$MIRROR_REMOTE'. Nothing was compared." >&2
  echo "  The mirror may simply be unreachable from here rather than behind." >&2
  exit 1
fi

drift=0
checked=0

for branch in "${BRANCHES[@]}"; do
  src=$(git rev-parse --quiet --verify "refs/remotes/$SOURCE_REMOTE/$branch" || true)
  dst=$(git rev-parse --quiet --verify "refs/remotes/$MIRROR_REMOTE/$branch" || true)

  # A branch absent from the SOURCE is not this script's business: `main` does
  # not exist in every repository that uses this file.
  if [ -z "$src" ]; then
    printf '  %-6s not on %s — skipped\n' "$branch" "$SOURCE_REMOTE"
    continue
  fi

  checked=$((checked + 1))

  if [ -z "$dst" ]; then
    printf '  %-6s MISSING on the mirror (%s is at %s)\n' "$branch" "$SOURCE_REMOTE" "${src:0:7}"
    printf '         git push %s %s/%s:refs/heads/%s\n' "$MIRROR_REMOTE" "$SOURCE_REMOTE" "$branch" "$branch"
    drift=$((drift + 1))
    continue
  fi

  if [ "$src" = "$dst" ]; then
    printf '  %-6s MATCH   %s\n' "$branch" "${src:0:7}"
    continue
  fi

  # Behind and diverged both read as "stale" from a commit count, and they need
  # opposite responses. Only this test separates them: ttl-editor's GitLab
  # `main` had genuinely diverged once and was archived as
  # archive/gitlab-main-2026-09-09, while every drift since has been the dull
  # case -- a strict ancestor, one fast-forward away.
  if git merge-base --is-ancestor "$dst" "$src"; then
    behind=$(git rev-list --count "$dst..$src")
    printf '  %-6s BEHIND by %s commit(s): mirror %s, %s %s\n' \
      "$branch" "$behind" "${dst:0:7}" "$SOURCE_REMOTE" "${src:0:7}"
    # Push the REMOTE-TRACKING ref, not the local branch. `git push gitlab acc`
    # sends whatever the local branch happens to be, and local branches drift:
    # in linked-data-explorer local `main` sat at a four-month-old merge node
    # that origin/main had never contained.
    printf '         git push %s %s/%s:refs/heads/%s\n' "$MIRROR_REMOTE" "$SOURCE_REMOTE" "$branch" "$branch"
    drift=$((drift + 1))
  else
    ahead=$(git rev-list --count "$src..$dst")
    printf '  %-6s DIVERGED — the mirror holds %s commit(s) %s has never seen\n' \
      "$branch" "$ahead" "$SOURCE_REMOTE"
    printf '         mirror %s, %s %s\n' "${dst:0:7}" "$SOURCE_REMOTE" "${src:0:7}"
    printf '         NOT fast-forwardable. Do not force it into line: archive the\n'
    printf '         mirror branch first, as ttl-editor did in September 2026.\n'
    drift=$((drift + 1))
  fi
done

echo
if [ "$checked" -eq 0 ]; then
  echo "check-mirror: no branches compared — check the branch names." >&2
  exit 1
fi

if [ "$drift" -eq 0 ]; then
  echo "OK — the mirror matches $SOURCE_REMOTE on every branch checked."
  exit 0
fi

echo "$drift branch(es) out of sync. The mirror is pushed by hand; run the"
echo "command(s) above, then confirm with: git ls-remote $MIRROR_REMOTE"
exit 1
