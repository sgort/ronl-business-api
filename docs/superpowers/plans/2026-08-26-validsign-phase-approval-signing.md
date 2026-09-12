# ValidSign Phase-Approval Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real ValidSign digital signature to R2.1's phase-exit approval task, on a BPMN-tag mechanism any future RIP phase can adopt.

**Architecture:** A single additive BPMN attribute (`ronl:signatureRef="rip-pdp"`) on `Task_AccorderenProjectplan4` activates signing. The backend renders the deployed LDE document template to an intermediate representation, emits Markdown (archived in eDOCS) and PDF (signed), creates a ValidSign package, and serves the ceremony in an iframe. Task completion happens server-side from ValidSign's callback, with a poller as the safety net. The deployed process flow is untouched.

**Tech Stack:** TypeScript, Express, jest (backend), React + vitest (frontend), pdfkit, axios, Operaton REST, ValidSign (OneSpan Sign) REST.

**Spec:** `docs/superpowers/specs/2026-08-25-validsign-phase-approval-signing-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Branch:** `feature/validsign-signing`. Do not switch branches; another session works in this tree.
- **Ask before every `git commit`.** The repo rule overrides this plan's Commit steps: stage the work, report what is staged, then stop and ask. Approval for one commit never carries to the next.
- **Never append `Co-Authored-By:` or `Claude-Session:` trailers** to commit messages.
- **Hand test runs to the user per batch.** Report the exact command and expected result, and wait for their green before committing. Do not substitute a focused run for their full-suite check.
- **Never start, stop or restart a dev server** (`npm run dev`, `node`, `Stop-Process`, `taskkill`). If blocked by stale code, report and stop.
- **Do not self-drive a browser** to verify UI. Run typecheck, lint and unit tests, then ask the user to look.
- **`packages/frontend/e2e/**` is owned by another session.\*\* Task 12 coordinates rather than edits unilaterally.
- **Backend tests: jest** (`npm test --workspace=@ronl/backend`). **Frontend tests: vitest** (`npm test --workspace=@ronl/frontend`). Backend test files are `*.test.ts` beside the source; frontend `*.test.tsx` beside the component.
- **Path aliases:** `@services/*`, `@utils/*`, `@routes/*`, `@auth/*`, `@middleware/*` → `packages/backend/src/*`.
- **`VALIDSIGN_STUB_MODE` defaults to `true`.** No test may ever reach the ValidSign network. The API key is a **production, account-wide** credential: a live call acts against the whole Provincie Flevoland account.
- **Nothing new may be required unconditionally in `validateConfig()`** — it runs on import with no test skip, so a mandatory setting breaks every backend test.
- **Prettier runs on commit** via lint-staged for `*.{json,md}` and the `ts`/`tsx` globs. Do not run `prettier --write` on CSS.

---

### Task 1: Configuration and environment

**Files:**

- Modify: `packages/backend/src/utils/config.ts` (add `validsign` block ~line 300; extend `validateConfig()` ~line 382)
- Modify: `packages/backend/.env.example:81-93` (the existing ValidSign block)
- Test: `packages/backend/src/utils/config.validsign.test.ts`

**Interfaces:**

- Consumes: `parseEnvBool`, `parseEnvInt`, `parseEnvArray` from `@utils/env`; `resolveDeploymentEnv()` result as `config.deploymentEnv`.
- Produces: `config.validsign: { baseUrl: string; apiKey: string; stubMode: boolean; callbackSecret: string; liveTiers: string[]; pollIntervalMs: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/utils/config.validsign.test.ts
describe('config.validsign', () => {
  const OLD = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD };
  });
  afterEach(() => {
    process.env = OLD;
  });

  it('defaults to stub mode with no live tiers', async () => {
    delete process.env.VALIDSIGN_STUB_MODE;
    delete process.env.VALIDSIGN_LIVE_TIERS;
    const { config } = await import('./config');
    expect(config.validsign.stubMode).toBe(true);
    expect(config.validsign.liveTiers).toEqual([]);
    expect(config.validsign.baseUrl).toBe('https://my.validsign.eu/api');
    expect(config.validsign.pollIntervalMs).toBe(15000);
  });

  it('parses an explicit live-tier allowlist', async () => {
    process.env.VALIDSIGN_LIVE_TIERS = 'development, production';
    const { config } = await import('./config');
    expect(config.validsign.liveTiers).toEqual(['development', 'production']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- config.validsign`
Expected: FAIL — `Cannot read properties of undefined (reading 'stubMode')`.

- [ ] **Step 3: Add the config block**

In `packages/backend/src/utils/config.ts`, beside the `edocs` block:

```ts
  validsign: {
    baseUrl: process.env.VALIDSIGN_BASE_URL || 'https://my.validsign.eu/api',
    apiKey: process.env.VALIDSIGN_API_KEY ?? '',
    stubMode: parseEnvBool(process.env.VALIDSIGN_STUB_MODE, true),
    callbackSecret: process.env.VALIDSIGN_CALLBACK_SECRET ?? '',
    // Empty by default: no tier may create real packages until one is named.
    liveTiers: parseEnvArray(process.env.VALIDSIGN_LIVE_TIERS, []),
    pollIntervalMs: parseEnvInt(process.env.VALIDSIGN_POLL_INTERVAL_MS, 15000),
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=@ronl/backend -- config.validsign`
Expected: PASS, 2 tests.

- [ ] **Step 5: Add the conditional validation**

Inside `validateConfig()`, after the existing checks and before `if (errors.length)`:

```ts
// Only when live signing is switched on. Unconditional requirements here
// would break every test: validateConfig() runs on import with no test skip.
if (!config.validsign.stubMode) {
  if (!config.validsign.apiKey) {
    errors.push('VALIDSIGN_API_KEY is required when VALIDSIGN_STUB_MODE=false');
  }
  if (!config.validsign.callbackSecret) {
    errors.push('VALIDSIGN_CALLBACK_SECRET is required when VALIDSIGN_STUB_MODE=false');
  }
  if (!config.validsign.liveTiers.includes(config.deploymentEnv)) {
    errors.push(
      `DEPLOYMENT_ENV="${config.deploymentEnv}" is not in VALIDSIGN_LIVE_TIERS — ` +
        'refusing to start with live signing enabled on an unlisted tier'
    );
  }
}
```

- [ ] **Step 6: Write the failing test for validation**

Append to `config.validsign.test.ts`:

```ts
it('refuses to start live on a tier outside the allowlist', async () => {
  process.env.VALIDSIGN_STUB_MODE = 'false';
  process.env.VALIDSIGN_API_KEY = 'k';
  process.env.VALIDSIGN_CALLBACK_SECRET = 's';
  process.env.VALIDSIGN_LIVE_TIERS = 'production';
  process.env.DEPLOYMENT_ENV = 'acceptance';
  await expect(import('./config')).rejects.toThrow(/not in VALIDSIGN_LIVE_TIERS/);
});

it('starts live when the tier is allowlisted', async () => {
  process.env.VALIDSIGN_STUB_MODE = 'false';
  process.env.VALIDSIGN_API_KEY = 'k';
  process.env.VALIDSIGN_CALLBACK_SECRET = 's';
  process.env.VALIDSIGN_LIVE_TIERS = 'acceptance';
  process.env.DEPLOYMENT_ENV = 'acceptance';
  const { config } = await import('./config');
  expect(config.validsign.stubMode).toBe(false);
});
```

- [ ] **Step 7: Run tests to verify all pass**

Run: `npm test --workspace=@ronl/backend -- config.validsign`
Expected: PASS, 4 tests.

- [ ] **Step 8: Complete the `.env.example` block**

Replace the trailing note at `packages/backend/.env.example:92-93` ("NB: the stub-mode and callback-secret settings … land with the implementation") with:

```
# Stub mode (default) returns fake packages and never calls ValidSign.
VALIDSIGN_STUB_MODE=true
# Tiers permitted to create REAL packages, comma-separated, matched against
# DEPLOYMENT_ENV. Empty means no tier may. NOT NODE_ENV: ACC deliberately runs
# NODE_ENV=production, so it cannot distinguish ACC from production.
VALIDSIGN_LIVE_TIERS=
# Shared secret ValidSign must send on POST /v1/validsign/callback, which sits
# outside jwtMiddleware. Required when VALIDSIGN_STUB_MODE=false.
VALIDSIGN_CALLBACK_SECRET=
# How often the safety-net poller re-checks packages awaiting signature.
VALIDSIGN_POLL_INTERVAL_MS=15000
```

- [ ] **Step 9: Stage, report, and ask before committing**

```bash
git add packages/backend/src/utils/config.ts \
        packages/backend/src/utils/config.validsign.test.ts \
        packages/backend/.env.example
```

Then report what is staged and **ask** before `git commit`. Suggested message subject: `feat(config): add ValidSign settings with a live-tier allowlist`.

---

### Task 2: Document template types and `renderTemplate()`

**Files:**

- Create: `packages/backend/src/services/document/documentTemplate.types.ts`
- Create: `packages/backend/src/services/document/renderTemplate.ts`
- Test: `packages/backend/src/services/document/renderTemplate.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `DocumentTemplate`, `DocumentBlock`, `TipTapDoc`, `TipTapNode`, `VariableBinding`, `ZoneId`
  - `renderTemplate(template: DocumentTemplate, variables: Record<string, unknown>): RenderedDocument`
  - `interface RenderedDocument { zones: RenderedZone[] }`
  - `interface RenderedZone { id: ZoneId; blocks: RenderedBlock[] }`
  - `interface RenderedBlock { kind: 'heading' | 'paragraph' | 'separator' | 'spacer'; level?: number; runs: TextRun[] }`
  - `interface TextRun { text: string; bold: boolean }`

**Context the implementer needs:** the deployed templates use only TipTap node types `doc`, `heading` (with `attrs.level`), `paragraph`, `text`, and the `bold` mark. Zone keys in the deployed fixtures were `signOff` / `contactInformation` after `linked-data-explorer` commit `39a49bb`, but older copies use `signoff` / `contactInfo`. The renderer must accept both — silently dropping `signOff` would drop the signature block.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/services/document/renderTemplate.test.ts
import { renderTemplate } from './renderTemplate';
import type { DocumentTemplate } from './documentTemplate.types';

const doc = (text: string, bold = false) => ({
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text, ...(bold ? { marks: [{ type: 'bold' }] } : {}) }],
    },
  ],
});

const template = (zones: Record<string, unknown>): DocumentTemplate =>
  ({
    id: 'rip-pdp',
    name: 'test',
    schemaVersion: 1,
    assets: [],
    createdAt: '',
    updatedAt: '',
    bindings: [
      {
        id: 'b1',
        placeholder: '{{projectNumber}}',
        variableKey: 'projectNumber',
        source: 'process',
      },
      { id: 'b2', placeholder: '{{pdpNotes}}', variableKey: 'pdpNotes', source: 'process' },
    ],
    zones,
  }) as unknown as DocumentTemplate;

describe('renderTemplate', () => {
  it('resolves bound placeholders from process variables', () => {
    const out = renderTemplate(
      template({
        body: { blocks: [{ id: 'b', type: 'text', content: doc('Nr {{projectNumber}}') }] },
      }),
      { projectNumber: '24102' }
    );
    const body = out.zones.find((z) => z.id === 'body')!;
    expect(body.blocks[0].runs.map((r) => r.text).join('')).toBe('Nr 24102');
  });

  it('renders an unresolved placeholder as an em dash', () => {
    const out = renderTemplate(
      template({
        body: { blocks: [{ id: 'b', type: 'text', content: doc('Notes {{pdpNotes}}') }] },
      }),
      {}
    );
    const body = out.zones.find((z) => z.id === 'body')!;
    expect(body.blocks[0].runs.map((r) => r.text).join('')).toBe('Notes —');
  });

  it('accepts the legacy lowercase signoff zone key', () => {
    const out = renderTemplate(
      template({
        signoff: { blocks: [{ id: 's', type: 'text', content: doc('Project manager:', true) }] },
      }),
      {}
    );
    const signoff = out.zones.find((z) => z.id === 'signOff');
    expect(signoff).toBeDefined();
    expect(signoff!.blocks[0].runs[0]).toEqual({ text: 'Project manager:', bold: true });
  });

  it('orders zones canonically regardless of key order in the file', () => {
    const out = renderTemplate(
      template({
        signOff: { blocks: [{ id: 's', type: 'text', content: doc('sig') }] },
        letterhead: { blocks: [{ id: 'l', type: 'text', content: doc('head') }] },
      }),
      {}
    );
    expect(out.zones.map((z) => z.id)).toEqual(['letterhead', 'signOff']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- renderTemplate`
Expected: FAIL — `Cannot find module './renderTemplate'`.

- [ ] **Step 3: Write the types**

```ts
// packages/backend/src/services/document/documentTemplate.types.ts
/**
 * Mirrors linked-data-explorer's packages/frontend/src/types/document.types.ts.
 * Duplicated deliberately: the two repos ship separately and share no package.
 */
export type BlockType = 'text' | 'image' | 'variable' | 'separator' | 'spacer';
export type BindingSource = 'process' | 'dmn_output';

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: Array<{ type: string }>;
  text?: string;
}
export interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}
export interface DocumentBlock {
  id: string;
  type: BlockType;
  content?: TipTapDoc;
  label?: string;
}
export interface DocumentZone {
  blocks: DocumentBlock[];
}
export interface VariableBinding {
  id: string;
  placeholder: string;
  variableKey: string;
  source: BindingSource;
  label?: string;
}
export interface DocumentTemplate {
  id: string;
  name: string;
  schemaVersion: number;
  zones: Record<string, DocumentZone | null | undefined>;
  bindings: VariableBinding[];
  assets: string[];
  createdAt: string;
  updatedAt: string;
  processKey?: string;
}

export type ZoneId =
  | 'letterhead'
  | 'contactInformation'
  | 'reference'
  | 'body'
  | 'closing'
  | 'signOff'
  | 'annex';

/** Canonical render order (annex last). */
export const ZONE_ORDER: ZoneId[] = [
  'letterhead',
  'contactInformation',
  'reference',
  'body',
  'closing',
  'signOff',
  'annex',
];

/**
 * Deployed fixtures predating linked-data-explorer 39a49bb use lowercase keys.
 * Accept both: dropping signOff would drop the signature block, which is the
 * zone the ValidSign field anchors into.
 */
export const ZONE_ALIASES: Record<string, ZoneId> = {
  signoff: 'signOff',
  contactinfo: 'contactInformation',
};
```

- [ ] **Step 4: Write the renderer**

```ts
// packages/backend/src/services/document/renderTemplate.ts
import { createLogger } from '@utils/logger';
import {
  DocumentBlock,
  DocumentTemplate,
  TipTapNode,
  ZoneId,
  ZONE_ALIASES,
  ZONE_ORDER,
} from './documentTemplate.types';

const logger = createLogger('render-template');

export interface TextRun {
  text: string;
  bold: boolean;
}
export interface RenderedBlock {
  kind: 'heading' | 'paragraph' | 'separator' | 'spacer';
  level?: number;
  runs: TextRun[];
}
export interface RenderedZone {
  id: ZoneId;
  blocks: RenderedBlock[];
}
export interface RenderedDocument {
  templateId: string;
  zones: RenderedZone[];
}

function canonicalZoneId(key: string): ZoneId | null {
  if ((ZONE_ORDER as string[]).includes(key)) return key as ZoneId;
  return ZONE_ALIASES[key.toLowerCase()] ?? null;
}

function resolvePlaceholders(
  text: string,
  template: DocumentTemplate,
  vars: Record<string, unknown>
): string {
  let out = text;
  for (const binding of template.bindings) {
    if (!out.includes(binding.placeholder)) continue;
    const raw = vars[binding.variableKey];
    // '—' matches the existing v() helper in externalTaskWorker.service.ts, so
    // rendered output stays consistent with what is already archived.
    const value = raw === undefined || raw === null || raw === '' ? '—' : String(raw);
    out = out.split(binding.placeholder).join(value);
  }
  return out;
}

function runsOf(
  node: TipTapNode,
  template: DocumentTemplate,
  vars: Record<string, unknown>
): TextRun[] {
  const runs: TextRun[] = [];
  const walk = (n: TipTapNode, bold: boolean): void => {
    const isBold = bold || (n.marks ?? []).some((m) => m.type === 'bold');
    if (n.type === 'text' && typeof n.text === 'string') {
      runs.push({ text: resolvePlaceholders(n.text, template, vars), bold: isBold });
    }
    for (const child of n.content ?? []) walk(child, isBold);
  };
  walk(node, false);
  return runs;
}

function renderBlock(
  block: DocumentBlock,
  template: DocumentTemplate,
  vars: Record<string, unknown>
): RenderedBlock[] {
  if (block.type === 'separator') return [{ kind: 'separator', runs: [] }];
  if (block.type === 'spacer') return [{ kind: 'spacer', runs: [] }];
  if (block.type !== 'text') {
    // No RIP template uses image or variable blocks. Log rather than crash so a
    // future template cannot take the whole render down.
    logger.warn('Unsupported block type skipped', { blockId: block.id, type: block.type });
    return [];
  }
  const out: RenderedBlock[] = [];
  for (const node of block.content?.content ?? []) {
    if (node.type === 'heading') {
      out.push({
        kind: 'heading',
        level: Number(node.attrs?.level ?? 1),
        runs: runsOf(node, template, vars),
      });
    } else if (node.type === 'paragraph') {
      out.push({ kind: 'paragraph', runs: runsOf(node, template, vars) });
    }
  }
  return out;
}

export function renderTemplate(
  template: DocumentTemplate,
  variables: Record<string, unknown>
): RenderedDocument {
  const byZone = new Map<ZoneId, RenderedBlock[]>();
  for (const [key, zone] of Object.entries(template.zones ?? {})) {
    const id = canonicalZoneId(key);
    if (!id) {
      logger.warn('Unknown zone key skipped', { templateId: template.id, key });
      continue;
    }
    const blocks = (zone?.blocks ?? []).flatMap((b) => renderBlock(b, template, variables));
    if (blocks.length) byZone.set(id, [...(byZone.get(id) ?? []), ...blocks]);
  }
  return {
    templateId: template.id,
    zones: ZONE_ORDER.filter((id) => byZone.has(id)).map((id) => ({ id, blocks: byZone.get(id)! })),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- renderTemplate`
Expected: PASS, 4 tests.

- [ ] **Step 6: Stage, report, and ask before committing**

```bash
git add packages/backend/src/services/document/
```

Suggested subject: `feat(document): render LDE document templates to an intermediate representation`.

---

### Task 3: The Markdown emitter

**Files:**

- Create: `packages/backend/src/services/document/toMarkdown.ts`
- Test: `packages/backend/src/services/document/toMarkdown.test.ts`

**Interfaces:**

- Consumes: `RenderedDocument`, `RenderedBlock`, `TextRun` from Task 2.
- Produces: `toMarkdown(doc: RenderedDocument): string`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/services/document/toMarkdown.test.ts
import { toMarkdown } from './toMarkdown';
import type { RenderedDocument } from './renderTemplate';

const rendered: RenderedDocument = {
  templateId: 'rip-pdp',
  zones: [
    {
      id: 'letterhead',
      blocks: [{ kind: 'heading', level: 1, runs: [{ text: 'Provincie Flevoland', bold: false }] }],
    },
    {
      id: 'signOff',
      blocks: [
        {
          kind: 'paragraph',
          runs: [
            { text: 'Project manager: ', bold: true },
            { text: '___', bold: false },
          ],
        },
      ],
    },
  ],
};

describe('toMarkdown', () => {
  it('emits headings at their level', () => {
    expect(toMarkdown(rendered)).toContain('# Provincie Flevoland');
  });

  it('emits bold runs with asterisks and leaves plain runs alone', () => {
    expect(toMarkdown(rendered)).toContain('**Project manager:** ___');
  });

  it('separates blocks with a blank line and ends with a newline', () => {
    const md = toMarkdown(rendered);
    expect(md).toMatch(/\n\n/);
    expect(md.endsWith('\n')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- toMarkdown`
Expected: FAIL — `Cannot find module './toMarkdown'`.

- [ ] **Step 3: Write the emitter**

```ts
// packages/backend/src/services/document/toMarkdown.ts
import type { RenderedBlock, RenderedDocument, TextRun } from './renderTemplate';

/**
 * Trailing spaces inside a bold run would produce "** " and break emphasis in
 * every CommonMark renderer, so the marker moves inside and the space back out.
 */
function runToMarkdown(run: TextRun): string {
  const escaped = run.text.replace(/([*_`])/g, '\\$1');
  if (!run.bold) return escaped;
  const match = /^(\s*)(.*?)(\s*)$/.exec(escaped);
  const [, lead = '', core = '', tail = ''] = match ?? [];
  return core ? `${lead}**${core}**${tail}` : escaped;
}

function blockToMarkdown(block: RenderedBlock): string {
  if (block.kind === 'separator') return '---';
  if (block.kind === 'spacer') return '';
  const text = block.runs.map(runToMarkdown).join('');
  if (block.kind === 'heading') return `${'#'.repeat(Math.min(block.level ?? 1, 6))} ${text}`;
  return text;
}

export function toMarkdown(doc: RenderedDocument): string {
  const parts = doc.zones
    .flatMap((zone) => zone.blocks.map(blockToMarkdown))
    .filter((s) => s !== '');
  return `${parts.join('\n\n')}\n`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- toMarkdown`
Expected: PASS, 3 tests.

- [ ] **Step 5: Stage, report, and ask before committing**

```bash
git add packages/backend/src/services/document/toMarkdown.ts \
        packages/backend/src/services/document/toMarkdown.test.ts
```

Suggested subject: `feat(document): emit Markdown from the rendered document IR`.

---

### Task 4: The PDF emitter

**Files:**

- Modify: `packages/backend/package.json` (add `pdfkit` and `@types/pdfkit`)
- Create: `packages/backend/src/services/document/toPdf.ts`
- Test: `packages/backend/src/services/document/toPdf.test.ts`

**Interfaces:**

- Consumes: `RenderedDocument` from Task 2.
- Produces:
  - `interface SignatureField { name: string; page: number; x: number; y: number; width: number; height: number }`
  - `interface RenderedPdf { bytes: Buffer; signatureFields: SignatureField[] }`
  - `toPdf(doc: RenderedDocument): Promise<RenderedPdf>`

**Why coordinates, not text anchors:** we author this PDF, so the emitter knows exactly where it drew the signature line. Anchor extraction exists for documents you did not author and adds an "anchor string not found" failure mode for no benefit here.

- [ ] **Step 1: Install pdfkit**

```bash
npm install --workspace=@ronl/backend pdfkit
npm install --workspace=@ronl/backend --save-dev @types/pdfkit
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/backend/src/services/document/toPdf.test.ts
import { toPdf } from './toPdf';
import type { RenderedDocument } from './renderTemplate';

const rendered: RenderedDocument = {
  templateId: 'rip-pdp',
  zones: [
    {
      id: 'letterhead',
      blocks: [{ kind: 'heading', level: 1, runs: [{ text: 'Provincie Flevoland', bold: false }] }],
    },
    {
      id: 'body',
      blocks: [{ kind: 'paragraph', runs: [{ text: 'Scope: verbreding N305', bold: false }] }],
    },
    {
      id: 'signOff',
      blocks: [
        {
          kind: 'paragraph',
          runs: [
            { text: 'Project manager: ', bold: true },
            { text: '_______', bold: false },
          ],
        },
        {
          kind: 'paragraph',
          runs: [
            { text: 'Contributor: ', bold: true },
            { text: '_______', bold: false },
          ],
        },
      ],
    },
  ],
};

describe('toPdf', () => {
  it('produces a real PDF', async () => {
    const { bytes } = await toPdf(rendered);
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('returns exactly one signature field, on the first signOff line', async () => {
    const { signatureFields } = await toPdf(rendered);
    expect(signatureFields).toHaveLength(1);
    expect(signatureFields[0].name).toBe('Signature1');
    expect(signatureFields[0].page).toBe(1);
    expect(signatureFields[0].width).toBeGreaterThan(0);
    expect(signatureFields[0].height).toBeGreaterThan(0);
  });

  it('places the signature field below the body text', async () => {
    const { signatureFields } = await toPdf(rendered);
    // Origin is top-left, y grows downward, so the signoff line sits lower.
    expect(signatureFields[0].y).toBeGreaterThan(100);
  });

  it('returns no signature field when the document has no signOff zone', async () => {
    const { signatureFields } = await toPdf({ templateId: 't', zones: [rendered.zones[1]] });
    expect(signatureFields).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- toPdf`
Expected: FAIL — `Cannot find module './toPdf'`.

- [ ] **Step 4: Write the emitter**

```ts
// packages/backend/src/services/document/toPdf.ts
import PDFDocument from 'pdfkit';
import type { RenderedBlock, RenderedDocument } from './renderTemplate';

export interface SignatureField {
  name: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface RenderedPdf {
  bytes: Buffer;
  signatureFields: SignatureField[];
}

const MARGIN = 56; // ~20mm
const SIG_WIDTH = 200;
const SIG_HEIGHT = 50;

function fontFor(block: RenderedBlock, anyBold: boolean): { font: string; size: number } {
  if (block.kind === 'heading') {
    const level = block.level ?? 1;
    return { font: 'Helvetica-Bold', size: level === 1 ? 18 : level === 2 ? 14 : 12 };
  }
  return { font: anyBold ? 'Helvetica-Bold' : 'Helvetica', size: 10.5 };
}

export function toPdf(doc: RenderedDocument): Promise<RenderedPdf> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks: Buffer[] = [];
    const signatureFields: SignatureField[] = [];
    let page = 1;

    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('error', reject);
    pdf.on('pageAdded', () => {
      page += 1;
    });

    for (const zone of doc.zones) {
      for (const [index, block] of zone.blocks.entries()) {
        if (block.kind === 'spacer') {
          pdf.moveDown(1);
          continue;
        }
        if (block.kind === 'separator') {
          const y = pdf.y + 4;
          pdf
            .moveTo(MARGIN, y)
            .lineTo(pdf.page.width - MARGIN, y)
            .stroke();
          pdf.moveDown(1);
          continue;
        }

        const text = block.runs.map((r) => r.text).join('');
        const anyBold = block.runs.some((r) => r.bold);
        const { font, size } = fontFor(block, anyBold);

        // Capture the position BEFORE writing: the field belongs beside the
        // first signOff line, and pdf.y has moved on once the text is drawn.
        const lineTop = pdf.y;
        pdf.font(font).fontSize(size).text(text, { align: 'left' });
        pdf.moveDown(block.kind === 'heading' ? 0.6 : 0.35);

        if (zone.id === 'signOff' && index === 0) {
          signatureFields.push({
            name: 'Signature1',
            page,
            x: MARGIN + 140,
            y: Math.round(lineTop),
            width: SIG_WIDTH,
            height: SIG_HEIGHT,
          });
        }
      }
      pdf.moveDown(0.8);
    }

    pdf.on('end', () => resolve({ bytes: Buffer.concat(chunks), signatureFields }));
    pdf.end();
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- toPdf`
Expected: PASS, 4 tests.

- [ ] **Step 6: Stage, report, and ask before committing**

```bash
git add packages/backend/package.json package-lock.json \
        packages/backend/src/services/document/toPdf.ts \
        packages/backend/src/services/document/toPdf.test.ts
```

Suggested subject: `feat(document): emit a signable PDF with coordinate-placed signature fields`.

---

### Task 5: Resolve `ronl:signatureRef` per task

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts:534-575` (`getDecisionDocument`, plus new method)
- Test: `packages/backend/src/services/operaton.service.test.ts` (append; existing `ronl:documentRef` tests are at ~line 825)

**Interfaces:**

- Consumes: `DocumentTemplate` from Task 2.
- Produces: `operatonService.getTaskSignatureSpec(processInstanceId: string, taskDefinitionKey: string): Promise<{ templateId: string; template: DocumentTemplate } | null>` — `null` when the task carries no `ronl:signatureRef`.

**The existing bug this fixes:** `getDecisionDocument()` runs `bpmnXml.match(/ronl:documentRef="([^"]+)"/)` against the whole document — first match wins regardless of which task carries it. Survivable for `documentRef`, wrong for `signatureRef`, where _which_ task is tagged is the entire point.

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/backend/src/services/operaton.service.test.ts
describe('getTaskSignatureSpec', () => {
  const XML = `<bpmn:definitions>
    <bpmn:userTask id="Task_A" ronl:documentRef="rip-pdp" />
    <bpmn:userTask id="Task_AccorderenProjectplan4" ronl:signatureRef="rip-pdp" />
    <bpmn:userTask id="Task_B" />
  </bpmn:definitions>`;

  it('returns the template named by the tagged task', async () => {
    setupSignature(XML, { id: 'rip-pdp', zones: {}, bindings: [] });
    const spec = await operatonService.getTaskSignatureSpec('pi-1', 'Task_AccorderenProjectplan4');
    expect(spec).not.toBeNull();
    expect(spec!.templateId).toBe('rip-pdp');
  });

  it('returns null for an untagged task even when another task is tagged', async () => {
    setupSignature(XML, { id: 'rip-pdp', zones: {}, bindings: [] });
    expect(await operatonService.getTaskSignatureSpec('pi-1', 'Task_B')).toBeNull();
  });

  it('does not confuse documentRef on one task with signatureRef on another', async () => {
    setupSignature(XML, { id: 'rip-pdp', zones: {}, bindings: [] });
    expect(await operatonService.getTaskSignatureSpec('pi-1', 'Task_A')).toBeNull();
  });
});
```

Write `setupSignature(xml, documentJson)` beside the existing `setup()` helper, following its shape: it stubs `/history/process-instance/{id}`, `/process-definition/{id}/xml`, `/process-definition/{id}`, `/deployment/{id}/resources` and the resource `/data` endpoint.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- operaton.service -t getTaskSignatureSpec`
Expected: FAIL — `operatonService.getTaskSignatureSpec is not a function`.

- [ ] **Step 3: Add the scoped attribute reader**

Add above `getDecisionDocument()`:

```ts
  /**
   * Reads a ronl:* attribute from ONE user task rather than from the first
   * match anywhere in the document. Scoping matters: a process can tag several
   * tasks, and which one carries the attribute is the whole point.
   */
  private readTaskRonlAttribute(bpmnXml: string, taskDefinitionKey: string, attribute: string): string | null {
    const escaped = taskDefinitionKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const element = new RegExp(`<bpmn:userTask\\b[^>]*\\bid="${escaped}"[^>]*>`).exec(bpmnXml);
    if (!element) return null;
    const attr = new RegExp(`\\b${attribute}="([^"]+)"`).exec(element[0]);
    return attr ? attr[1] : null;
  }
```

- [ ] **Step 4: Add `getTaskSignatureSpec`**

```ts
  /**
   * Resolves ronl:signatureRef on a single user task to its deployed
   * DocumentTemplate. Returns null when the task is not signature-bearing,
   * which is the common case for every ordinary task in the app.
   */
  async getTaskSignatureSpec(
    processInstanceId: string,
    taskDefinitionKey: string
  ): Promise<{ templateId: string; template: DocumentTemplate } | null> {
    const hist = await this.client.get(`/history/process-instance/${processInstanceId}`);
    const processDefinitionId: string = hist.data.processDefinitionId;

    const bpmnXml = await this.getCachedBpmnXml(processDefinitionId);
    const templateId = this.readTaskRonlAttribute(bpmnXml, taskDefinitionKey, 'ronl:signatureRef');
    if (!templateId) return null;

    const procDef = await this.client.get(`/process-definition/${processDefinitionId}`);
    const deploymentId: string = procDef.data.deploymentId;
    const resources = await this.client.get(`/deployment/${deploymentId}/resources`);
    const resource = (resources.data as Array<{ id: string; name: string }>).find(
      (r) => r.name === `${templateId}.document`
    );
    if (!resource) {
      logger.error('signatureRef names a template with no deployment resource', {
        processInstanceId,
        taskDefinitionKey,
        templateId,
      });
      throw new Error('SIGNATURE_TEMPLATE_NOT_FOUND');
    }

    const data = await this.client.get(`/deployment/${deploymentId}/resources/${resource.id}/data`, {
      responseType: 'text',
    });
    return { templateId, template: JSON.parse(data.data) as DocumentTemplate };
  }
```

- [ ] **Step 5: Add the BPMN XML cache**

```ts
  // BPMN XML for a given definition id is immutable, so this never needs
  // invalidating. Without it every opened task refetches the whole document.
  private bpmnXmlCache = new Map<string, string>();

  private async getCachedBpmnXml(processDefinitionId: string): Promise<string> {
    const cached = this.bpmnXmlCache.get(processDefinitionId);
    if (cached) return cached;
    const res = await this.client.get(`/process-definition/${processDefinitionId}/xml`);
    const xml: string = res.data.bpmn20Xml;
    this.bpmnXmlCache.set(processDefinitionId, xml);
    return xml;
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- operaton.service`
Expected: PASS — the three new tests plus every pre-existing `operaton.service` test, including the `ronl:documentRef` ones at ~line 825.

- [ ] **Step 7: Stage, report, and ask before committing**

```bash
git add packages/backend/src/services/operaton.service.ts \
        packages/backend/src/services/operaton.service.test.ts
```

Suggested subject: `feat(operaton): resolve ronl:signatureRef scoped to one user task`.

---

### Task 6: `validsign.service.ts` — stub state machine and the live guard

**Files:**

- Create: `packages/backend/src/services/validsign.service.ts`
- Test: `packages/backend/src/services/validsign.service.test.ts`

**Interfaces:**

- Consumes: `config.validsign` (Task 1), `SignatureField` (Task 4).
- Produces:
  - `type PackageStatus = 'DRAFT' | 'SENT' | 'COMPLETED' | 'DECLINED' | 'EXPIRED' | 'ARCHIVED'`
  - `interface CreatePackageInput { name: string; senderEmail: string; signer: { email: string; firstName: string; lastName: string }; pdf: Buffer; fileName: string; signatureFields: SignatureField[] }`
  - `validsignService.createPackage(input): Promise<{ packageId: string; roleId: string }>`
  - `validsignService.getSigningUrl(packageId, roleId): Promise<string>`
  - `validsignService.sendPackage(packageId): Promise<void>`
  - `validsignService.getPackageStatus(packageId): Promise<PackageStatus>`
  - `validsignService.downloadSignedDocument(packageId, documentId): Promise<Buffer>`
  - `validsignService.downloadEvidenceSummary(packageId): Promise<Buffer>`
  - `validsignService.stubSign(packageId, outcome: 'COMPLETED' | 'DECLINED'): void` — stub mode only
  - `validsignService.isStub: boolean`

**Two things the implementer must get right:** every package carries an **explicit sender** (the account key is account-wide; the live probe found packages from several senders, so nothing may rely on a default owner), and in stub mode `getSigningUrl()` returns RBA's own `/v1/validsign/stub/ceremony/{packageId}` so the frontend needs no stub branch and Playwright can drive a same-origin iframe.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/services/validsign.service.test.ts
const mockConfig = {
  validsign: {
    baseUrl: 'https://my.validsign.eu/api',
    apiKey: 'test-key',
    stubMode: true,
    callbackSecret: 'secret',
    liveTiers: [] as string[],
    pollIntervalMs: 15000,
  },
  deploymentEnv: 'development',
};
jest.mock('@utils/config', () => ({ config: mockConfig }));

import { ValidsignService } from './validsign.service';

const input = {
  name: 'RIP 24102 — Uitgangspunten VO',
  senderEmail: 'steven.gort@ictu.nl',
  signer: { email: 'pl@flevoland.nl', firstName: 'Test', lastName: 'Leider' },
  pdf: Buffer.from('%PDF-1.3 fake'),
  fileName: 'rip-pdp-24102.pdf',
  signatureFields: [{ name: 'Signature1', page: 1, x: 100, y: 400, width: 200, height: 50 }],
};

describe('ValidsignService in stub mode', () => {
  beforeEach(() => {
    mockConfig.validsign.stubMode = true;
    mockConfig.validsign.liveTiers = [];
  });

  it('creates a package in DRAFT and moves it to SENT', async () => {
    const svc = new ValidsignService();
    const { packageId, roleId } = await svc.createPackage(input);
    expect(packageId).toMatch(/^stub-/);
    expect(roleId).toBeTruthy();
    expect(await svc.getPackageStatus(packageId)).toBe('DRAFT');
    await svc.sendPackage(packageId);
    expect(await svc.getPackageStatus(packageId)).toBe('SENT');
  });

  it('returns a same-origin ceremony URL so the frontend needs no stub branch', async () => {
    const svc = new ValidsignService();
    const { packageId, roleId } = await svc.createPackage(input);
    expect(await svc.getSigningUrl(packageId, roleId)).toBe(
      `/v1/validsign/stub/ceremony/${packageId}`
    );
  });

  it('advances to COMPLETED and to DECLINED on demand', async () => {
    const svc = new ValidsignService();
    const a = await svc.createPackage(input);
    svc.stubSign(a.packageId, 'COMPLETED');
    expect(await svc.getPackageStatus(a.packageId)).toBe('COMPLETED');

    const b = await svc.createPackage(input);
    svc.stubSign(b.packageId, 'DECLINED');
    expect(await svc.getPackageStatus(b.packageId)).toBe('DECLINED');
  });

  it('returns a signed PDF without touching the network', async () => {
    const svc = new ValidsignService();
    const { packageId } = await svc.createPackage(input);
    svc.stubSign(packageId, 'COMPLETED');
    const signed = await svc.downloadSignedDocument(packageId, 'doc-1');
    expect(signed.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});

describe('the live guard', () => {
  beforeEach(() => {
    mockConfig.validsign.stubMode = false;
    mockConfig.validsign.apiKey = 'test-key';
  });

  it('refuses to create a package on a tier outside the allowlist', async () => {
    mockConfig.validsign.liveTiers = ['production'];
    mockConfig.deploymentEnv = 'development';
    await expect(new ValidsignService().createPackage(input)).rejects.toThrow(
      /VALIDSIGN_LIVE_BLOCKED/
    );
  });

  it('refuses to create a package with no API key', async () => {
    mockConfig.validsign.liveTiers = ['development'];
    mockConfig.deploymentEnv = 'development';
    mockConfig.validsign.apiKey = '';
    await expect(new ValidsignService().createPackage(input)).rejects.toThrow(
      /VALIDSIGN_LIVE_MISCONFIGURED/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- validsign.service`
Expected: FAIL — `Cannot find module './validsign.service'`.

- [ ] **Step 3: Write the service skeleton, stub machine and guard**

```ts
// packages/backend/src/services/validsign.service.ts
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import type { SignatureField } from '@services/document/toPdf';

const logger = createLogger('validsign-service');

export type PackageStatus = 'DRAFT' | 'SENT' | 'COMPLETED' | 'DECLINED' | 'EXPIRED' | 'ARCHIVED';

export interface CreatePackageInput {
  name: string;
  senderEmail: string;
  signer: { email: string; firstName: string; lastName: string };
  pdf: Buffer;
  fileName: string;
  signatureFields: SignatureField[];
}

interface StubPackage {
  status: PackageStatus;
  roleId: string;
  signerName: string;
}

/**
 * ValidsignService — thin REST client for ValidSign (the EU-branded OneSpan
 * Sign platform). There is no Node SDK; Java and .NET only.
 *
 * Stub mode (VALIDSIGN_STUB_MODE, default true) is not a convenience but a
 * safety rail: the licence is production-only, with no sandbox tenant, and the
 * API key is ACCOUNT-WIDE — a live call acts against every sender in the
 * Provincie Flevoland account.
 */
export class ValidsignService {
  private client: AxiosInstance;
  private stubPackages = new Map<string, StubPackage>();
  private stubCounterSeed = 0;

  constructor() {
    this.client = axios.create({
      baseURL: config.validsign.baseUrl,
      timeout: 30_000,
      headers: {
        // The key is used verbatim: it is already the encoded credential, not
        // a user:pass pair to base64-encode again.
        Authorization: `Basic ${config.validsign.apiKey}`,
        Accept: 'application/json',
      },
    });
    logger.info('ValidSign service initialised', {
      stubMode: this.isStub,
      baseUrl: config.validsign.baseUrl,
      liveTiers: config.validsign.liveTiers,
      deploymentEnv: config.deploymentEnv,
    });
  }

  get isStub(): boolean {
    return config.validsign.stubMode;
  }

  /** All three locks, checked before anything can reach the network. */
  private assertLiveAllowed(): void {
    if (this.isStub) return;
    if (!config.validsign.apiKey) {
      throw new Error('VALIDSIGN_LIVE_MISCONFIGURED: live mode with no API key');
    }
    if (!config.validsign.liveTiers.includes(config.deploymentEnv)) {
      throw new Error(
        `VALIDSIGN_LIVE_BLOCKED: DEPLOYMENT_ENV="${config.deploymentEnv}" may not create real packages`
      );
    }
  }

  private nextStubId(prefix: string): string {
    this.stubCounterSeed += 1;
    return `${prefix}-${this.stubCounterSeed}`;
  }

  async createPackage(input: CreatePackageInput): Promise<{ packageId: string; roleId: string }> {
    this.assertLiveAllowed();
    if (this.isStub) {
      const packageId = this.nextStubId('stub');
      const roleId = this.nextStubId('stub-role');
      this.stubPackages.set(packageId, {
        status: 'DRAFT',
        roleId,
        signerName: `${input.signer.firstName} ${input.signer.lastName}`,
      });
      return { packageId, roleId };
    }
    return this.createPackageLive(input); // Task 7
  }

  async sendPackage(packageId: string): Promise<void> {
    this.assertLiveAllowed();
    if (this.isStub) {
      const pkg = this.requireStub(packageId);
      pkg.status = 'SENT';
      return;
    }
    await this.client.put(`/packages/${packageId}`, { status: 'SENT' });
  }

  async getSigningUrl(packageId: string, roleId: string): Promise<string> {
    this.assertLiveAllowed();
    if (this.isStub) {
      // Same-origin on purpose: the frontend needs no stub branch, and
      // Playwright can reach into the iframe with frameLocator().
      return `/v1/validsign/stub/ceremony/${packageId}`;
    }
    const res = await this.client.get(`/packages/${packageId}/roles/${roleId}/signingUrl`);
    return res.data.url as string;
  }

  async getPackageStatus(packageId: string): Promise<PackageStatus> {
    this.assertLiveAllowed();
    if (this.isStub) return this.requireStub(packageId).status;
    const res = await this.client.get(`/packages/${packageId}`);
    return res.data.status as PackageStatus;
  }

  async downloadSignedDocument(packageId: string, documentId: string): Promise<Buffer> {
    this.assertLiveAllowed();
    if (this.isStub) return Buffer.from(`%PDF-1.4 stub signed ${packageId}`);
    const res = await this.client.get(`/packages/${packageId}/documents/${documentId}/pdf`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(res.data as ArrayBuffer);
  }

  async downloadEvidenceSummary(packageId: string): Promise<Buffer> {
    this.assertLiveAllowed();
    if (this.isStub) return Buffer.from(`%PDF-1.4 stub evidence ${packageId}`);
    const res = await this.client.get(`/packages/${packageId}/evidence/summary`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(res.data as ArrayBuffer);
  }

  /** Stub-mode only: drive the ceremony from the local stand-in page. */
  stubSign(packageId: string, outcome: 'COMPLETED' | 'DECLINED'): void {
    if (!this.isStub) throw new Error('stubSign called outside stub mode');
    this.requireStub(packageId).status = outcome;
  }

  stubSignerName(packageId: string): string {
    return this.requireStub(packageId).signerName;
  }

  private requireStub(packageId: string): StubPackage {
    const pkg = this.stubPackages.get(packageId);
    if (!pkg) throw new Error(`VALIDSIGN_UNKNOWN_PACKAGE: ${packageId}`);
    return pkg;
  }
}

export const validsignService = new ValidsignService();
export default validsignService;
```

Note: `createPackageLive` does not exist yet. Add a temporary stub that throws `new Error('not implemented')` so this task compiles; Task 7 replaces it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- validsign.service`
Expected: PASS, 6 tests.

- [ ] **Step 5: Stage, report, and ask before committing**

```bash
git add packages/backend/src/services/validsign.service.ts \
        packages/backend/src/services/validsign.service.test.ts
```

Suggested subject: `feat(validsign): stub state machine and the three-lock live guard`.

---

### Task 7: `validsign.service.ts` — the live REST path

**Files:**

- Modify: `packages/backend/src/services/validsign.service.ts` (replace the `createPackageLive` placeholder)
- Test: `packages/backend/src/services/validsign.service.test.ts` (append a live-mode describe block)

**Interfaces:**

- Consumes: everything from Task 6.
- Produces: no new exports; `createPackage` now works with `stubMode=false`.

**Verified API shape** (read-only probe, HTTP 200): the envelope is `{ count, results }`; packages carry `roles[].signers[]`, `documents[].approvals[].fields[]`, a string `status`, and a `sender`. Package creation is multipart: a `file` part plus a `payload` part holding the package JSON.

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/backend/src/services/validsign.service.test.ts
describe('the live REST path', () => {
  beforeEach(() => {
    mockConfig.validsign.stubMode = false;
    mockConfig.validsign.apiKey = 'test-key';
    mockConfig.validsign.liveTiers = ['development'];
    mockConfig.deploymentEnv = 'development';
    mockClient.post.mockReset();
    mockClient.get.mockReset();
  });

  it('creates a package with an explicit sender and one signer role', async () => {
    mockClient.post.mockResolvedValue({ data: { id: 'pkg-1' } });
    mockClient.get.mockResolvedValue({
      data: { roles: [{ id: 'role-1', type: 'SIGNER', signers: [{ email: 'pl@flevoland.nl' }] }] },
    });

    const { packageId, roleId } = await new ValidsignService().createPackage(input);
    expect(packageId).toBe('pkg-1');
    expect(roleId).toBe('role-1');

    const payload = JSON.parse(
      mockFormAppend.mock.calls.find((c) => c[0] === 'payload')![1] as string
    );
    // The account key is account-wide and the account holds packages from
    // several senders, so nothing may rely on a default owner.
    expect(payload.sender.email).toBe('steven.gort@ictu.nl');
    expect(payload.roles).toHaveLength(1);
    expect(payload.roles[0].signers[0].email).toBe('pl@flevoland.nl');
    expect(payload.documents[0].approvals[0].fields[0]).toMatchObject({
      page: 0,
      width: 200,
      height: 50,
      type: 'SIGNATURE',
    });
  });
});
```

Add `mockFormAppend` and the `form-data` mock at the top of the file, mirroring `edocs.service.test.ts:20-24`, and add `mockClient` with `get`/`post`/`put` plus `jest.mock('axios', () => ({ create: () => mockClient }))`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- validsign.service -t "live REST path"`
Expected: FAIL — `not implemented`.

- [ ] **Step 3: Implement `createPackageLive`**

```ts
  private async createPackageLive(
    input: CreatePackageInput
  ): Promise<{ packageId: string; roleId: string }> {
    const payload = {
      name: input.name,
      type: 'PACKAGE',
      status: 'DRAFT',
      language: 'nl',
      // Explicit sender: the API key is the ACCOUNT key, and the account holds
      // packages from several senders. Relying on a default owner would
      // attribute province approvals to whoever the key resolves to.
      sender: { email: input.senderEmail },
      roles: [
        {
          id: 'signer1',
          name: 'signer1',
          type: 'SIGNER',
          index: 1,
          signers: [
            {
              email: input.signer.email,
              firstName: input.signer.firstName,
              lastName: input.signer.lastName,
            },
          ],
        },
      ],
      documents: [
        {
          name: input.fileName,
          index: 0,
          // extract:false — we author this PDF and know the coordinates, so
          // text-anchor extraction would only add a failure mode.
          extract: false,
          approvals: [
            {
              role: 'signer1',
              fields: input.signatureFields.map((f) => ({
                type: 'SIGNATURE',
                subtype: 'FULLNAME',
                name: f.name,
                // ValidSign pages are zero-based; ours are one-based.
                page: f.page - 1,
                top: f.y,
                left: f.x,
                width: f.width,
                height: f.height,
              })),
            },
          ],
        },
      ],
    };

    const form = new FormData();
    form.append('file', input.pdf, { filename: input.fileName, contentType: 'application/pdf' });
    form.append('payload', JSON.stringify(payload));

    const created = await this.client.post('/packages', form, { headers: form.getHeaders() });
    const packageId = created.data.id as string;

    const pkg = await this.client.get(`/packages/${packageId}`);
    const role = (pkg.data.roles as Array<{ id: string; type: string }>).find((r) => r.type === 'SIGNER');
    if (!role) throw new Error(`VALIDSIGN_NO_SIGNER_ROLE: ${packageId}`);

    logger.info('ValidSign package created', { packageId, roleId: role.id });
    return { packageId, roleId: role.id };
  }
```

Add `import FormData from 'form-data';` at the top of the service.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- validsign.service`
Expected: PASS, 7 tests.

- [ ] **Step 5: Stage, report, and ask before committing**

```bash
git add packages/backend/src/services/validsign.service.ts \
        packages/backend/src/services/validsign.service.test.ts
```

Suggested subject: `feat(validsign): create live packages with an explicit sender`.

---

### Task 8: `completeSignature()` — the shared, idempotent completion path

**Files:**

- Create: `packages/backend/src/services/validsignCompletion.service.ts`
- Test: `packages/backend/src/services/validsignCompletion.service.test.ts`

**Interfaces:**

- Consumes: `validsignService` (Tasks 6–7), `edocsService.uploadDocument`, `operatonService`.
- Produces: `completeSignature(packageId: string): Promise<'completed' | 'declined' | 'noop'>`.

**Why this is its own module:** the callback route and the poller both call it and _will_ race. The status check alone is not enough — the variable read/write is not atomic, so two callers can both pass the gate and complete the Operaton task twice.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/services/validsignCompletion.service.test.ts
import { completeSignature } from './validsignCompletion.service';

describe('completeSignature', () => {
  beforeEach(() => jest.clearAllMocks());

  it('archives the signed document and completes the task as approved', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
      edocsWorkspaceId: 'ws-1',
      department: 'Infra',
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');

    expect(await completeSignature('pkg-1')).toBe('completed');
    expect(mockUploadDocument).toHaveBeenCalledTimes(2); // signed PDF + evidence
    expect(mockCompleteTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ approvalStatus: { value: 'approved', type: 'String' } })
    );
  });

  it('completes the task as rejected when the signer declines', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
    });
    mockGetPackageStatus.mockResolvedValue('DECLINED');

    expect(await completeSignature('pkg-1')).toBe('declined');
    expect(mockCompleteTask).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ approvalStatus: { value: 'rejected', type: 'String' } })
    );
  });

  it('is idempotent: a second call does nothing', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'completed',
    });
    expect(await completeSignature('pkg-1')).toBe('noop');
    expect(mockCompleteTask).not.toHaveBeenCalled();
  });

  it('does not complete the task twice when callback and poller race', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');
    const [a, b] = await Promise.all([completeSignature('pkg-1'), completeSignature('pkg-1')]);
    expect([a, b].filter((r) => r === 'completed')).toHaveLength(1);
    expect(mockCompleteTask).toHaveBeenCalledTimes(1);
  });

  it('still completes the task when archiving to eDOCS fails', async () => {
    mockFindInstance.mockResolvedValue({
      processInstanceId: 'pi-1',
      taskId: 'task-1',
      status: 'sent',
    });
    mockGetPackageStatus.mockResolvedValue('COMPLETED');
    mockUploadDocument.mockRejectedValue(new Error('eDOCS down'));

    expect(await completeSignature('pkg-1')).toBe('completed');
    expect(mockSetVariables).toHaveBeenCalledWith(
      'pi-1',
      expect.objectContaining({ validsignArchiveStatus: { value: 'failed', type: 'String' } })
    );
    expect(mockCompleteTask).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- validsignCompletion`
Expected: FAIL — `Cannot find module './validsignCompletion.service'`.

- [ ] **Step 3: Write the module**

```ts
// packages/backend/src/services/validsignCompletion.service.ts
import { createLogger } from '@utils/logger';
import { getErrorMessage } from '@utils/errors';
import { edocsService } from '@services/edocs.service';
import { operatonService } from '@services/operaton.service';
import { validsignService } from '@services/validsign.service';

const logger = createLogger('validsign-completion');

/**
 * One in-flight completion per package. The status variable alone is not
 * enough: the read and the write are not atomic, so a simultaneous callback
 * and poll can both pass the gate and complete the Operaton task twice.
 */
const inFlight = new Map<string, Promise<'completed' | 'declined' | 'noop'>>();

export async function completeSignature(
  packageId: string
): Promise<'completed' | 'declined' | 'noop'> {
  const existing = inFlight.get(packageId);
  if (existing) return existing;

  const run = doComplete(packageId).finally(() => inFlight.delete(packageId));
  inFlight.set(packageId, run);
  return run;
}

async function doComplete(packageId: string): Promise<'completed' | 'declined' | 'noop'> {
  const found = await operatonService.findInstanceByValidsignPackage(packageId);
  if (!found) {
    // A stale retry for a package we no longer track. Not an error.
    logger.info('Completion for an unknown package ignored', { packageId });
    return 'noop';
  }
  if (found.status === 'completed' || found.status === 'declined') return 'noop';

  const status = await validsignService.getPackageStatus(packageId);
  if (status !== 'COMPLETED' && status !== 'DECLINED') return 'noop';

  const approved = status === 'COMPLETED';
  const variables: Record<string, { value: unknown; type: string }> = {
    validsignStatus: { value: approved ? 'completed' : 'declined', type: 'String' },
    validsignSignedAt: { value: new Date().toISOString(), type: 'String' },
  };

  if (approved) {
    try {
      const [signed, evidence] = await Promise.all([
        validsignService.downloadSignedDocument(packageId, found.documentId ?? 'doc-1'),
        validsignService.downloadEvidenceSummary(packageId),
      ]);
      const base = `${found.projectNumber ?? 'RIP'} — Uitgangspunten VO-fase (ondertekend)`;
      const doc = await edocsService.uploadDocument(
        found.edocsWorkspaceId!,
        `rip-pdp-${found.projectNumber ?? packageId}-signed.pdf`,
        signed.toString('base64'),
        { docName: base, department: found.department! }
      );
      await edocsService.uploadDocument(
        found.edocsWorkspaceId!,
        `rip-pdp-${found.projectNumber ?? packageId}-evidence.pdf`,
        evidence.toString('base64'),
        { docName: `${base} — bewijsoverzicht`, department: found.department! }
      );
      variables.validsignSignedDocNumber = { value: doc.documentNumber, type: 'String' };
      variables.validsignSignedDocId = { value: doc.documentId, type: 'String' };
      variables.validsignArchiveStatus = { value: 'ok', type: 'String' };
    } catch (error) {
      // The signature is legally complete and retrievable from ValidSign the
      // moment the signer finishes. Blocking the process on an archival
      // failure would strand a valid approval behind an unrelated outage, with
      // no recovery, since the task cannot be re-signed.
      logger.error('Archiving the signed document to eDOCS failed; completing the task anyway', {
        packageId,
        processInstanceId: found.processInstanceId,
        error: getErrorMessage(error),
      });
      variables.validsignArchiveStatus = { value: 'failed', type: 'String' };
    }
  }

  await operatonService.setProcessVariables(found.processInstanceId, variables);
  await operatonService.completeTask(found.taskId, {
    ...variables,
    approvalStatus: { value: approved ? 'approved' : 'rejected', type: 'String' },
  });

  logger.info('Signature completed', {
    packageId,
    processInstanceId: found.processInstanceId,
    approved,
    archive: variables.validsignArchiveStatus?.value,
  });
  return approved ? 'completed' : 'declined';
}
```

Add to `operaton.service.ts`: `findInstanceByValidsignPackage(packageId)` (querying `/process-instance?variables=validsignPackageId_eq_<id>`, then reading that instance's variables and its single open task) and `setProcessVariables(processInstanceId, variables)` (`POST /process-instance/{id}/variables` with `{ modifications }`). Write a test for each beside the Task 5 tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- validsignCompletion`
Expected: PASS, 5 tests.

- [ ] **Step 5: Stage, report, and ask before committing**

```bash
git add packages/backend/src/services/validsignCompletion.service.ts \
        packages/backend/src/services/validsignCompletion.service.test.ts \
        packages/backend/src/services/operaton.service.ts \
        packages/backend/src/services/operaton.service.test.ts
```

Suggested subject: `feat(validsign): idempotent completion shared by callback and poller`.

---

### Task 9: Routes, callback and stub ceremony

**Files:**

- Create: `packages/backend/src/routes/validsign.routes.ts`
- Modify: `packages/backend/src/index.ts` (limiter skip near line 83-103; route mount near line 174)
- Test: `packages/backend/src/routes/validsign.routes.test.ts`

**Interfaces:**

- Consumes: `completeSignature` (Task 8), `validsignService` (Tasks 6–7), `operatonService.getTaskSignatureSpec` (Task 5), `renderTemplate`/`toPdf` (Tasks 2, 4).
- Produces: the five routes in the spec's section D table.

- [ ] **Step 1: Add the limiter skip**

In `packages/backend/src/index.ts`, change the `rateLimit({...})` options to include:

```ts
  // ValidSign's callback must not share the board's IP bucket. The limiter is
  // global and IP-keyed, and with TRUST_PROXY=false every client behind one
  // proxy shares ONE budget — so a busy board could 429 the callback and
  // silently drop a signature. It gets its own limiter in validsign.routes.ts.
  skip: (req: Request) => req.path === '/v1/validsign/callback',
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/backend/src/routes/validsign.routes.test.ts
describe('POST /v1/validsign/callback', () => {
  it('rejects a request with no shared secret', async () => {
    const res = await request(app).post('/v1/validsign/callback').send({ packageId: 'pkg-1' });
    expect(res.status).toBe(401);
    expect(mockCompleteSignature).not.toHaveBeenCalled();
  });

  it('rejects a wrong shared secret without leaking timing', async () => {
    const res = await request(app)
      .post('/v1/validsign/callback')
      .set('x-validsign-secret', 'wrong')
      .send({ packageId: 'pkg-1' });
    expect(res.status).toBe(401);
  });

  it('accepts a valid callback and drives completion', async () => {
    mockCompleteSignature.mockResolvedValue('completed');
    const res = await request(app)
      .post('/v1/validsign/callback')
      .set('x-validsign-secret', 'secret')
      .send({ packageId: 'pkg-1', name: 'PACKAGE_COMPLETE' });
    expect(res.status).toBe(200);
    expect(mockCompleteSignature).toHaveBeenCalledWith('pkg-1');
  });

  it('answers 200 for an unknown package rather than 404', async () => {
    // A stale retry must generate no noise, and the response must not reveal
    // which package ids exist.
    mockCompleteSignature.mockResolvedValue('noop');
    const res = await request(app)
      .post('/v1/validsign/callback')
      .set('x-validsign-secret', 'secret')
      .send({ packageId: 'never-heard-of-it' });
    expect(res.status).toBe(200);
  });
});

describe('GET /v1/validsign/task/:taskId/spec', () => {
  it('reports required:false for an untagged task', async () => {
    mockGetTaskSignatureSpec.mockResolvedValue(null);
    const res = await request(app).get('/v1/validsign/task/task-1/spec').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ required: false });
  });
});

describe('the stub ceremony', () => {
  it('is 404 when stub mode is off', async () => {
    mockValidsign.isStub = false;
    const res = await request(app).get('/v1/validsign/stub/ceremony/pkg-1');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- validsign.routes`
Expected: FAIL — `Cannot find module '../routes/validsign.routes'`.

- [ ] **Step 4: Write the callback route**

```ts
// packages/backend/src/routes/validsign.routes.ts (callback portion)
import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { completeSignature } from '@services/validsignCompletion.service';

const logger = createLogger('validsign-routes');
export const callbackRouter = express.Router();

const callbackLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  // Keyed on the shared secret, not the IP: ValidSign's cloud shares no
  // address with the board, and the global IP bucket must not apply here.
  keyGenerator: (req) => String(req.headers['x-validsign-secret'] ?? 'anonymous'),
});

function secretMatches(provided: unknown): boolean {
  const expected = config.validsign.callbackSecret;
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length must be checked first: timingSafeEqual throws on unequal lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

callbackRouter.post(
  '/callback',
  callbackLimiter,
  express.json({ limit: '32kb' }),
  async (req, res) => {
    if (!secretMatches(req.headers['x-validsign-secret'])) {
      logger.warn('ValidSign callback rejected: bad shared secret');
      return res
        .status(401)
        .json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid secret' } });
    }
    const packageId = String((req.body as { packageId?: string }).packageId ?? '');
    logger.info('ValidSign callback received', {
      packageId,
      event: (req.body as { name?: string }).name,
    });
    try {
      await completeSignature(packageId);
    } catch (error) {
      logger.error('Callback completion failed; the poller will retry', {
        packageId,
        error: String(error),
      });
    }
    // Always 200: an unknown or stale package must generate no noise, and the
    // response must not reveal which package ids exist.
    return res.status(200).json({ success: true });
  }
);
```

- [ ] **Step 5: Write the authenticated routes and the stub ceremony**

In the same file, a second router behind `jwtMiddleware` + `tenantMiddleware` (mirroring `rip.routes.ts:11-12`) exposing:

- `GET /task/:taskId/spec` — read the task from Operaton for its `processInstanceId` and `taskDefinitionKey`, call `operatonService.getTaskSignatureSpec(...)`, return `{ required: false }` when it is `null`, else `{ required: true, templateId, status, packageId, signingUrl }` read from process variables.
- `POST /task/:taskId/package` — resolve the spec, fetch process variables, `renderTemplate` → `toPdf`, `validsignService.createPackage({ senderEmail: config.validsign.senderEmail ?? req.user.email, signer: { email: req.user.email, firstName: req.user.givenName, lastName: req.user.familyName }, ... })`, then `sendPackage`, write `validsignPackageId`/`validsignStatus=sent` via `setProcessVariables`, and return `{ packageId, signingUrl }` for `delivery === 'embedded'` or `{ packageId, sentTo }` for `'email'`.
- `GET /task/:taskId/status` — return `{ status }` from process variables.
- `GET /stub/ceremony/:packageId` — `404` unless `validsignService.isStub`; otherwise serve a minimal HTML page with an "Onderteken" and a "Weigeren" button posting to the route below.
- `POST /stub/ceremony/:packageId/sign` — `404` unless stub; call `validsignService.stubSign(packageId, outcome)` then `completeSignature(packageId)`.

- [ ] **Step 6: Mount the routes**

In `packages/backend/src/index.ts`, beside the other `app.use('/v1/...')` lines (~line 174):

```ts
// The callback router mounts on its own, BEFORE any auth: ValidSign carries no
// token. The authenticated router applies jwtMiddleware internally.
app.use('/v1/validsign', validsignCallbackRoutes);
app.use('/v1/validsign', validsignRoutes);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- validsign.routes`
Expected: PASS, 7 tests.

- [ ] **Step 8: Stage, report, and ask before committing**

```bash
git add packages/backend/src/routes/validsign.routes.ts \
        packages/backend/src/routes/validsign.routes.test.ts \
        packages/backend/src/index.ts
```

Suggested subject: `feat(validsign): routes, secret-verified callback and stub ceremony`.

---

### Task 10: The safety-net poller

**Files:**

- Create: `packages/backend/src/services/validsignPoller.service.ts`
- Modify: `packages/backend/src/index.ts` (start beside `externalTaskWorker.start()`)
- Test: `packages/backend/src/services/validsignPoller.service.test.ts`

**Interfaces:**

- Consumes: `completeSignature` (Task 8), `operatonService`.
- Produces: `validsignPoller.start(): void`, `validsignPoller.stop(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/backend/src/services/validsignPoller.service.test.ts
import { ValidsignPoller } from './validsignPoller.service';

describe('ValidsignPoller', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('drives completion for each instance awaiting a signature', async () => {
    mockFindAwaiting.mockResolvedValue([
      { validsignPackageId: 'pkg-1' },
      { validsignPackageId: 'pkg-2' },
    ]);
    const poller = new ValidsignPoller();
    await poller.tick();
    expect(mockCompleteSignature).toHaveBeenCalledWith('pkg-1');
    expect(mockCompleteSignature).toHaveBeenCalledWith('pkg-2');
  });

  it('keeps polling after one package throws', async () => {
    mockFindAwaiting.mockResolvedValue([
      { validsignPackageId: 'bad' },
      { validsignPackageId: 'good' },
    ]);
    mockCompleteSignature.mockRejectedValueOnce(new Error('boom'));
    const poller = new ValidsignPoller();
    await expect(poller.tick()).resolves.toBeUndefined();
    expect(mockCompleteSignature).toHaveBeenCalledWith('good');
  });

  it('stop() clears the timer', () => {
    const poller = new ValidsignPoller();
    poller.start();
    poller.stop();
    expect(jest.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- validsignPoller`
Expected: FAIL — `Cannot find module './validsignPoller.service'`.

- [ ] **Step 3: Write the poller**

```ts
// packages/backend/src/services/validsignPoller.service.ts
import { config } from '@utils/config';
import { createLogger } from '@utils/logger';
import { getErrorMessage } from '@utils/errors';
import { operatonService } from '@services/operaton.service';
import { completeSignature } from '@services/validsignCompletion.service';

const logger = createLogger('validsign-poller');

/**
 * Safety net, not the primary path. When every callback arrives this only ever
 * observes already-completed work and no-ops. It earns its place when the
 * callback cannot reach us at all — which is always the case locally, since
 * ValidSign's cloud cannot reach localhost.
 */
export class ValidsignPoller {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, config.validsign.pollIntervalMs);
    logger.info('ValidSign poller started', { intervalMs: config.validsign.pollIntervalMs });
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info('ValidSign poller stopped');
  }

  async tick(): Promise<void> {
    try {
      const awaiting = await operatonService.findInstancesAwaitingSignature();
      for (const instance of awaiting) {
        try {
          await completeSignature(instance.validsignPackageId);
        } catch (error) {
          // One bad package must not stop the sweep.
          logger.error('Poller completion failed', {
            packageId: instance.validsignPackageId,
            error: getErrorMessage(error),
          });
        }
      }
    } catch (error) {
      logger.error('Poller sweep failed', { error: getErrorMessage(error) });
    }
  }
}

export const validsignPoller = new ValidsignPoller();
export default validsignPoller;
```

Add `operatonService.findInstancesAwaitingSignature()` querying `/process-instance?variables=validsignStatus_eq_sent`, returning `Array<{ processInstanceId: string; validsignPackageId: string }>`, with a test beside the Task 5 tests.

- [ ] **Step 4: Start and stop it**

In `packages/backend/src/index.ts`, beside `externalTaskWorker.start()`, add `validsignPoller.start();`, and add `validsignPoller.stop();` to the existing SIGTERM/SIGINT handlers.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- validsignPoller`
Expected: PASS, 3 tests.

- [ ] **Step 6: Stage, report, and ask before committing**

```bash
git add packages/backend/src/services/validsignPoller.service.ts \
        packages/backend/src/services/validsignPoller.service.test.ts \
        packages/backend/src/services/operaton.service.ts \
        packages/backend/src/services/operaton.service.test.ts \
        packages/backend/src/index.ts
```

Suggested subject: `feat(validsign): poll for signatures the callback never delivered`.

---

### Task 11: Route `rip-pdp` through the template renderer

**Files:**

- Modify: `packages/backend/src/services/externalTaskWorker.service.ts:272-305` (`handleUploadDocument`) and `:332-395` (`renderDocumentContent`, `templateIdToLabel`)
- Test: `packages/backend/src/services/externalTaskWorker.service.test.ts:259-420`

**Interfaces:**

- Consumes: `renderTemplate` (Task 2), `toMarkdown` (Task 3), `operatonService.getTaskSignatureSpec`'s sibling template loader.
- Produces: no new exports.

**Scope, decided:** **only `rip-pdp` migrates.** `rip-intake-report` and `rip-psu-report` keep the hardcoded `switch` and stay `.txt`, byte-for-byte unchanged. The allowlist below is the whole fork, and deleting it is the follow-up.

- [ ] **Step 1: Write the failing test**

```ts
// append to packages/backend/src/services/externalTaskWorker.service.test.ts
describe('template-rendered documents', () => {
  it('renders rip-pdp from the deployed template as Markdown', async () => {
    mockLoadTemplate.mockResolvedValue({
      id: 'rip-pdp',
      bindings: [
        {
          id: 'b1',
          placeholder: '{{projectNumber}}',
          variableKey: 'projectNumber',
          source: 'process',
        },
      ],
      zones: {
        body: {
          blocks: [{ id: 'x', type: 'text', content: heading('Project {{projectNumber}}') }],
        },
      },
    });

    await worker.handleTask(taskWith({ documentTemplateId: 'rip-pdp', projectNumber: 'FL-042' }));

    const [, filename, base64] = mockUploadDocument.mock.calls[0];
    expect(filename).toBe('rip-pdp-FL-042.md');
    expect(Buffer.from(base64, 'base64').toString('utf8')).toContain('# Project FL-042');
  });

  it('leaves rip-intake-report on the hardcoded renderer as .txt', async () => {
    await worker.handleTask(
      taskWith({ documentTemplateId: 'rip-intake-report', projectNumber: 'FL-042' })
    );
    const [, filename, base64] = mockUploadDocument.mock.calls[0];
    expect(filename).toBe('rip-intake-report-FL-042.txt');
    expect(Buffer.from(base64, 'base64').toString('utf8')).toContain('INTAKE REPORT (Column 2)');
    expect(mockLoadTemplate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/backend -- externalTaskWorker -t "template-rendered"`
Expected: FAIL — the filename is `rip-pdp-FL-042.txt`.

- [ ] **Step 3: Add the allowlist and the fork**

At the top of `externalTaskWorker.service.ts`:

```ts
/**
 * Templates migrated off the hardcoded renderDocumentContent() switch.
 * Deleting this set — and the switch with it — is the follow-up, once the
 * rendered output has been reviewed in eDOCS for a real project. Only rip-pdp
 * migrates now: it is the document the ValidSign signature touches, so
 * converting the other two would change documents for no benefit here.
 */
const TEMPLATE_RENDERER_MIGRATED = new Set(['rip-pdp']);
```

In `handleUploadDocument`, replace the content/filename lines with:

```ts
const migrated = TEMPLATE_RENDERER_MIGRATED.has(templateId);
const content = migrated
  ? toMarkdown(
      renderTemplate(
        await operatonService.getDeployedTemplate(task.processInstanceId, templateId),
        flattenVariables(task.variables)
      )
    )
  : this.renderDocumentContent(templateId, task.variables);
const extension = migrated ? 'md' : 'txt';
const contentBase64 = Buffer.from(content, 'utf-8').toString('base64');
const filename = `${templateId}-${projectNumber}.${extension}`;
```

Add `operatonService.getDeployedTemplate(processInstanceId, templateId)` — the same deployment-resource lookup `getTaskSignatureSpec` uses, factored out so both call it — and a local `flattenVariables()` turning Operaton's `{ value, type }` map into a plain `Record<string, unknown>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=@ronl/backend -- externalTaskWorker`
Expected: PASS — the two new tests plus every pre-existing worker test unchanged.

- [ ] **Step 5: Stage, report, and ask before committing**

```bash
git add packages/backend/src/services/externalTaskWorker.service.ts \
        packages/backend/src/services/externalTaskWorker.service.test.ts \
        packages/backend/src/services/operaton.service.ts \
        packages/backend/src/services/operaton.service.test.ts
```

Suggested subject: `feat(rip): render rip-pdp from its deployed template as Markdown`.

---

### Task 12: The signing panel

**Files:**

- Modify: `packages/frontend/src/services/api.ts` (add a `validsign` namespace beside `rip` at line 262)
- Create: `packages/frontend/src/components/InfraBoardDashboard/SigningPanel.tsx`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx:55-146`
- Modify: `packages/frontend/src/components/InfraBoardDashboard/dashboard-infra.css` (panel styles; **do not** run prettier on it)
- Test: `packages/frontend/src/components/InfraBoardDashboard/SigningPanel.test.tsx`

**Interfaces:**

- Consumes: the Task 9 routes via `businessApi.validsign`.
- Produces: `<SigningPanel taskId={string} spec={SignatureSpec} onCompleted={() => void} />`.

**Two rules the implementer must not rediscover the hard way:**

1. `SigningPanel` sets **no** completion message of its own. `onCompleted` unmounts the panel, so anything set alongside it dies in the same tick and never paints — the lesson already written at `ProjectDetail.tsx:136` and fixed in commit `158fba7`. The parent owns the confirmation.
2. Polling must stop on unmount **and** while the tab is hidden. The limiter is global and IP-keyed, and with `TRUST_PROXY=false` every client behind one proxy shares one bucket.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/frontend/src/components/InfraBoardDashboard/SigningPanel.test.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SigningPanel from './SigningPanel';

const mockCreatePackage = vi.hoisted(() => vi.fn());
const mockStatus = vi.hoisted(() => vi.fn());
vi.mock('../../services/api', () => ({
  businessApi: { validsign: { createPackage: mockCreatePackage, status: mockStatus } },
}));

const spec = { required: true as const, templateId: 'rip-pdp', status: 'none' as const };

describe('SigningPanel', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('offers both delivery routes before anything is created', () => {
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Onderteken nu/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Stuur per e-mail/ })).toBeTruthy();
  });

  it('shows the ceremony iframe once a package exists', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'pkg-1', signingUrl: '/v1/validsign/stub/ceremony/pkg-1' },
    });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => {
      const frame = document.querySelector('iframe.pb-sign-frame') as HTMLIFrameElement;
      expect(frame.src).toContain('/v1/validsign/stub/ceremony/pkg-1');
    });
  });

  it('names the recipient on the email route, because it is the claimant', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'pkg-1', sentTo: 'pl@flevoland.nl' },
    });
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Stuur per e-mail/ }));
    await waitFor(() => expect(screen.getByText(/pl@flevoland\.nl/)).toBeTruthy());
  });

  it('calls onCompleted when polling reports completion, and sets no message itself', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'pkg-1', signingUrl: '/x' },
    });
    mockStatus.mockResolvedValue({ success: true, data: { status: 'completed' } });
    const onCompleted = vi.fn();
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={onCompleted} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalled(), { timeout: 5000 });
    expect(screen.queryByText(/Taak voltooid/)).toBeNull();
  });

  it('reports a decline as an outcome rather than an error', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'p', signingUrl: '/x' },
    });
    mockStatus.mockResolvedValue({ success: true, data: { status: 'declined' } });
    const onCompleted = vi.fn();
    render(<SigningPanel taskId="t1" spec={spec} onCompleted={onCompleted} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(screen.getByText(/niet akkoord/i)).toBeTruthy());
    expect(screen.queryByText(/mislukt/i)).toBeNull();
  });

  it('stops polling when unmounted', async () => {
    mockCreatePackage.mockResolvedValue({
      success: true,
      data: { packageId: 'p', signingUrl: '/x' },
    });
    mockStatus.mockResolvedValue({ success: true, data: { status: 'sent' } });
    const { unmount } = render(<SigningPanel taskId="t1" spec={spec} onCompleted={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Onderteken nu/ }));
    await waitFor(() => expect(mockStatus).toHaveBeenCalled());
    const callsAtUnmount = mockStatus.mock.calls.length;
    unmount();
    await new Promise((r) => setTimeout(r, 3500));
    expect(mockStatus.mock.calls.length).toBe(callsAtUnmount);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=@ronl/frontend -- SigningPanel`
Expected: FAIL — `Failed to resolve import "./SigningPanel"`.

- [ ] **Step 3: Add the API namespace**

In `packages/frontend/src/services/api.ts`, beside `rip` (line 262):

```ts
  validsign: {
    taskSpec: async (taskId: string): Promise<ApiResponse<SignatureSpec>> =>
      apiGet(`/v1/validsign/task/${taskId}/spec`),
    createPackage: async (
      taskId: string,
      delivery: 'embedded' | 'email'
    ): Promise<ApiResponse<{ packageId: string; signingUrl?: string; sentTo?: string }>> =>
      apiPost(`/v1/validsign/task/${taskId}/package`, { delivery }),
    status: async (taskId: string): Promise<ApiResponse<{ status: SignatureStatus }>> =>
      apiGet(`/v1/validsign/task/${taskId}/status`),
  },
```

with `export type SignatureStatus = 'none' | 'sent' | 'completed' | 'declined' | 'failed';` and `export interface SignatureSpec { required: boolean; templateId?: string; status?: SignatureStatus; packageId?: string; signingUrl?: string }`.

- [ ] **Step 4: Write `SigningPanel.tsx`**

A `useState` machine over `'idle' | 'preparing' | 'ceremony' | 'sent' | 'declined' | 'error'`, with:

```tsx
// 3s, cleared on unmount and suspended while the tab is hidden. The limiter
// is global and IP-keyed: with TRUST_PROXY=false every client behind one
// proxy shares ONE bucket, which is how the PA cockpit produced 429s.
useEffect(() => {
  if (state !== 'ceremony' && state !== 'sent') return;
  const id = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    void businessApi.validsign.status(taskId).then((res) => {
      if (!res.success) return;
      if (res.data.status === 'completed') onCompleted();
      if (res.data.status === 'declined') setState('declined');
    });
  }, 3000);
  return () => clearInterval(id);
}, [state, taskId, onCompleted]);
```

The `ceremony` state renders `<iframe className="pb-sign-frame" src={signingUrl} title="ValidSign ondertekenen" />`. The `sent` state renders the recipient's address and "Deze taak wordt automatisch afgerond zodra er getekend is." No completion message anywhere.

- [ ] **Step 5: Wire it into `TaskWorkPanel`**

In `ProjectDetail.tsx`, fetch the spec alongside the existing `businessApi.task.variables` call on mount, and make the Acties branch three-way:

```tsx
{
  !isClaimed ? (
    <button type="button" className="v2-btn" onClick={claim} disabled={claiming}>
      {claiming ? 'Claimen…' : 'Taak claimen'}
    </button>
  ) : sig?.required ? (
    <SigningPanel taskId={task.id} spec={sig} onCompleted={() => onDone(task)} />
  ) : (
    <TaskFormViewer
      taskId={task.id}
      variables={variables}
      onCompleted={() => onDone(task)}
      onError={() => setMsg({ type: 'err', text: 'Opslaan mislukt.' })}
    />
  );
}
```

- [ ] **Step 6: Write the regression test that matters most**

```tsx
// append to packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx
it('still renders the ordinary task form when the task needs no signature', async () => {
  mockTaskSpec.mockResolvedValue({ success: true, data: { required: false } });
  // Every non-signing task in the app flows through this branch.
  render(<ProjectDetail projectRef={liveRef} onBack={vi.fn()} />);
  await userEvent.click(await screen.findByText(/Aanleveren Projectplan/));
  await userEvent.click(screen.getByRole('button', { name: /Taak claimen/ }));
  await waitFor(() => expect(screen.getByTestId('task-form-viewer')).toBeTruthy());
  expect(document.querySelector('.pb-sign-frame')).toBeNull();
});
```

- [ ] **Step 7: Run the frontend suite**

Run: `npm test --workspace=@ronl/frontend -- SigningPanel ProjectDetail`
Expected: PASS — 6 SigningPanel tests plus every pre-existing ProjectDetail test.

- [ ] **Step 8: Typecheck and lint**

Run: `npm run lint --workspaces --if-present`
Expected: no errors. Then **ask the user to look at the panel in the browser** — do not stand up Playwright or drive a browser to verify it.

- [ ] **Step 9: Stage, report, and ask before committing**

```bash
git add packages/frontend/src/services/api.ts \
        packages/frontend/src/components/InfraBoardDashboard/SigningPanel.tsx \
        packages/frontend/src/components/InfraBoardDashboard/SigningPanel.test.tsx \
        packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.tsx \
        packages/frontend/src/components/InfraBoardDashboard/ProjectDetail.test.tsx \
        packages/frontend/src/components/InfraBoardDashboard/dashboard-infra.css
```

Suggested subject: `feat(infra-board): sign the phase-exit approval from the task panel`.

---

### Task 13: Tag the BPMN, redeploy, extend the E2E

**Files:**

- Modify: `linked-data-explorer/e2e-fixtures/flevoland/RipR21Process.bpmn` (`Task_AccorderenProjectplan4`)
- Coordinate: `packages/frontend/e2e/rip-r21-journey.spec.ts` — **owned by another session**

**Interfaces:**

- Consumes: everything above.
- Produces: a signature-bearing R2.1 phase exit.

**Do this task last.** Tagging the BPMN before the RBA side is ready routes the E2E into a signing panel that does not exist.

- [ ] **Step 1: Branch in linked-data-explorer**

```bash
cd C:/Users/gorts01/Development/linked-data-explorer
git checkout -b feature/rip-r21-signature-tag acc
```

- [ ] **Step 2: Add the attribute**

In `e2e-fixtures/flevoland/RipR21Process.bpmn`, on `Task_AccorderenProjectplan4` only:

```xml
<bpmn:userTask id="Task_AccorderenProjectplan4" name="Accorderen Projectplan&#10;4. Uitgangspunten VO-fase" camunda:formRef="rip-approval" camunda:formRefBinding="latest" camunda:candidateGroups="rip-projectleider,rip-aandrager,rip-ao" ronl:signatureRef="rip-pdp">
```

`xmlns:ronl="http://ronl.nl/schema/1.0"` is already declared and verified to round-trip through the engine, so this needs no namespace change.

- [ ] **Step 3: Verify the fixture still passes its own checks**

Run: `npm test --workspace=@linked-data-explorer/backend -- e2e-fixtures`
Expected: PASS, 5 tests — including the XSD artifact-ordering check.

- [ ] **Step 4: Stage, report, and ask before committing**

Suggested subject: `feat(rip): require a ValidSign signature on the R2.1 phase-exit approval`.

- [ ] **Step 5: Hand the redeploy to the user**

Ask the user to redeploy `RipR21Process` from LDE, then verify with:

```bash
curl -s "http://localhost:8081/engine-rest/process-definition?key=RipR21Process&latestVersion=true"
```

and confirm the new version's XML contains `ronl:signatureRef="rip-pdp"` on `Task_AccorderenProjectplan4`.

- [ ] **Step 6: Coordinate the E2E extension**

`packages/frontend/e2e/rip-r21-journey.spec.ts` belongs to another session. Send it the required change rather than editing it: at `Accorderen Projectplan 4`, the journey must click "Onderteken nu", then sign inside the same-origin stub iframe via `page.frameLocator('iframe.pb-sign-frame').getByRole('button', { name: /Onderteken/ }).click()`, then assert the task completed with `approvalStatus=approved`. Note for that session that `TASK_SPECS`' form-filling recipe does not apply to this task — it has no form.

- [ ] **Step 7: Full-suite handoff**

Ask the user to run the complete backend and frontend suites plus the E2E, and wait for their green before anything merges:

```
npm test --workspace=@ronl/backend
npm test --workspace=@ronl/frontend
npm run test:e2e --workspace=@ronl/frontend
```

- [ ] **Step 8: Live-fire, only after the stubbed journey is green**

Follow the spec's §Live-fire exactly: set `VALIDSIGN_STUB_MODE=false` and `VALIDSIGN_LIVE_TIERS=development`, sign one package, revert both immediately. **Expect the callback never to arrive** — ValidSign's cloud cannot reach localhost, so completion comes from the poller roughly one interval later. That is success, not a fault.

---

## Self-Review

**Spec coverage.** Section A → Task 13. Section B → Task 5. Section C → Tasks 2, 3, 4, 11. Section D → Tasks 6, 7, 8, 9, 10. Section E → Task 12. Section F → Tasks 1, 9. Testing → every task; live-fire → Task 13 step 8. Rollback needs no task: it is deleting the Task 13 attribute.

**Type consistency.** `RenderedDocument`/`RenderedZone`/`RenderedBlock`/`TextRun` are defined in Task 2 and consumed unchanged in Tasks 3, 4 and 11. `SignatureField`/`RenderedPdf` are defined in Task 4 and consumed in Tasks 6, 7. `PackageStatus` and `CreatePackageInput` are defined in Task 6 and consumed in Tasks 7, 8. `SignatureSpec`/`SignatureStatus` are defined in Task 12 step 3 and consumed in the same task's component.

**Five operaton.service additions are introduced across tasks and must keep one signature each:** `getTaskSignatureSpec` (Task 5), `findInstanceByValidsignPackage` + `setProcessVariables` (Task 8), `findInstancesAwaitingSignature` (Task 10), `getDeployedTemplate` (Task 11). Task 11 factors the deployment-resource lookup out of Task 5's method rather than duplicating it.

**Known gap, deliberate.** The exact ValidSign field-placement payload in Task 7 (`top`/`left` naming, zero-based `page`) is the one part of the API not confirmed by the read-only probe, because `approvals`/`fields` were empty on the sampled DRAFT package. Task 13 step 8 is where it is confirmed; if live-fire rejects the payload, the fix is localised to `createPackageLive`.
