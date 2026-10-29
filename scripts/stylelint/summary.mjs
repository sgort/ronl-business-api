// Prints the stylelint warnings as a count per rule and per file, as a
// Markdown table: the measurement #374 item 2 exists to produce. Run with
// `npm run lint:css:summary`; `npm run lint:css` gives the line-by-line list.
//
// Report-only, like the config: always exits 0 unless stylelint itself fails.
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function summarize(results, cwd) {
  const totals = {};
  const files = [];
  for (const r of results) {
    if (r.warnings.length === 0) continue;
    const counts = {};
    for (const w of r.warnings) {
      counts[w.rule] = (counts[w.rule] ?? 0) + 1;
      totals[w.rule] = (totals[w.rule] ?? 0) + 1;
    }
    const file = relative(cwd, r.source).split(sep).join("/");
    files.push({ file, counts, total: r.warnings.length });
  }
  files.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file));
  const rules = Object.keys(totals).sort();
  const total = files.reduce((n, f) => n + f.total, 0);
  return { rules, files, totals, total, scanned: results.length };
}

export function formatTable({ rules, files, totals, total, scanned }) {
  if (total === 0) return `No warnings in ${scanned} file(s).\n`;
  const cell = (n) => (n ? String(n) : "–");
  const lines = [
    `| File | ${rules.join(" | ")} | Total |`,
    `| --- | ${rules.map(() => "---:").join(" | ")} | ---: |`,
    ...files.map((f) => `| ${f.file} | ${rules.map((r) => cell(f.counts[r])).join(" | ")} | ${f.total} |`),
    `| **Total** | ${rules.map((r) => cell(totals[r])).join(" | ")} | ${total} |`,
  ];
  return `${lines.join("\n")}\n\n${files.length} of ${scanned} file(s) have warnings.\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { default: stylelint } = await import("stylelint");
  const { results } = await stylelint.lint({ files: "**/*.css", ignorePath: ".gitignore" });
  process.stdout.write(formatTable(summarize(results, process.cwd())));
}
