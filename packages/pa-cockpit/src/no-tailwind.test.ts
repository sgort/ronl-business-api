import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

// Deliberately narrow: matches a hyphenated Tailwind scale token, not the bare
// words `flex` or `grid`, which appear inside this project's own pac-* class
// strings. A looser pattern reported six files here when the real answer was
// two.
const TAILWIND =
  /\b(?:bg|text|border|rounded|shadow|ring|w|h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|grid-cols|col-span|items|justify|z|opacity|font|leading|tracking|overflow|inset|space-[xy]|divide)-[a-z0-9[\]./-]+/;

describe('@ronl/pa-cockpit styling', () => {
  it('uses no Tailwind utility classes, so no host needs a content glob for it', () => {
    const offenders = walk(SRC).filter((file) =>
      [...readFileSync(file, 'utf-8').matchAll(/className=["'`]([^"'`]+)["'`]/g)].some((m) =>
        TAILWIND.test(m[1])
      )
    );
    expect(offenders).toEqual([]);
  });
});
