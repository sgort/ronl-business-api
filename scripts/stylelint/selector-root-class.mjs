// rba/selector-root-class — every selector in a scoped stylesheet must start
// with that stylesheet's root class, so its rules cannot reach another surface
// (#374, docs/css-files.md). Configured per file in stylelint.config.mjs:
//
//   "rba/selector-root-class": [true, { roots: [".cwd-v2", ".pac-dchangelog-*"] }]
//
// The first compound of each selector (everything before the first combinator)
// must carry one of the roots as a class. A root ending in `*` matches any
// class with that prefix, for files whose components have no single wrapper.
// :root and @keyframes steps are skipped.
//
// Deliberately no selector-parser dependency: the first compound is cut at the
// first combinator outside brackets and parentheses, and classes are read only
// outside parentheses, so `div:not(.pac) .x` does not count as scoped.
import stylelint from "stylelint";

const {
  createPlugin,
  utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = "rba/selector-root-class";
const messages = ruleMessages(ruleName, {
  unscoped: (selector, roots) => `Selector "${selector}" does not start with a root class (${roots.join(", ")})`,
});

function firstCompound(selector) {
  let depth = 0;
  const s = selector.trim();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && (c === " " || c === ">" || c === "+" || c === "~")) return s.slice(0, i);
  }
  return s;
}

function classesOutsideParens(compound) {
  let depth = 0;
  let flat = "";
  for (const c of compound) {
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0) flat += c;
  }
  return [...flat.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
}

function matchesRoot(cls, root) {
  const name = root.replace(/^\./, "");
  return name.endsWith("*") ? cls.startsWith(name.slice(0, -1)) : cls === name;
}

function insideKeyframes(rule) {
  for (let p = rule.parent; p; p = p.parent) {
    if (p.type === "atrule" && /keyframes$/i.test(p.name)) return true;
  }
  return false;
}

const ruleFunction = (primary, secondary) => (root, result) => {
  const valid = validateOptions(
    result,
    ruleName,
    { actual: primary, possible: [true] },
    {
      actual: secondary,
      possible: { roots: [(r) => typeof r === "string" && r.startsWith(".")] },
    },
  );
  if (!valid) return;
  const roots = secondary?.roots ?? [];
  if (roots.length === 0) {
    result.warn(`Invalid option for "${ruleName}": roots must list at least one class`, {
      stylelintType: "invalidOption",
    });
    return;
  }

  root.walkRules((rule) => {
    if (insideKeyframes(rule)) return;
    for (const selector of rule.selectors) {
      if (selector.trim() === ":root") continue;
      const classes = classesOutsideParens(firstCompound(selector));
      if (classes.some((cls) => roots.some((r) => matchesRoot(cls, r)))) continue;
      report({
        result,
        ruleName,
        node: rule,
        message: messages.unscoped(selector.trim(), roots),
        word: selector.trim(),
      });
    }
  });
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;

export default createPlugin(ruleName, ruleFunction);
