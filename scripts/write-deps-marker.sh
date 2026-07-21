#!/usr/bin/env bash
set -euo pipefail

# Snapshots package-lock.json into node_modules right after a successful
# `npm install`, so scripts/check-deps.sh can later ask "does the lockfile
# on disk still match what was actually installed?" via a byte-for-byte
# content comparison instead of comparing file mtimes.
#
# Mtimes are unreliable for this: `git checkout` / `git merge --ff-only`
# rewrite tracked files to disk as part of updating the working tree even
# when their content is byte-identical to what was already there, which
# bumped package-lock.json's mtime on every branch switch regardless of
# whether dependencies actually changed. A content snapshot doesn't have
# that problem.
cp package-lock.json node_modules/.package-lock-installed.json
