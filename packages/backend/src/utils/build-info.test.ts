/**
 * Unit tests for build-info.ts.
 *
 * `build-info.json` is written into the deployment artifact by the deploy
 * workflow and is absent from a working tree, so both paths matter: a deployed
 * backend must report which build it is, and a developer's checkout must start
 * without one.
 */
export {};

const mockReadFileSync = jest.fn();
jest.mock('fs', () => ({ readFileSync: (...args: unknown[]) => mockReadFileSync(...args) }));

/** Loads a pristine copy of build-info.ts against the mocked filesystem. */
function load(): { sha: string; run: string; runId: string } | null {
  let mod!: typeof import('./build-info');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./build-info');
  });
  return mod.buildInfo;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildInfo', () => {
  it('reports the build recorded in the artifact', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ sha: 'a1b2c3d', run: '128', runId: '9876543210' })
    );
    expect(load()).toEqual({ sha: 'a1b2c3d', run: '128', runId: '9876543210' });
  });

  it('reads build-info.json from the package root, beside package.json', () => {
    // The deployed layout is deploy/build-info.json with the code under
    // deploy/dist/, and a checkout is packages/backend/build-info.json with the
    // code under src/. Both are two levels up from this module, which is why
    // one path serves both.
    mockReadFileSync.mockReturnValue(JSON.stringify({ sha: 's', run: 'r', runId: 'i' }));
    load();
    expect(String(mockReadFileSync.mock.calls[0][0])).toMatch(/build-info\.json$/);
  });

  it('is null when the file parses but names no commit', () => {
    // A build block without a sha cannot answer the question it exists for, so
    // it is treated as absent rather than reported as a half-answer the deploy
    // workflow would then compare against github.sha and fail on.
    mockReadFileSync.mockReturnValue(JSON.stringify({ run: '128', runId: '9876543210' }));
    expect(load()).toBeNull();
  });

  it('defaults run and runId, so an older artifact still reports its commit', () => {
    // The sha is the load-bearing field — it is what the post-deploy check
    // compares. run and runId are for finding the workflow run afterwards, and
    // an artifact written before they were added should still identify itself.
    mockReadFileSync.mockReturnValue(JSON.stringify({ sha: 'a1b2c3d' }));
    expect(load()).toEqual({ sha: 'a1b2c3d', run: '', runId: '' });
  });

  it('is null in a working tree, where nothing wrote one', () => {
    mockReadFileSync.mockImplementation(() => {
      const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });
    expect(load()).toBeNull();
  });

  it('is null rather than a throw when the file is unreadable', () => {
    // A truncated or half-written artifact must not stop the backend booting:
    // the build block is diagnostic, and refusing to start over it would turn a
    // reporting gap into an outage.
    mockReadFileSync.mockReturnValue('{ not json');
    expect(load()).toBeNull();
  });
});
