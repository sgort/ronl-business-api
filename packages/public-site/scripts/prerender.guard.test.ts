// @vitest-environment node
// Importing prerender.ts must run nothing (#290). Its own file, because the
// mocks below replace the file system and the API for every import in it.
// Node, not jsdom, for the same reason as prerender.test.ts: Vite's esbuild
// refuses to start under jsdom.
import { describe, it, expect, vi } from 'vitest';

const fsCalls = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn() }));
const apiCalls = vi.hoisted(() => ({
  getBerichten: vi.fn(),
  getNieuws: vi.fn(),
  getProducten: vi.fn(),
  getRegelcatalogus: vi.fn(),
  getProcessen: vi.fn(),
}));

vi.mock('node:fs/promises', () => fsCalls);
vi.mock('../src/lib/api', () => apiCalls);

describe('prerender.ts on import', () => {
  it('starts no prerender: no file read or written, no API call, no exit code', async () => {
    const exitCodeBefore = process.exitCode;
    await import('./prerender');
    // main() is async: give a started run the turns it would need to reach
    // its first read before checking that none happened.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(fsCalls.readFile).not.toHaveBeenCalled();
    expect(fsCalls.writeFile).not.toHaveBeenCalled();
    expect(fsCalls.mkdir).not.toHaveBeenCalled();
    for (const call of Object.values(apiCalls)) expect(call).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(exitCodeBefore);
  });
});
