/**
 * Which BUILD of the app is running, as opposed to which release.
 *
 * The version in the changelog comes from package.json and is bumped by hand
 * at release time, so it identifies a release, not a build of it. ACC and PROD
 * can serve different builds of the same version string, and redeploying
 * unchanged code produces a new artifact carrying the same version — so
 * "which build am I looking at?" is not answerable from the version alone.
 *
 * The SHA says what was built; the run number distinguishes two builds of
 * identical code. Both are injected at build time by the deploy workflows
 * (see .github/workflows/azure-frontend-{acc,prod}.yml); nothing is derived
 * from git here, because a build id that silently fails to resolve is worse
 * than none — it lies.
 */

export interface BuildInfo {
  /** Full 40-character commit SHA, or '' when not injected. */
  sha: string;
  /** First 7 characters of the SHA, or '' when not injected. */
  shortSha: string;
  /** GitHub Actions run number, or '' when not injected. */
  run: string;
  /** True only when both values are present — see the half-configured note below. */
  isTracked: boolean;
  /** Ready to render. Never blank. */
  label: string;
}

const UNTRACKED: BuildInfo = {
  sha: '',
  shortSha: '',
  run: '',
  isTracked: false,
  label: 'local build',
};

/**
 * Read the injected build identifiers and describe them.
 *
 * The env is read here, on every call, rather than captured at module scope:
 * a module-scope capture is evaluated once at import and cannot be stubbed
 * per test, which would leave the fallback path untestable.
 *
 * Half-configured counts as untracked. A run number with no SHA behind it
 * implies a provenance the bundle does not have, and a SHA with no run number
 * cannot tell two builds of the same commit apart — which is the whole reason
 * the run number is here. Either way the answer is 'local build'.
 */
export function getBuildInfo(): BuildInfo {
  const sha = (import.meta.env.VITE_BUILD_SHA ?? '').trim();
  const run = (import.meta.env.VITE_BUILD_RUN ?? '').trim();

  if (!sha || !run) return UNTRACKED;

  const shortSha = sha.slice(0, 7);
  return { sha, shortSha, run, isTracked: true, label: `build ${shortSha} · #${run}` };
}
