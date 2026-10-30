// Colour maths for the CSS equivalence check and the Flevoland contrast test
// (#374, step 1): parse CSS colours, evaluate color-mix(in srgb, …), WCAG
// contrast and CIEDE2000. No dependency on purpose: it keeps the lockfile out
// of this change, and the maths is short. Tests: packages/frontend/src/
// css-colour.test.ts (there so CI runs them).

/** @typedef {{ r: number, g: number, b: number, a: number }} Rgba */

const NAMED = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
};

/** Hex, rgb()/rgba() and the three named colours the stylesheets use. */
export function parseColour(text) {
  const t = text.trim().toLowerCase();
  if (t in NAMED) return { ...NAMED[t] };
  const hex = /^#([0-9a-f]{3,8})$/.exec(t);
  if (hex) {
    let h = hex[1];
    if (h.length === 5 || h.length === 7) return null;
    if (h.length <= 4) h = [...h].map((ch) => ch + ch).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(t);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const channel = (p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p));
    const alpha = (p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p));
    const [r, g, b] = parts.slice(0, 3).map(channel);
    const a = parts[3] === undefined ? 1 : alpha(parts[3]);
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }
  return null;
}

/** CSS Color 5 color-mix(in srgb, c1 p1, c2 p2): premultiplied alpha. */
export function mixSrgb(c1, p1, c2, p2) {
  let w1 = p1;
  let w2 = p2;
  if (w1 === null && w2 === null) w1 = w2 = 50;
  else if (w1 === null) w1 = 100 - w2;
  else if (w2 === null) w2 = 100 - w1;
  const sum = w1 + w2;
  const scale = sum < 100 ? sum / 100 : 1;
  w1 /= sum;
  w2 /= sum;
  const a = c1.a * w1 + c2.a * w2;
  const ch = (k) => (a === 0 ? 0 : (c1[k] * c1.a * w1 + c2[k] * c2.a * w2) / a);
  return { r: ch('r'), g: ch('g'), b: ch('b'), a: a * scale };
}

function over(fg, bg) {
  const a = fg.a + bg.a * (1 - fg.a);
  const ch = (k) => (a === 0 ? 0 : (fg[k] * fg.a + bg[k] * bg.a * (1 - fg.a)) / a);
  return { r: ch('r'), g: ch('g'), b: ch('b'), a };
}

function linear(v) {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(c) {
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

/** WCAG 2.x contrast; a translucent foreground is composited over the background. */
export function contrastRatio(fg, bg) {
  const base = bg.a < 1 ? over(bg, NAMED.white) : bg;
  const top = fg.a < 1 ? over(fg, base) : fg;
  const [hi, lo] = [luminance(top), luminance(base)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toLab(c) {
  const [r, g, b] = [linear(c.r), linear(c.g), linear(c.b)];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000 on two Lab triples (Sharma, Wu, Dalal 2005). */
export function deltaE2000Lab([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b, a) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2p - h1p;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2);
  const Lm = (L1 + L2) / 2;
  const Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hm /= 2;
    else hm = h1p + h2p < 360 ? (hm + 360) / 2 : (hm - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hm - 30) * rad) +
    0.24 * Math.cos(2 * hm * rad) +
    0.32 * Math.cos((3 * hm + 6) * rad) -
    0.2 * Math.cos((4 * hm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hm - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const SC = 1 + 0.045 * Cmp;
  const SH = 1 + 0.015 * Cmp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt(
    (dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH)
  );
}

/** CIEDE2000 between two sRGB colours (alpha ignored; compare it separately). */
export function deltaE2000(c1, c2) {
  return deltaE2000Lab(toLab(c1), toLab(c2));
}

/** Index just past the parenthesis that closes the one opening at `open`. */
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i + 1;
  }
  return -1;
}

/** Split on commas that are not inside parentheses. */
function topLevelSplit(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim());
}

function substituteVars(value, env, depth) {
  // depth counts nesting (a var whose value holds a var), so a cycle ends it.
  if (depth > 20) return null;
  let out = value;
  for (let at = out.indexOf('var('); at >= 0; at = out.indexOf('var(')) {
    const end = closing(out, at + 3);
    if (end < 0) return null;
    const [name, ...fallback] = topLevelSplit(out.slice(at + 4, end - 1));
    let replacement = env.get(name);
    if (replacement === undefined) {
      if (fallback.length === 0) return null;
      replacement = fallback.join(', ');
    }
    const inner = substituteVars(replacement, env, depth + 1);
    if (inner === null) return null;
    out = out.slice(0, at) + inner + out.slice(end);
  }
  return out;
}

function format(c) {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

function evaluateMixes(value) {
  let text = value;
  for (let at = text.lastIndexOf('color-mix('); at >= 0; at = text.lastIndexOf('color-mix(')) {
    const end = closing(text, at + 9);
    if (end < 0) return null;
    const [space, ...args] = topLevelSplit(text.slice(at + 10, end - 1));
    if (space !== 'in srgb' || args.length !== 2) return null;
    const parsed = args.map((arg) => {
      const m = /^(.*?)\s+([\d.]+)%$/.exec(arg);
      return m ? { colour: parseColour(m[1]), p: parseFloat(m[2]) } : { colour: parseColour(arg), p: null };
    });
    if (parsed.some((x) => x.colour === null)) return null;
    const mixed = mixSrgb(parsed[0].colour, parsed[0].p, parsed[1].colour, parsed[1].p);
    text = text.slice(0, at) + format(mixed) + text.slice(end);
  }
  return text;
}

const COLOUR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:transparent|white|black)\b/g;

/**
 * Resolve a declaration value against custom properties: the colours in it,
 * in order, and the rest of the text with each colour replaced by <c>.
 * null when a var() cannot be resolved, on a cycle, or on a colour space
 * other than srgb.
 */
export function resolveValue(value, env) {
  const substituted = substituteVars(value, env, 0);
  if (substituted === null) return null;
  const mixed = evaluateMixes(substituted);
  if (mixed === null) return null;
  const colours = [];
  const rest = mixed
    .replace(COLOUR_TOKEN, (token) => {
      const colour = parseColour(token);
      if (colour === null) return token;
      colours.push(colour);
      return '<c>';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { colours, rest };
}
