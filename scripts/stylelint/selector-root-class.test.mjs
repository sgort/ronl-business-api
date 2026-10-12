// Tests for selector-root-class.mjs. Self-contained, like the other
// scripts/*.test.mjs: no test runner, prints a PASS count, exits 1 on any
// failure. Run with `node scripts/stylelint/selector-root-class.test.mjs`.
import stylelint from "stylelint";
import { fileURLToPath } from "node:url";

const PLUGIN = fileURLToPath(new URL("./selector-root-class.mjs", import.meta.url));
const RULE = "rba/selector-root-class";

let passed = 0;
let failed = 0;

async function warnings(code, roots) {
  const result = await stylelint.lint({
    code,
    config: { plugins: [PLUGIN], rules: { [RULE]: [true, { roots }] } },
  });
  return result.results[0].warnings.filter((w) => w.rule === RULE);
}

async function expectCount(name, code, roots, count) {
  const got = await warnings(code, roots);
  if (got.length === count) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL ${name}: expected ${count} warning(s), got ${got.length}`);
    for (const w of got) console.error(`  ${w.text}`);
  }
}

await expectCount("descendant of the root", ".cwd-v2 .card { color: red; }", [".cwd-v2"], 0);
await expectCount("the root itself", ".cwd-v2 { color: red; }", [".cwd-v2"], 0);
await expectCount("root compounded with another class", ".cwd-v2.pbd .x { color: red; }", [".pbd"], 0);
await expectCount("child combinator after the root", ".pac > .row { color: red; }", [".pac"], 0);
await expectCount("unscoped class", ".card { color: red; }", [".cwd-v2"], 1);
await expectCount("root only further down", ".card .cwd-v2 { color: red; }", [".cwd-v2"], 1);
await expectCount("element selector", "body { margin: 0; }", [".cwd-v2"], 1);
await expectCount("root class name is not a prefix match", ".cwd-v2x .a { color: red; }", [".cwd-v2"], 1);
await expectCount("each selector in a list counts", ".cwd-v2 .a, .b { color: red; }", [".cwd-v2"], 1);
await expectCount("any of several roots", ".pbd .a, .cwd-v2 .b { color: red; }", [".cwd-v2", ".pbd"], 0);
await expectCount("prefix root", ".pac-dchangelog-panel { color: red; }", [".pac-dchangelog-*"], 0);
await expectCount("prefix root, unrelated class", ".pac-other { color: red; }", [".pac-dchangelog-*"], 1);
await expectCount("root with a pseudo-class", ".lcp-denied:hover .x { color: red; }", [".lcp-denied"], 0);
await expectCount("inside @media", "@media (max-width: 600px) { .x { color: red; } }", [".pac"], 1);
await expectCount(":root is skipped", ":root { --a: 1px; }", [".pac"], 0);
await expectCount("@keyframes steps are skipped", "@keyframes spin { from { opacity: 0; } 50% { opacity: 1; } }", [".pac"], 0);
await expectCount("class inside :not() of the first compound does not count", "div:not(.pac) .x { color: red; }", [".pac"], 1);

const bad = await stylelint.lint({
  code: ".a {}",
  config: { plugins: [PLUGIN], rules: { [RULE]: [true, { roots: [] }] } },
});
if (bad.results[0].invalidOptionWarnings.length > 0) {
  passed++;
} else {
  failed++;
  console.error("FAIL empty roots: expected an invalid-option warning");
}

console.log(`${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
