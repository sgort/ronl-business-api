// Writes this repository's release SBOM to docs/sbom/, in CycloneDX.
//
// ICTU recommendation 10 asks for SBOMs of released versions, kept analysable:
// a new advisory lands against code that shipped months ago, and answering
// "was that version affected?" needs the bill of materials as it was THEN.
// Workflow artifacts expire after 90 days on a public repository, so the
// committed copy is the durable one; .github/workflows/sbom.yml uploads the
// same document as an artifact for a promotion.
//
// Production dependencies only: the question an SBOM answers here is what the
// released artifact contains, and devDependencies are not in it. The full tree
// is three times the size and is what `npm audit` already walks daily, on both
// branches.
//
// The production set is read from the lockfile, NOT from `npm sbom
// --omit=dev`. npm's dev filter drops production packages: on 10 October 2026
// it left react, react-dom and scheduler out of every repository's SBOM, and
// about 75 more out of linked-data-explorer's and ronl-business-api's, while
// the lockfile and `npm ls --omit=dev` both count them as production. So npm
// lists the whole tree and this script keeps the packages the lockfile does
// not mark dev. devOptional counts as production: an SBOM may overstate what
// ships, never understate it.
//
// --package-lock-only, so this needs no install and describes the lockfile
// rather than whatever happens to be in node_modules.
//
// The same file in linked-data-explorer, ttl-editor and ronl-business-api.
//
// Usage:
//   node scripts/write-sbom.mjs            write docs/sbom/<name>-<version>.cdx.json
//   node scripts/write-sbom.mjs --check    exit 1 if that file is missing or stale
//   node scripts/write-sbom.mjs --verify-release
//                                          exit 1 if missing; warn if stale
//   node scripts/write-sbom.mjs --print-path
//                                          print that file's path and exit
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function outputPath(pkg) {
  const shortName = pkg.name.replace(/^@[^/]+\//, "").replace(/-monorepo$/, "");
  return join("docs", "sbom", `${shortName}-${pkg.version}.cdx.json`);
}

/**
 * name@version of every installed package the lockfile does not mark dev, and
 * of every workspace package. A workspace ships, but the lockfile records it
 * as a link, so it is read from its own manifest entry ("packages/<ws>").
 */
export function productionRefs(lockfile) {
  const refs = new Set();
  for (const [key, entry] of Object.entries(lockfile.packages ?? {})) {
    if (key === "" || entry.link || entry.dev) continue;
    if (key.includes("node_modules/")) {
      refs.add(`${key.split("node_modules/").pop()}@${entry.version}`);
    } else if (entry.name) {
      refs.add(`${entry.name}@${entry.version}`);
    }
  }
  return refs;
}

/** The SBOM cut down to the production set, components and graph alike. */
export function productionOnly(sbom, lockfile) {
  const keep = productionRefs(lockfile);
  const root = sbom.metadata?.component?.["bom-ref"];
  const kept = (ref) => ref === root || keep.has(ref);
  return {
    ...sbom,
    components: sbom.components.filter((c) => keep.has(c["bom-ref"])),
    dependencies: (sbom.dependencies ?? [])
      .filter((d) => kept(d.ref))
      .map((d) => ({ ...d, dependsOn: (d.dependsOn ?? []).filter(kept) })),
  };
}

/** Production packages npm did not list at all: an SBOM must not lose one silently. */
export function missingFromSbom(sbom, lockfile) {
  const listed = new Set(sbom.components.map((c) => c["bom-ref"]));
  return [...productionRefs(lockfile)].filter((ref) => !listed.has(ref)).sort();
}

// serialNumber is a fresh UUID on every run, and metadata.timestamp is the
// moment of generation. Both change when nothing else does, so --check
// compares the document WITHOUT them; the file keeps them, because a CycloneDX
// document is expected to carry them.
const strip = (text) => {
  const doc = JSON.parse(text);
  delete doc.serialNumber;
  if (doc.metadata) delete doc.metadata.timestamp;
  return JSON.stringify(doc);
};

function generate() {
  const full = JSON.parse(
    execFileSync(
      "npm",
      ["sbom", "--package-lock-only", "--sbom-format", "cyclonedx"],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        shell: process.platform === "win32",
      },
    ),
  );
  const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const missing = missingFromSbom(full, lockfile);
  if (missing.length) {
    throw new Error(
      `npm sbom did not list ${missing.length} production package(s): ${missing.slice(0, 10).join(", ")}`,
    );
  }
  return `${JSON.stringify(productionOnly(full, lockfile), null, 2)}\n`;
}

function main(argv) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const out = outputPath(pkg);

  // --print-path, so the workflow can ask which file belongs to this version
  // without restating the naming rule above.
  if (argv.includes("--print-path")) {
    console.log(out.split("\\").join("/"));
    return 0;
  }

  const generated = generate();

  // --check is strict, and belongs where the release is cut: the document
  // must describe the lockfile it was generated from.
  //
  // --verify-release is what a promotion can honestly assert. A promotion
  // carries every commit merged into acc since the release, so its lockfile
  // may have moved and the committed SBOM still be the right document for the
  // version being released. A missing SBOM is a failure; drift is a warning
  // that says which.
  const strictCheck = argv.includes("--check");
  const verifyRelease = argv.includes("--verify-release");
  if (strictCheck || verifyRelease) {
    if (!existsSync(out)) {
      console.error(`::error::${out} is missing. Run: npm run sbom`);
      return 1;
    }
    const drifted = strip(readFileSync(out, "utf8")) !== strip(generated);
    if (drifted && strictCheck) {
      console.error(
        `::error::${out} does not match the current lockfile. Run: npm run sbom`,
      );
      return 1;
    }
    if (drifted) {
      console.log(
        `::warning::${out} exists but no longer matches this tree's lockfile. Expected on a promotion, which carries commits made after the release; investigate if this is the release commit itself.`,
      );
      return 0;
    }
    console.log(`${out} matches the lockfile`);
    return 0;
  }

  mkdirSync(join("docs", "sbom"), { recursive: true });
  writeFileSync(out, generated);
  const { components } = JSON.parse(generated);
  console.log(
    `${out}: ${components.length} components (production dependencies of ${pkg.name}@${pkg.version})`,
  );
  return 0;
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`::error::write-sbom: ${err.message}`);
    process.exitCode = 1;
  }
}
