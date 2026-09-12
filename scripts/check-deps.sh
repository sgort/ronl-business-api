#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo "Checking dependencies..."
echo ""

STALE=false

# 1. node_modules must exist at the workspace root
if [ ! -d "node_modules" ]; then
  echo -e "${RED}✗ node_modules is missing.${NC}"
  STALE=true
# 2. scripts/write-deps-marker.sh (wired as the root "postinstall" script)
#    snapshots package-lock.json into node_modules/.package-lock-installed.json
#    right after every successful `npm install`. Compare that snapshot's
#    *content* against the current lockfile instead of comparing file
#    mtimes: `git checkout` / `git merge --ff-only` rewrite tracked files to
#    disk as part of updating the working tree even when content is
#    byte-identical to what was already there, which made the old mtime
#    check (`-nt`) fire on every branch switch regardless of whether
#    dependencies actually changed.
elif [ ! -f "node_modules/.package-lock-installed.json" ]; then
  echo -e "${YELLOW}⚠ node_modules/.package-lock-installed.json missing${NC} — install marker not found."
  STALE=true
elif ! cmp -s "package-lock.json" "node_modules/.package-lock-installed.json"; then
  echo -e "${YELLOW}⚠ package-lock.json has changed since the last install${NC} — dependencies changed since your last 'npm install'."
  STALE=true
else
  echo -e "${GREEN}✓ Installed dependencies are in sync with package-lock.json${NC}"
fi

echo ""

if [ "$STALE" = true ]; then
  echo -e "${RED}Dependencies are not ready.${NC} Run the following to sync them:"
  echo ""
  echo "  npm install"
  echo ""
  exit 1
fi

echo -e "${GREEN}Dependencies are ready.${NC}"
echo ""
