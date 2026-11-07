#!/usr/bin/env node
// Equivalence check for other tenants (#374, step 1). Compares every
// declaration of the changed stylesheets against the same file at a base ref,
// with the custom properties resolved as a tenant other than Flevoland sees
// them, and fails when a colour moved by more than ΔE2000 1.0 (not visible)
// or anything else in a declaration changed.
//
//   npm run check:css-equivalence -- [--base <ref>] [files…]
//
// Default base: acc. Default files: the .css files under the scanned roots
// that differ from the base. Environments: no tenant theme (the --color-*
// fallbacks), and each enabled tenant in packages/frontend/public/tenants.json
// (read at the base for the before side), Flevoland included: without
// data-tenant its colours must not move either. Rules whose selector
// holds [data-tenant are left out of every environment and of the comparison,
// so the Flevoland overrides never count. A new custom property is not a
// finding either: it changes nothing until something uses it.
//
// Limits: custom properties are flattened (last declaration wins, whatever
// its selector), with the shared tokens first, then the other stylesheets,
// then the file itself. Declarations are matched by at-rule chain, selector,
// property and occurrence, so a moved or renamed rule shows as removed and
// added.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import postcss from 'postcss';
import { deltaE2000, resolveValue } from './colour.mjs';

const MAX_DELTA_E = 1.0;
const MAX_DELTA_ALPHA = 0.01;

const THEME_PROPS = {
  primary: '--color-primary',
  primaryDark: '--color-primary-dark',
  primaryLight: '--color-primary-light',
  secondary: '--color-secondary',
  accent: '--color-accent',
  background: '--color-background',
};

export function isTenantRule(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (n.type === 'rule' && n.selector.includes('[data-tenant')) return true;
  }
  return false;
}

/** Custom properties from the stylesheets (last wins), then the tenant theme. */
export function collectEnv(cssTexts, tenantTheme) {
  const env = new Map();
  for (const css of cssTexts) {
    if (!css) continue;
    postcss.parse(css).walkDecls((decl) => {
      if (decl.prop.startsWith('--') && !isTenantRule(decl)) env.set(decl.prop, decl.value.trim());
    });
  }
  for (const [key, prop] of Object.entries(THEME_PROPS)) {
    if (tenantTheme?.[key]) env.set(prop, tenantTheme[key]);
  }
  return env;
}

function context(decl) {
  const parts = [];
  for (let n = decl.parent; n && n.type !== 'root'; n = n.parent) {
    if (n.type === 'rule') parts.unshift(n.selector.replace(/\s+/g, ' ').trim());
    else if (n.type === 'atrule') parts.unshift(`@${n.name} ${n.params}`.trim());
  }
  return parts.join(' > ');
}

/** key → { selector, prop, value } with an occurrence counter per selector + prop. */
function declarations(css) {
  const out = new Map();
  const seen = new Map();
  postcss.parse(css).walkDecls((decl) => {
    // A [data-tenant] rule never applies to the tenants this check is for.
    if (isTenantRule(decl)) return;
    const selector = context(decl);
    const base = `${selector}\u0000${decl.prop}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const value = decl.value.trim() + (decl.important ? ' !important' : '');
    out.set(`${base}\u0000${n}`, { selector, prop: decl.prop, value });
  });
  return out;
}

export function sameValue(before, after, envBefore, envAfter) {
  if (before === after && envBefore === envAfter) return { equal: true };
  const b = resolveValue(before, envBefore);
  const a = resolveValue(after, envAfter);
  if (b === null || a === null) {
    return before === after ? { equal: true } : { equal: false, kind: 'unresolved' };
  }
  if (b.rest !== a.rest || b.colours.length !== a.colours.length) {
    return { equal: false, kind: 'changed' };
  }
  for (let i = 0; i < b.colours.length; i++) {
    // Fully transparent is invisible whatever its rgb (Tailwind's gradient stops).
    if (b.colours[i].a === 0 && a.colours[i].a === 0) continue;
    const dE = deltaE2000(b.colours[i], a.colours[i]);
    const dA = Math.abs(b.colours[i].a - a.colours[i].a);
    if (dE > MAX_DELTA_E || dA > MAX_DELTA_ALPHA) {
      return { equal: false, kind: 'changed', detail: `ΔE ${dE.toFixed(2)}, Δalpha ${dA.toFixed(3)}` };
    }
  }
  return { equal: true };
}

/** Findings for one stylesheet across the named environments. */
export function compareStylesheets({ before, after, envsBefore, envsAfter }) {
  const findings = [];
  const b = declarations(before);
  const a = declarations(after);
  for (const [key, decl] of b) {
    if (!a.has(key)) {
      findings.push({ ...pick(decl), env: '*', kind: 'removed', detail: decl.value });
    }
  }
  for (const [key, decl] of a) {
    const old = b.get(key);
    if (!old) {
      // A new custom property changes nothing until something uses it, and
      // its uses are compared resolved, unless it redefines a name that
      // already exists: then it may recolour its own scope, which the
      // flattened environment cannot see.
      const redefines = Object.values(envsBefore).some((env) => env.has(decl.prop));
      if (!decl.prop.startsWith('--') || redefines) {
        findings.push({ ...pick(decl), env: '*', kind: 'added', detail: decl.value });
      }
      continue;
    }
    // A tenant added or removed on one side has nothing to compare with.
    for (const env of Object.keys(envsAfter).filter((e) => e in envsBefore)) {
      const result = sameValue(old.value, decl.value, envsBefore[env], envsAfter[env]);
      if (!result.equal) {
        findings.push({
          ...pick(decl),
          env,
          kind: result.kind,
          detail: `${old.value} → ${decl.value}${result.detail ? ` (${result.detail})` : ''}`,
        });
      }
    }
  }
  return findings;
}

function pick(decl) {
  return { selector: decl.selector, prop: decl.prop };
}

// ---------------------------------------------------------------- CLI

export const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
export const SCAN_ROOTS = [
  'packages/shared/styles',
  'packages/frontend/src',
  'packages/pa-cockpit/src',
  'packages/pa-demo/src',
];
export const TOKEN_FILES = ['packages/shared/styles/flevoland/tokens.css', 'packages/shared/styles/tokens.css'];
/** Stylesheets no host loads (Flevoland IT's base styles wait for step 2 of #374). */
const NOT_LOADED = ['packages/shared/styles/flevoland/base.css'];

/** The stylesheets worth checking out of a list of changed paths. */
export function defaultTargets(changed) {
  return changed.filter((f) => f.endsWith('.css') && !NOT_LOADED.includes(f));
}

/** No tenant theme, then every enabled tenant's theme from a tenants.json. */
export function tenantThemes(json) {
  const themes = { none: null };
  for (const [id, t] of Object.entries(json?.tenants ?? {})) {
    if (t.enabled) themes[id] = t.theme;
  }
  return themes;
}

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export function atBase(base, path) {
  try {
    return git(['show', `${base}:${path}`]);
  } catch {
    return '';
  }
}

export function cssUnder(dir) {
  const abs = join(REPO_ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const path = join(abs, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(path).isDirectory()) return cssUnder(relative(REPO_ROOT, path));
    return name.endsWith('.css') ? [relative(REPO_ROOT, path).split('\\').join('/')] : [];
  });
}

function main(argv) {
  let base = 'acc';
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') base = argv[++i];
    else files.push(argv[i].split('\\').join('/'));
  }
  const all = SCAN_ROOTS.flatMap(cssUnder);
  const targets = files.length
    ? files
    : defaultTargets(git(['diff', '--name-only', base, '--', ...SCAN_ROOTS]).split('\n'));

  // Each side gets its own tenants.json, so a theme change shows up too.
  const TENANTS = 'packages/frontend/public/tenants.json';
  const parse = (text) => (text ? JSON.parse(text) : {});
  const themesBefore = tenantThemes(parse(atBase(base, TENANTS)));
  const themesAfter = tenantThemes(parse(readFileSync(join(REPO_ROOT, TENANTS), 'utf8')));

  const read = (path) => (existsSync(join(REPO_ROOT, path)) ? readFileSync(join(REPO_ROOT, path), 'utf8') : '');
  const others = (path, load) => [...TOKEN_FILES, ...all.filter((f) => !TOKEN_FILES.includes(f) && f !== path)].map(load);

  let total = 0;
  for (const path of targets) {
    const before = atBase(base, path);
    const after = read(path);
    const textsBefore = [...others(path, (f) => atBase(base, f)), before];
    const textsAfter = [...others(path, read), after];
    const envsBefore = {};
    const envsAfter = {};
    for (const [name, theme] of Object.entries(themesBefore)) envsBefore[name] = collectEnv(textsBefore, theme);
    for (const [name, theme] of Object.entries(themesAfter)) envsAfter[name] = collectEnv(textsAfter, theme);
    const findings = compareStylesheets({ before, after, envsBefore, envsAfter });
    total += findings.length;
    for (const f of findings) {
      console.log(`${path}: [${f.env}] ${f.kind} ${f.selector} { ${f.prop} } ${f.detail}`);
    }
    console.log(`${path}: ${findings.length} finding(s)`);
  }
  console.log(`${total} findings across ${targets.length} file(s), base ${base}, ${Object.keys(themesAfter).length} environment(s)`);
  return total === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
