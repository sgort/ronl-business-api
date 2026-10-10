// Tests for write-sbom.mjs. Self-contained, like the other scripts/*.test.mjs:
// no test runner, prints a PASS count, exits 1 on any failure. No npm run: the
// SBOM and the lockfile are fixtures.
import { readFileSync } from "node:fs";
import * as W from "./write-sbom.mjs";

let passed = 0;
const failures = [];
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else failures.push(`${label}\n    expected ${e}\n    actual   ${a}`);
}

const component = (name, version) => ({
  "bom-ref": `${name}@${version}`,
  type: "library",
  name,
  version,
});
const sbom = {
  bomFormat: "CycloneDX",
  metadata: { component: { "bom-ref": "app@1.0.0", name: "app" } },
  components: [
    component("react", "19.3.0"),
    component("react-dom", "19.3.0"),
    component("scheduler", "0.28.0"),
    component("vitest", "5.0.1"),
    component("ms", "2.1.3"),
    component("ms", "2.0.0"),
    component("fsevents", "2.3.3"),
    // A workspace package ships too. The lockfile records it as a link, so it
    // is not under node_modules/ like the rest.
    component("@app/web", "1.0.0"),
  ],
  dependencies: [
    {
      ref: "app@1.0.0",
      dependsOn: ["react@19.3.0", "react-dom@19.3.0", "vitest@5.0.1"],
    },
    { ref: "react-dom@19.3.0", dependsOn: ["scheduler@0.28.0"] },
    { ref: "vitest@5.0.1", dependsOn: ["ms@2.0.0"] },
    { ref: "react@19.3.0", dependsOn: [] },
  ],
};
const lockfile = {
  lockfileVersion: 3,
  packages: {
    "": { name: "app", version: "1.0.0" },
    "packages/web": { name: "@app/web", version: "1.0.0" },
    "node_modules/@app/web": { resolved: "packages/web", link: true },
    "node_modules/react": { version: "19.3.0" },
    "node_modules/react-dom": { version: "19.3.0" },
    "node_modules/scheduler": { version: "0.28.0" },
    "node_modules/vitest": { version: "5.0.1", dev: true },
    // One name at two versions: the production copy stays, the dev one goes.
    "node_modules/ms": { version: "2.1.3" },
    "node_modules/vitest/node_modules/ms": { version: "2.0.0", dev: true },
    // devOptional: dev, or an optional peer of something that ships. Kept:
    // an SBOM may overstate what ships, never understate it.
    "node_modules/fsevents": { version: "2.3.3", devOptional: true },
  },
};

check(
  "the production set is every non-dev installed package and every workspace, by name@version",
  [...W.productionRefs(lockfile)].sort(),
  [
    "@app/web@1.0.0",
    "fsevents@2.3.3",
    "ms@2.1.3",
    "react-dom@19.3.0",
    "react@19.3.0",
    "scheduler@0.28.0",
  ],
);

const prod = W.productionOnly(sbom, lockfile);
check(
  "production packages are kept, react included (npm sbom --omit=dev drops it)",
  prod.components.map((c) => c["bom-ref"]),
  [
    "react@19.3.0",
    "react-dom@19.3.0",
    "scheduler@0.28.0",
    "ms@2.1.3",
    "fsevents@2.3.3",
    "@app/web@1.0.0",
  ],
);
check(
  "the dependency graph keeps the root and production nodes, and only production edges",
  prod.dependencies,
  [
    { ref: "app@1.0.0", dependsOn: ["react@19.3.0", "react-dom@19.3.0"] },
    { ref: "react-dom@19.3.0", dependsOn: ["scheduler@0.28.0"] },
    { ref: "react@19.3.0", dependsOn: [] },
  ],
);
check("the input document is not changed", sbom.components.length, 8);
check(
  "a production package npm did not list is reported, never silently absent",
  W.missingFromSbom(
    { ...sbom, components: sbom.components.slice(1) },
    lockfile,
  ),
  ["react@19.3.0"],
);
check(
  "nothing is missing from the full document",
  W.missingFromSbom(sbom, lockfile),
  [],
);

// The file name is the version: one document per released version.
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
check(
  "the output path carries the version",
  W.outputPath(pkg).endsWith(`-${pkg.version}.cdx.json`),
  true,
);

// ── summary ─────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(
    `FAIL: ${failures.length} of ${passed + failures.length} checks\n`,
  );
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`PASS: ${passed} checks`);
