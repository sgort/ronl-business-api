// Tests for summary.mjs. Self-contained, like the other scripts/*.test.mjs:
// no test runner, prints a PASS count, exits 1 on any failure. Run with
// `node scripts/stylelint/summary.test.mjs`.
import { summarize, formatTable } from "./summary.mjs";

let passed = 0;
let failed = 0;
function check(name, ok) {
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL ${name}`);
  }
}

const cwd = "/repo";
const results = [
  {
    source: "/repo/a.css",
    warnings: [{ rule: "color-no-hex" }, { rule: "color-no-hex" }, { rule: "rba/selector-root-class" }],
  },
  { source: "/repo/pkg/b.css", warnings: [{ rule: "color-no-hex" }] },
  { source: "/repo/clean.css", warnings: [] },
];

const s = summarize(results, cwd);
check("rules sorted by name", JSON.stringify(s.rules) === JSON.stringify(["color-no-hex", "rba/selector-root-class"]));
check("files with warnings only, most first", JSON.stringify(s.files.map((f) => f.file)) === JSON.stringify(["a.css", "pkg/b.css"]));
check("per-file counts", s.files[0].counts["color-no-hex"] === 2 && s.files[0].counts["rba/selector-root-class"] === 1);
check("per-file total", s.files[0].total === 3 && s.files[1].total === 1);
check("per-rule totals", s.totals["color-no-hex"] === 3 && s.totals["rba/selector-root-class"] === 1);
check("grand total", s.total === 4);
check("files scanned counts clean ones", s.scanned === 3);

const table = formatTable(s);
check("table has a header with every rule", /\| File \|.*color-no-hex.*rba\/selector-root-class/.test(table));
check("table has a total row", /^\| \*\*Total\*\* \| 3 \| 1 \| 4 \|$/m.test(table));
check("footer counts files with warnings", table.includes("2 of 3 file(s) have warnings."));
check("table zero shows as dash", /pkg\/b\.css \| 1 \| – \| 1 \|/.test(table));

check("empty input", summarize([], cwd).total === 0 && formatTable(summarize([], cwd)).includes("No warnings"));

console.log(`${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
