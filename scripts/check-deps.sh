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
# 2. npm writes node_modules/.package-lock.json after every install, reflecting
#    what is actually on disk. If the root lockfile is newer (e.g. after a
#    git pull), the installed tree is out of date.
elif [ ! -f "node_modules/.package-lock.json" ]; then
  echo -e "${YELLOW}⚠ node_modules/.package-lock.json missing${NC} — install marker not found."
  STALE=true
elif [ "package-lock.json" -nt "node_modules/.package-lock.json" ]; then
  echo -e "${YELLOW}⚠ package-lock.json is newer than the last install${NC} — dependencies changed since your last 'npm install'."
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
