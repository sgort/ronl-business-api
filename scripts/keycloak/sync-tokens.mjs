#!/usr/bin/env node
/**
 * Copy Flevoland IT's token file into the Keycloak login theme (#400).
 *
 * Keycloak serves the theme itself, outside our build, so the theme cannot
 * import from packages/shared. It carries this committed copy instead, which
 * travels with the manual copy of keycloak-themes/ronl to the VM.
 * packages/frontend/src/keycloak-theme.test.ts fails when the copy falls
 * behind its source.
 *
 * Usage: npm run sync:keycloak-tokens
 */
import { copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = join(REPO, 'packages/shared/styles/flevoland/tokens.css');
const TARGET = join(REPO, 'keycloak-themes/ronl/login/resources/css/flevoland-tokens.css');

copyFileSync(SOURCE, TARGET);
console.log(`Copied ${relative(REPO, SOURCE)} -> ${relative(REPO, TARGET)}`);
