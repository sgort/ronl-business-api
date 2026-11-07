#!/usr/bin/env node
// Cascade check for rules moved between stylesheets (#374 item 4; design:
// docs/superpowers/specs/2026-10-31-v2-chrome-shared-stylesheet-design.md).
//
//   npm run check:css-move -- [--base <ref>] [--host frontend|pa-demo] [--files]
//
// check:css-equivalence compares one file with itself at a base ref, so a
// rule that moved to another file shows there as removed and added. This
// compares an app's whole cascade instead: every stylesheet it loads, in the
// order the browser applies them (read from the import graph from its
// main.tsx), at the base ref and in the working tree. For each at-rule chain,
// single selector and property, the winning (last) declaration must have the
// same value, resolved per tenant environment exactly as
// check:css-equivalence does it. And two declarations that set a longhand in
// common (the same property, a shorthand and its longhands) must keep their
// order, when their selectors have equal specificity and can style the same
// element, so a declaration cannot slip past a competing rule. Which classes
// an app renders, and which share an element, come from its components'
// className attributes (classOracle). --files lists the load order.
//
// Limits:
// - Custom properties are flattened per environment, so an inline style that
//   sets one on an element (Infra-board's and Woo's --v2-accent) is not seen.
// - A className composed across components is not followed (see classOracle).
// - Ancestors are not compared: two `code` rules under different parents
//   count as competing.
// - Tailwind is not expanded: index.css is read as written, so its
//   @tailwind and @apply output is invisible. A move across index.css (PA's
//   chrome now loads before it in the frontend) needs a manual check of the
//   utilities on the elements involved; done for #374 item 4.
// - Order is compared within one at-rule chain: a rule inside @media is not
//   weighed against the same selector outside it.
// - Rules whose selector holds [data-tenant are left out, as in
//   check:css-equivalence. A new custom property is not a finding unless it
//   redefines an existing name. Dynamic import() is not followed.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss from 'postcss';
import ts from 'typescript';
import {
  REPO_ROOT,
  SCAN_ROOTS,
  TOKEN_FILES,
  atBase,
  collectEnv,
  cssUnder,
  isTenantRule,
  sameValue,
  tenantThemes,
} from './check-equivalence.mjs';

/**
 * The apps this check knows, by their entry module. Their stylesheets, in
 * the order the browser applies them, come from the import graph
 * (cssLoadOrder), at the base ref and in the working tree, and every
 * selector in them is compared.
 */
export const HOSTS = {
  frontend: {
    entry: 'packages/frontend/src/main.tsx',
    // Page roots that are never nested in one another, so rules under
    // different groups never reach the same element. Checked 2026-10-31:
    // .cwd-v2 is the Caseworker, Infra-board (cwd-v2 pbd) and Woo (cwd-v2
    // wood) root, with the signing panel and the process view (.pbd) inside;
    // .pac is PA-Cockpit's own route; .lcp* are the sign-in and landing pages.
    exclusive: [
      ['.cwd-v2', '.cwd-v2-palette', '.cwd-v2-palette-overlay', '.pbd', '.wood', '.pb-sign-panel'],
      ['.pac', '.pac-palette', '.pac-palette-overlay'],
      ['.lcp', '.lcp-single', '.lcp-denied'],
    ],
  },
  'pa-demo': { entry: 'packages/pa-demo/src/main.tsx' },
};

/** The workspace packages an import can name, as repo paths. */
export const ALIASES = {
  '@ronl/pa-cockpit': 'packages/pa-cockpit/src/index.ts',
  '@ronl/pa-cockpit/styles.css': 'packages/pa-cockpit/src/styles.css',
  '@ronl/shared': 'packages/shared/src/index.ts',
  '@ronl/shared/': 'packages/shared/',
};

/** Whether a selector's first compound carries one of the root classes; every selector without roots. */
function inHost(selector, roots) {
  if (!roots) return true;
  const first = selector.split(/[\s>+~]/)[0];
  const classes = first.match(/\.[\w-]+/g) ?? [];
  return classes.some((c) => roots.includes(c));
}

function chainOf(rule) {
  const parts = [];
  for (let n = rule.parent; n && n.type !== 'root'; n = n.parent) {
    if (n.type === 'atrule') parts.unshift(`@${n.name} ${n.params}`.trim());
  }
  return parts.join(' > ');
}

/**
 * The host's declarations in cascade order: one entry per single selector,
 * property and occurrence, each with its position.
 */
function cascade(texts, roots) {
  const out = [];
  let seq = 0;
  for (const css of texts) {
    if (!css) continue;
    postcss.parse(css).walkRules((rule) => {
      // A [data-tenant] rule never applies to the environments compared.
      if (rule.selector.includes('[data-tenant') || isTenantRule(rule)) return;
      const chain = chainOf(rule);
      for (const raw of rule.selectors) {
        const selector = raw.replace(/\s+/g, ' ').trim();
        if (!inHost(selector, roots)) continue;
        rule.each((decl) => {
          if (decl.type !== 'decl') return;
          out.push({
            chain,
            selector,
            prop: decl.prop,
            value: decl.value.trim() + (decl.important ? ' !important' : ''),
            seq: seq++,
          });
        });
      }
    });
  }
  return out;
}

const keyOf = (d) => `${d.chain}\u0000${d.selector}\u0000${d.prop}`;
const label = (d) => (d.chain ? `${d.chain} > ${d.selector}` : d.selector);

/** The winning declaration per chain, selector and property. */
function winners(decls) {
  const out = new Map();
  for (const d of decls) out.set(keyOf(d), d);
  return out;
}

/** Shorthands and the longhands they set, as property families. */
const FAMILIES = [
  'border-radius', 'list-style', 'text-decoration', 'padding', 'margin', 'border', 'background',
  'font', 'flex', 'grid', 'overflow', 'outline', 'transition', 'animation', 'mask',
  'scroll-margin', 'scroll-padding',
];
const INSET = new Set(['top', 'right', 'bottom', 'left']);
const GAP = new Set(['gap', 'row-gap', 'column-gap', 'grid-gap', 'grid-row-gap', 'grid-column-gap']);

/** Shorthands that set longhands not named after them. */
const ALSO_SETS = {
  font: ['line-height'],
  'place-items': ['align-items', 'justify-items'],
  'place-content': ['align-content', 'justify-content'],
  'place-self': ['align-self', 'justify-self'],
  'flex-flow': ['flex-direction', 'flex-wrap'],
  'grid-area': ['grid-row', 'grid-column'],
  columns: ['column-width', 'column-count'],
  inset: ['top', 'right', 'bottom', 'left', 'inset-inline', 'inset-block'],
  'inset-inline': ['left', 'right'],
  'inset-block': ['top', 'bottom'],
  gap: ['row-gap', 'column-gap'],
  'grid-gap': ['row-gap', 'column-gap', 'grid-row-gap', 'grid-column-gap'],
};

/** The family a property belongs to: a shorthand and every longhand it sets share one. */
export function family(prop) {
  if (prop.startsWith('--')) return prop;
  if (prop === 'line-height') return 'font';
  if (INSET.has(prop) || prop.startsWith('inset')) return 'inset';
  if (GAP.has(prop)) return 'gap';
  if (prop === 'columns' || prop === 'column-width' || prop === 'column-count') return 'columns';
  if (/^(place|align|justify)-(items|content|self)$/.test(prop)) return 'place';
  return FAMILIES.find((f) => prop === f || prop.startsWith(`${f}-`)) ?? prop;
}

const BORDER_SIDES = ['top', 'right', 'bottom', 'left', 'block', 'inline', 'block-start', 'block-end', 'inline-start', 'inline-end'];
const BORDER_ASPECTS = ['width', 'style', 'color'];

/**
 * Whether two properties of one family set a longhand in common: the same
 * property, a shorthand and anything under it, or two border sub-shorthands
 * that cross (border-left and border-color both set border-left-color).
 */
export function overlaps(a, b) {
  if (a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`)) return true;
  const sets = (x, y) => (ALSO_SETS[x] ?? []).some((l) => y === l || y.startsWith(`${l}-`));
  if (sets(a, b) || sets(b, a)) return true;
  const fa = family(a);
  if (fa !== family(b)) return false;
  if (a === fa || b === fa) return true;
  if (fa === 'border') {
    const parse = (p) => {
      const rest = p.slice('border-'.length);
      const aspect = BORDER_ASPECTS.find((x) => rest === x || rest.endsWith(`-${x}`));
      const side = BORDER_SIDES.filter((s) => rest === s || rest.startsWith(`${s}-`)).sort((x, y) => y.length - x.length)[0];
      return { side, aspect };
    };
    const pa = parse(a);
    const pb = parse(b);
    return (!pa.side || !pb.side || pa.side === pb.side) && (!pa.aspect || !pb.aspect || pa.aspect === pb.aspect);
  }
  return false;
}

/** Declarations per chain + property family, in the order of their winning declarations. */
function orders(win) {
  const out = new Map();
  for (const d of [...win.values()].sort((x, y) => x.seq - y.seq)) {
    const k = `${d.chain}\u0000${family(d.prop)}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(d);
  }
  return out;
}

const skipIdent = (s, i) => {
  while (i < s.length && /[\w-]/.test(s[i])) i++;
  return i;
};
/** The index just past the parenthesis that closes the one at `open`. */
const closeParen = (s, open) => {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i + 1;
  }
  return s.length;
};
/** Split on commas outside parentheses. */
const topLevelCommas = (s) => {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
};
const LEGACY_PSEUDO_ELEMENTS = ['before', 'after', 'first-line', 'first-letter'];
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

/**
 * Selector specificity as [ids, classes/attributes/pseudo-classes,
 * types/pseudo-elements]. :not(), :is() and :has() count their most specific
 * argument, :where() counts nothing.
 */
export function specificity(selector) {
  const s = [0, 0, 0];
  let i = 0;
  while (i < selector.length) {
    const ch = selector[i];
    if (ch === '#') {
      s[0]++;
      i = skipIdent(selector, i + 1);
    } else if (ch === '.') {
      s[1]++;
      i = skipIdent(selector, i + 1);
    } else if (ch === '[') {
      s[1]++;
      i = selector.indexOf(']', i) + 1 || selector.length;
    } else if (ch === ':' && selector[i + 1] === ':') {
      s[2]++;
      i = skipIdent(selector, i + 2);
      if (selector[i] === '(') i = closeParen(selector, i);
    } else if (ch === ':') {
      const j = skipIdent(selector, i + 1);
      const name = selector.slice(i + 1, j).toLowerCase();
      if (selector[j] === '(') {
        const k = closeParen(selector, j);
        if (['not', 'is', 'has', 'matches'].includes(name)) {
          const best = topLevelCommas(selector.slice(j + 1, k - 1))
            .map(specificity)
            .sort(cmp)
            .pop();
          for (let n = 0; n < 3; n++) s[n] += best[n];
        } else if (name !== 'where') s[1]++;
        i = k;
      } else {
        s[LEGACY_PSEUDO_ELEMENTS.includes(name) ? 2 : 1]++;
        i = j;
      }
    } else if (/[a-zA-Z]/.test(ch)) {
      s[2]++;
      i = skipIdent(selector, i);
    } else i++;
  }
  return s;
}

/** The last compound of a selector: its element type, classes and pseudo-element. */
function finalCompound(selector) {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) start = i + 1;
  }
  const compound = selector.slice(start);
  const pseudo = /::?(before|after|placeholder|marker|selection|backdrop)\b/.exec(compound)?.[1] ?? '';
  const classes = (compound.replace(/:[\w-]+(\([^)]*\))?/g, '').match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1));
  const tag = /^[a-zA-Z][\w-]*/.exec(compound)?.[0].toLowerCase() ?? '';
  return { tag, classes, pseudo };
}

/** The class-like tokens in a piece of string-literal text. */
const classTokens = (text) => text.split(/\s+/).filter((t) => /^-?[A-Za-z_][\w-]*$/.test(t));

/**
 * Which selectors can style the same element, judged from the components,
 * read with the TypeScript parser (so comments, JSX text and apostrophes
 * cannot mislead it):
 *
 * - one set of class tokens per className attribute, from every string and
 *   template literal inside it (conditional parts included, so it
 *   over-approximates), with its element type ('' for a component);
 * - every class token in any string literal of the code, so a class held in
 *   a variable or passed as a prop counts as rendered;
 * - the static prefixes and suffixes of template literals (`fill-${n}`), for
 *   classes built at run time.
 *
 * Two selectors compete when their last compounds have the same
 * pseudo-element, no differing element types, and one className holds all
 * their known classes together. A class built at run time, or a last compound
 * without classes, counts as competing, to be safe. A class that appears in
 * no literal and no template is dead: rules naming it match nothing
 * (`competes.renders`).
 *
 * Limits: a className composed across components (a prop merged into
 * another component's className) is not followed, so two classes that only
 * meet that way read as not competing.
 */
export function classOracle(sources, { exclusive = [] } = {}) {
  const elements = [];
  const literal = new Set();
  const prefixes = new Set();
  const suffixes = new Set();

  const literalsUnder = (node, out) => {
    const visit = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        for (const t of classTokens(n.text)) out.add(t);
      } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        const tokens = n.text.split(/\s+/);
        // A token touching a ${} is part of a class built at run time.
        const head = !ts.isTemplateHead(n) && n.text && !/^\s/.test(n.text) ? tokens.shift() : null;
        const tail = !ts.isTemplateTail(n) && n.text && !/\s$/.test(n.text) ? tokens.pop() : null;
        if (head) suffixes.add(head);
        if (tail) prefixes.add(tail);
        // `pb-stepper${variant}` most often renders pb-stepper plus another
        // class: count the touching tokens as carried, too.
        for (const t of classTokens([head, ...tokens, tail].filter(Boolean).join(' '))) out.add(t);
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
  };

  for (const src of sources) {
    const sf = ts.createSourceFile('x.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    literalsUnder(sf, literal);
    const visit = (n) => {
      if (ts.isJsxAttribute(n) && n.initializer && ['className', 'class'].includes(n.name.getText(sf))) {
        const classes = new Set();
        literalsUnder(n.initializer, classes);
        const owner = n.parent?.parent;
        const name = owner && (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner)) ? owner.tagName.getText(sf) : '';
        elements.push({ classes, tag: /^[a-z][\w-]*$/.test(name) ? name : '' });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  const known = new Set(elements.flatMap((e) => [...e.classes]));
  const dead = (c) =>
    !literal.has(c) &&
    ![...prefixes].some((p) => p && c.startsWith(p)) &&
    ![...suffixes].some((x) => x && c.endsWith(x));
  const carriers = (classes, tag) =>
    elements.some((e) => classes.every((c) => e.classes.has(c)) && (!tag || !e.tag || e.tag === tag));
  /** Whether a selector can match at all: none of its classes, in any compound, is dead. */
  const renders = (selector) => !(selector.match(/\.[\w-]+/g) ?? []).some((c) => dead(c.slice(1)));

  // The group of page roots a selector's first compound belongs to; -1 for none.
  const groupOf = (selector) => {
    const first = selector.split(/[\s>+~]/)[0].match(/\.[\w-]+/g) ?? [];
    return exclusive.findIndex((g) => first.some((c) => g.includes(c)));
  };

  const competes = (a, b) => {
    const ga = groupOf(a);
    const gb = groupOf(b);
    if (ga >= 0 && gb >= 0 && ga !== gb) return false;
    const fa = finalCompound(a);
    const fb = finalCompound(b);
    if (fa.pseudo !== fb.pseudo) return false;
    if (fa.tag && fb.tag && fa.tag !== fb.tag) return false;
    if (!renders(a) || !renders(b)) return false;
    const ka = fa.classes.filter((c) => known.has(c));
    const kb = fb.classes.filter((c) => known.has(c));
    // An element-type-only compound: does an element of that type carry the other's classes?
    if (!fa.classes.length || !fb.classes.length) {
      const [typed, other] = fa.classes.length ? [fb, ka] : [fa, kb];
      if (!typed.tag || !other.length) return true;
      return carriers(other, typed.tag);
    }
    // A compound whose classes are only built at run time: may be anything.
    if (!ka.length || !kb.length) return true;
    return carriers([...new Set([...ka, ...kb])], fa.tag || fb.tag);
  };
  competes.renders = renders;
  return competes;
}

/** Findings for one host: before and after are its stylesheets' texts in load order. */
export function compareCascades({ before, after, roots, envsBefore, envsAfter, competes = () => true }) {
  const findings = [];
  // A rule for classes the app never renders cannot change what it shows.
  const renders = competes.renders ?? (() => true);
  const b = winners(cascade(before, roots));
  const a = winners(cascade(after, roots));

  for (const [key, d] of b) {
    if (!renders(d.selector)) continue;
    if (!a.has(key)) findings.push({ kind: 'removed', selector: label(d), prop: d.prop, env: '*', detail: d.value });
  }
  for (const [key, d] of a) {
    if (!renders(d.selector)) continue;
    const old = b.get(key);
    if (!old) {
      const redefines = Object.values(envsBefore).some((env) => env.has(d.prop));
      if (!d.prop.startsWith('--') || redefines) {
        findings.push({ kind: 'added', selector: label(d), prop: d.prop, env: '*', detail: d.value });
      }
      continue;
    }
    for (const env of Object.keys(envsAfter).filter((e) => e in envsBefore)) {
      const result = sameValue(old.value, d.value, envsBefore[env], envsAfter[env]);
      if (!result.equal) {
        findings.push({
          kind: result.kind,
          selector: label(d),
          prop: d.prop,
          env,
          detail: `${old.value} → ${d.value}${result.detail ? ` (${result.detail})` : ''}`,
        });
      }
    }
  }

  // Order: a declaration is out of place when one that came after it, in the
  // same property family (a shorthand and its longhands), now comes before
  // it, at equal specificity, and the two can style one element. That
  // includes two declarations of the same selector, which used to share a rule.
  const ob = orders(b);
  const oa = orders(a);
  const at = (d) => `${d.selector}\u0000${d.prop}`;
  for (const [k, list] of ob) {
    const after = oa.get(k);
    if (!after) continue;
    const pos = new Map(after.map((d, i) => [at(d), i]));
    const common = list.filter((d) => pos.has(at(d)));
    common.forEach((d, i) => {
      const jumped = common
        .slice(i + 1)
        .find(
          (later) =>
            pos.get(at(later)) < pos.get(at(d)) &&
            overlaps(d.prop, later.prop) &&
            cmp(specificity(d.selector), specificity(later.selector)) === 0 &&
            competes(d.selector, later.selector)
        );
      if (jumped) {
        findings.push({
          kind: 'order',
          selector: label(d),
          prop: d.prop,
          env: '*',
          detail: `now after ${label(jumped)}, which used to follow it`,
        });
      }
    });
  }
  return findings;
}

// ------------------------------------------------------- load order

const stripBlockComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const posix = (p) => {
  const out = [];
  for (const part of p.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
};
const dirOf = (p) => p.split('/').slice(0, -1).join('/');

/**
 * The stylesheets an app applies, in cascade order, from its entry module.
 * Modules run depth first in import-statement order, each once; a stylesheet
 * imported from JS joins the cascade when its module runs; a CSS @import is
 * applied before the file that imports it. Vite keeps this order in dev and
 * in the build. Type-only imports load nothing; bare package imports outside
 * `aliases` are not followed. Not modelled: dynamic import() (none today).
 *
 * `read(path)` returns a repo-relative file's text, or null when it does not
 * exist; `aliases` maps a package specifier (or its prefix ending in '/') to
 * a repo-relative path. The JS/TS modules visited are pushed onto `modules`.
 */
export function cssLoadOrder(entry, read, aliases, modules = []) {
  const order = [];
  const seen = new Set();
  const resolve = (from, spec) => {
    let base;
    if (spec.startsWith('.')) base = posix(`${dirOf(from)}/${spec}`);
    else if (aliases[spec]) base = aliases[spec];
    else {
      const prefix = Object.keys(aliases).find((a) => a.endsWith('/') && spec.startsWith(a));
      if (!prefix) return null;
      base = posix(aliases[prefix] + spec.slice(prefix.length));
    }
    const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css'].map((e) => base + e)];
    candidates.push(...['index.ts', 'index.tsx', 'index.js'].map((i) => `${base}/${i}`));
    return candidates.find((c) => read(c) !== null) ?? null;
  };
  // A stylesheet reached through a CSS @import is inlined there, also when JS
  // imported it before: the later copy decides (in dev both copies exist, in
  // the build only the later one), so it is re-placed at its last position.
  const place = (path, text) => {
    for (const m of stripBlockComments(text).matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g)) {
      const dep = resolve(path, m[1]);
      const depText = dep && read(dep);
      if (depText != null) {
        seen.add(dep);
        place(dep, depText);
      }
    }
    const at = order.indexOf(path);
    if (at >= 0) order.splice(at, 1);
    order.push(path);
  };
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    const text = read(path);
    if (text === null) return;
    if (path.endsWith('.css')) {
      place(path, text);
      return;
    }
    modules.push(path);
    const code = stripBlockComments(text).replace(/^\s*\/\/.*$/gm, '');
    const IMPORT = /^\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\bfrom\s+)?['"]([^'"]+)['"]/gm;
    for (const m of code.matchAll(IMPORT)) {
      if (m[1]) continue;
      const dep = resolve(path, m[2]);
      if (dep) visit(dep);
    }
  };
  visit(entry);
  return order;
}

// ---------------------------------------------------------------- CLI

function main(argv) {
  let base = 'acc';
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') base = argv[++i];
    else if (argv[i] === '--host') only = argv[++i];
  }
  const hosts = only ? { [only]: HOSTS[only] } : HOSTS;
  if (only && !HOSTS[only]) {
    console.error(`Unknown host ${only}; known: ${Object.keys(HOSTS).join(', ')}`);
    return 2;
  }

  const read = (path) => (existsSync(join(REPO_ROOT, path)) ? readFileSync(join(REPO_ROOT, path), 'utf8') : '');
  const readNow = (path) => {
    const abs = join(REPO_ROOT, path);
    return existsSync(abs) && statSync(abs).isFile() ? readFileSync(abs, 'utf8') : null;
  };
  const gitOpts = { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] };
  // The files at the base ref, listed once: directories are not modules.
  const filesAtBase = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', base], gitOpts).split('\n'));
  const cacheBase = new Map();
  const readBase = (path) => {
    if (!filesAtBase.has(path)) return null;
    if (!cacheBase.has(path)) cacheBase.set(path, execFileSync('git', ['show', `${base}:${path}`], gitOpts));
    return cacheBase.get(path);
  };
  const TENANTS = 'packages/frontend/public/tenants.json';
  const parse = (text) => (text ? JSON.parse(text) : {});
  const themesBefore = tenantThemes(parse(atBase(base, TENANTS)));
  const themesAfter = tenantThemes(parse(read(TENANTS)));

  // Environment: the tokens first, then every stylesheet, as check:css-equivalence.
  const all = SCAN_ROOTS.flatMap(cssUnder);
  const envTexts = (load) => [...TOKEN_FILES, ...all.filter((f) => !TOKEN_FILES.includes(f))].map(load);
  const envsBefore = {};
  const envsAfter = {};
  const textsBefore = envTexts((f) => atBase(base, f));
  const textsAfter = envTexts(read);
  for (const [name, theme] of Object.entries(themesBefore)) envsBefore[name] = collectEnv(textsBefore, theme);
  for (const [name, theme] of Object.entries(themesAfter)) envsAfter[name] = collectEnv(textsAfter, theme);

  let total = 0;
  for (const [name, host] of Object.entries(hosts)) {
    const filesBefore = cssLoadOrder(host.entry, readBase, ALIASES);
    const modules = [];
    const filesAfter = cssLoadOrder(host.entry, readNow, ALIASES, modules);
    // Which classes the app renders, and which share an element: from the
    // components it loads, in the working tree.
    const competes = classOracle(modules.map(readNow), { exclusive: host.exclusive });
    if (process.argv.includes('--files')) {
      console.log(`${name} before:\n  ${filesBefore.join('\n  ')}\n${name} after:\n  ${filesAfter.join('\n  ')}`);
    }
    const findings = compareCascades({
      before: filesBefore.map(readBase),
      after: filesAfter.map(readNow),
      envsBefore,
      envsAfter,
      competes,
    });
    total += findings.length;
    for (const f of findings) console.log(`${name}: [${f.env}] ${f.kind} ${f.selector} { ${f.prop} } ${f.detail}`);
    console.log(`${name}: ${findings.length} finding(s) across ${filesAfter.length} stylesheet(s)`);
  }
  console.log(`${total} findings across ${Object.keys(hosts).length} host(s), base ${base}, ${Object.keys(themesAfter).length} environment(s)`);
  return total === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
