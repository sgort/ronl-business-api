import { readFileSync } from 'fs';
import path from 'path';

/**
 * Which BUILD is running, as distinct from which RELEASE.
 *
 * `/v1/health`'s `version` comes from package.json and moves only when a
 * release is cut, so every deploy between two releases reports the same string.
 * Nothing in the response said which commit was serving, which made three
 * ordinary questions unanswerable from the API: has my change reached acc, are
 * acc and production on the same code, and did that deploy take effect (#129).
 *
 * The values are written into the deployment artifact by the deploy workflow,
 * as a FILE rather than an App Service setting: settings persist across deploys
 * and can end up describing a build that is no longer running, which is the
 * failure this is meant to detect. The workflow then reads `build.sha` back
 * from the deployed app and fails unless it matches the commit it shipped.
 *
 * Absent in a working tree, where nothing wrote one — hence `null` rather than
 * a throw. Absent or corrupt, it stays `null`: this block is diagnostic, and
 * refusing to boot over it would turn a reporting gap into an outage.
 */
export interface BuildInfo {
  sha: string;
  run: string;
  runId: string;
}

function readBuildInfo(): BuildInfo | null {
  try {
    // Two levels up is the package root in both layouts: the deployed artifact
    // is deploy/build-info.json with this module at deploy/dist/utils/, and a
    // checkout is packages/backend/build-info.json with it at src/utils/.
    const raw = readFileSync(path.resolve(__dirname, '../../build-info.json'), 'utf8');
    const parsed = JSON.parse(raw) as Partial<BuildInfo>;
    if (!parsed.sha) return null;
    return {
      sha: String(parsed.sha),
      run: String(parsed.run ?? ''),
      runId: String(parsed.runId ?? ''),
    };
  } catch {
    return null;
  }
}

export const buildInfo: BuildInfo | null = readBuildInfo();
