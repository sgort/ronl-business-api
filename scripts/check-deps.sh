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
MARKER="node_modules/.package-lock-installed.json"

# Compares the lockfile against the snapshot scripts/write-deps-marker.sh
# (the root "postinstall" script) takes after every install, ignoring this
# repository's OWN version numbers.
#
# A byte comparison is not enough: every release bump rewrites the `version`
# of the root and of each workspace package in package-lock.json, so the
# check refused to start the dev servers after every release even though no
# dependency had changed. Those fields describe what we publish, not what is
# installed. Third-party entries (every key containing `node_modules/`) keep
# their `version`, and workspace entries keep their `dependencies` lists, so
# upgrading a package or adding one to a workspace still counts as a change.
#
# Parsing the JSON also makes line endings irrelevant, which the earlier
# mtime- and byte-based checks both tripped over (see .gitattributes).
#
# Exit codes: 0 in sync, 1 dependencies differ, 2 a file could not be read.
lockfile_matches_marker() {
  node -e '
    const fs = require("fs");
    const normalise = (path) => {
      const lock = JSON.parse(fs.readFileSync(path, "utf8"));
      delete lock.version;
      for (const [key, entry] of Object.entries(lock.packages || {})) {
        if (!key.includes("node_modules/") && entry && typeof entry === "object") {
          delete entry.version;
        }
      }
      return JSON.stringify(lock);
    };
    try {
      process.exit(normalise(process.argv[1]) === normalise(process.argv[2]) ? 0 : 1);
    } catch (error) {
      console.error(error.message);
      process.exit(2);
    }
  ' "package-lock.json" "$MARKER"
}

# 1. node_modules must exist at the workspace root
if [ ! -d "node_modules" ]; then
  echo -e "${RED}✗ node_modules is missing.${NC}"
  STALE=true
elif [ ! -f "$MARKER" ]; then
  echo -e "${YELLOW}⚠ $MARKER missing${NC} — install marker not found."
  STALE=true
else
  rc=0
  lockfile_matches_marker || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo -e "${GREEN}✓ Installed dependencies are in sync with package-lock.json${NC}"
  elif [ "$rc" -eq 1 ]; then
    echo -e "${YELLOW}⚠ package-lock.json has changed since the last install${NC} — dependencies changed since you last installed."
    STALE=true
  else
    echo -e "${YELLOW}⚠ package-lock.json or the install marker could not be read${NC} — treating the install as stale."
    STALE=true
  fi
fi

# 2. The package-manager cooldown in .npmrc (min-release-age) needs npm 11.10
# or newer. Older npm ignores the setting without a word, so an `npm install`
# on this machine would resolve versions published minutes ago. Node 22's
# bundled npm 10 is such a version. A warning, not a failure: check 1 is what
# keeps the install matching the lockfile; this is about what the next install
# here would resolve. sgort/linked-data-explorer#119.
NPM_VERSION=$(npm --version 2>/dev/null || echo "unknown")
if ! node -e '
  const [major, minor] = process.argv[1].split(".").map(Number);
  process.exit(major > 11 || (major === 11 && minor >= 10) ? 0 : 1);
' "$NPM_VERSION"; then
  echo -e "${YELLOW}⚠ npm $NPM_VERSION ignores the min-release-age cooldown in .npmrc${NC} — it needs npm 11.10 or newer:"
  echo ""
  echo "  npm install -g npm@11"
fi

echo ""

if [ "$STALE" = true ]; then
  # `npm ci`, not `npm install`. The committed lockfile is the source of truth
  # here: `npm ci` installs exactly what it records, never rewrites it, and
  # fails loudly if package.json and the lockfile disagree. `npm install`
  # re-resolves the caret ranges instead; the cooldown in .npmrc holds it back
  # 14 days on npm 11.10 or newer, and on older npm (check 2) it can pull a
  # transitive version published that morning. See
  # ICTU-dependencies-assessment.md (linked-data-explorer), recommendations 3, 4
  # and 6. `npm install <package>` remains the way to add or upgrade one.
  echo -e "${RED}Dependencies are not ready.${NC} Install them from the lockfile:"
  echo ""
  echo "  npm ci"
  echo ""
  echo "  npm ci removes node_modules first, so stop any running dev servers."
  echo ""
  exit 1
fi

echo -e "${GREEN}Dependencies are ready.${NC}"
echo ""
