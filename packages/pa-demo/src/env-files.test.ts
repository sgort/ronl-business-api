import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Parses the shipped .env.* files directly, the same way staticwebapp-csp.test.ts
// parses the shipped SWA config — because nothing else in this package reads
// them. mock-lock.test.ts asserts the build-time mock default, but Vitest's
// mode is always 'test', so that only ever proves .env.test. Nothing reads
// .env.production or .env.acceptance anywhere else: the CSP test parses the
// SWA config, the bundle gate scans dist/, and the E2E suite runs against the
// dev server. Deleting VITE_PA_DOSSIERS_MOCK from .env.production would leave
// every other check green — this is the guard for exactly that gap.
const pkgDir = dirname(fileURLToPath(import.meta.url));

const ENV_FILES = ['.env.development', '.env.test', '.env.production', '.env.acceptance'];

function parseEnvFile(name: string): Record<string, string> {
  const contents = readFileSync(join(pkgDir, '..', name), 'utf-8');
  const out: Record<string, string> = {};
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

describe('pa-demo env files', () => {
  // The plan's stated global constraints: every mode stays mock-only, and no
  // mode ever gets a real API to call. One test per file so a failure names
  // the offending file directly rather than a shared assertion across all four.
  for (const file of ENV_FILES) {
    it(`${file} forces every mock flag true and carries no VITE_API_URL`, () => {
      const env = parseEnvFile(file);
      expect(env.VITE_PA_DOSSIERS_MOCK).toBe('true');
      expect(env.VITE_PA_SIGNALS_MOCK).toBe('true');
      expect(env.VITE_PA_AGENDA_MOCK).toBe('true');
      expect(env.VITE_API_URL).toBeUndefined();
    });
  }
});
