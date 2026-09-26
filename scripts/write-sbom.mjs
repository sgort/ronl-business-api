// Writes this repository's release SBOM to docs/sbom/, in CycloneDX.
//
// ICTU recommendation 10 asks for SBOMs of released versions, kept analysable:
// a new advisory lands against code that shipped months ago, and answering
// "was that version affected?" needs the bill of materials as it was THEN.
// Workflow artifacts expire after 90 days on a public repository, so the
// committed copy is the durable one; .github/workflows/sbom.yml uploads the
// same document as an artifact for a promotion.
//
// Production dependencies only (--omit=dev): the question an SBOM answers here
// is what the released artifact contains, and devDependencies are not in it.
// The full tree is three times the size and is what `npm audit` already walks
// daily, on both branches.
//
// --package-lock-only, so this needs no install and describes the lockfile
// rather than whatever happens to be in node_modules.
//
// Usage:
//   node scripts/write-sbom.mjs            write docs/sbom/<name>-<version>.cdx.json
//   node scripts/write-sbom.mjs --check    exit 1 if that file is missing or stale
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const shortName = pkg.name.replace(/^@[^/]+\//, '').replace(/-monorepo$/, '');
const out = join('docs', 'sbom', `${shortName}-${pkg.version}.cdx.json`);

const generated = execFileSync(
  'npm',
  ['sbom', '--package-lock-only', '--sbom-format', 'cyclonedx', '--omit=dev'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' }
);

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

// --check is strict, and belongs where the release is cut: the document must
// describe the lockfile it was generated from.
//
// --verify-release is what a promotion can honestly assert. A promotion carries
// every commit merged into acc since the release, so its lockfile may have moved
// and the committed SBOM still be the right document for the version being
// released. A missing SBOM is a failure; drift is a warning that says which.
const strictCheck = process.argv.includes('--check');
const verifyRelease = process.argv.includes('--verify-release');
if (strictCheck || verifyRelease) {
  if (!existsSync(out)) {
    console.error(`::error::${out} is missing. Run: npm run sbom`);
    process.exit(1);
  }
  const drifted = strip(readFileSync(out, 'utf8')) !== strip(generated);
  if (drifted && strictCheck) {
    console.error(`::error::${out} does not match the current lockfile. Run: npm run sbom`);
    process.exit(1);
  }
  if (drifted) {
    console.log(
      `::warning::${out} exists but no longer matches this tree's lockfile. Expected on a promotion, which carries commits made after the release; investigate if this is the release commit itself.`
    );
    process.exit(0);
  }
  console.log(`${out} matches the lockfile`);
  process.exit(0);
}

mkdirSync(join('docs', 'sbom'), { recursive: true });
writeFileSync(out, generated);
const { components } = JSON.parse(generated);
console.log(`${out}: ${components.length} components (production dependencies of ${pkg.name}@${pkg.version})`);
