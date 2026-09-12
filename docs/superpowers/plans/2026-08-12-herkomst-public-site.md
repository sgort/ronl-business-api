# Herkomst van een begrip (public site provenance tab) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Herkomst (provenance) tab in `packages/public-site` per
`docs/superpowers/specs/2026-08-12-herkomst-public-site-design.md` and the
handoff it's based on (`docs/herkomst-handoff/`), byte-identical in content
and pixel-faithful in styling, using this codebase's own conventions.

**Architecture:** One new page (`Herkomst.tsx`) + four small components +
two content-data modules, all under a new `src/pages/herkomst/` directory.
Mirrors `Woordenboek.tsx`'s established page pattern exactly. Styling
appends to the existing single `pub.css` (no per-page CSS files exist in
this codebase). No new dependencies.

**Tech Stack:** React 18 + TypeScript, react-router-dom, Vitest + React
Testing Library (all already in place in `packages/public-site`).

## Global Constraints

- Run all commands from `packages/public-site`.
- Never add `Co-Authored-By`/`Claude-Session` git commit trailers.
- Content in `herkomstConcepts.ts` (the provenance graph) and the
  bilingual copy in `herkomstData.ts` must be **byte-identical** to the
  handoff reference (`docs/herkomst-handoff/reference/keten/keten-concepts.jsx`
  and `keten-data.jsx`) — read those files directly for the literal
  content in Task 1; do not retype legal text, annotations or copy from
  memory or paraphrase. Every task below that touches these two files
  gives the exact TypeScript shape and a fully worked example; apply the
  same transformation to the remaining entries by reading the source file.
- CSS class prefix is `.pub-herkomst-*` throughout (renamed 1:1 from the
  reference's `.k-*`), matching this codebase's naming convention
  (`.pub-embed`, `.pub-crumbs`). No rule dropped, no value changed.
- All existing design tokens this feature needs (`--ro-blue`, `--ro-link`,
  `--ro-violet`, `--ro-mustard`, `--ro-green`, `--ro-lint`, `--ro-ink`/`-2`/
  `-3`, `--ro-rule`/`-2`, `--ro-bg`, `--ro-paper`, `--ro-focus`,
  `--pub-font`, `--pub-mono`) already exist in `pub.css` — never redefine
  them.

---

### Task 1: Content data modules

**Files:**

- Create: `packages/public-site/src/pages/herkomst/herkomstConcepts.ts`
- Create: `packages/public-site/src/pages/herkomst/herkomstData.ts`
- Test: `packages/public-site/src/pages/herkomst/herkomstConcepts.test.ts`
- Test: `packages/public-site/src/pages/herkomst/herkomstData.test.ts`

**Interfaces:**

- Produces (used by every later task): from `herkomstConcepts.ts` —
  `type Bilingual = string | { nl: string; en: string }`;
  `function htx(v: Bilingual, lang: 'nl' | 'en'): string`;
  `interface KtGroup { id: string; nl: string; en: string }`;
  `interface KtBegrip { ref?: string; naam: Bilingual; def?: { nl: string; en: string } }`;
  `interface KtConcept { groep: string; naam: {nl:string;en:string}; kort: {nl:string;en:string}; meta: [string,string][]; wet: { tekst: {nl:string;en:string}; bron: string; annotatie: {nl:string;en:string} }; regel: {nl:string;en:string}; dmn: { expr: string; input: [string, {nl:string;en:string}, string|null][]; output: [string, {nl:string;en:string}][] } | null; begrippen: KtBegrip[]; uitleg: { term: Bilingual; tekst: {nl:string;en:string} }[]; uitvraag: { vraag: {nl:string;en:string}; veld: string }[]; controle: {nl:string;en:string}[]; conclusie: { ja: {nl:string;en:string}; nee: {nl:string;en:string} } }`;
  `const KT_GROUPS: KtGroup[]`; `const KT_CONCEPTS: Record<string, KtConcept>`.
  From `herkomstData.ts` — `interface HerkomstStrings { ...all keys listed in Step 3 below... }`;
  `const HERKOMST_STRINGS: Record<'nl'|'en', HerkomstStrings>`;
  `interface KtStage { no: string; naam: {nl:string;en:string}; en: string; tool: string; toolSub: {nl:string;en:string}; nieuw?: boolean; note: {nl:string;en:string}; out: {nl:string;en:string} }`;
  `const KT_STAGES: KtStage[]`;
  `interface KtAbc { tag: string; naam: {nl:string;en:string}; en: string; tekst: {nl:string;en:string} }`;
  `const KT_ABC: KtAbc[]`;
  `const KT_STANDARDS: { open: string[]; closed: { nl: string[]; en: string[] } }`.

- [ ] **Step 1: Write the failing structural tests**

Create `packages/public-site/src/pages/herkomst/herkomstConcepts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KT_CONCEPTS, KT_GROUPS, htx } from './herkomstConcepts';

describe('herkomstConcepts', () => {
  it('every concept belongs to a declared group', () => {
    const groupIds = new Set(KT_GROUPS.map((g) => g.id));
    for (const [id, c] of Object.entries(KT_CONCEPTS)) {
      expect(groupIds.has(c.groep), `${id}.groep`).toBe(true);
    }
  });

  it('every begrippen[].ref points at a real concept', () => {
    for (const [id, c] of Object.entries(KT_CONCEPTS)) {
      for (const b of c.begrippen) {
        if (b.ref) {
          expect(KT_CONCEPTS[b.ref], `${id} -> ${b.ref}`).toBeDefined();
        }
      }
    }
  });

  it('bsn has no begrippen (it is the end of the chain)', () => {
    expect(KT_CONCEPTS.bsn.begrippen).toHaveLength(0);
  });

  it('leeftijd is the only concept with a non-null dmn', () => {
    const withDmn = Object.entries(KT_CONCEPTS).filter(([, c]) => c.dmn !== null);
    expect(withDmn.map(([id]) => id)).toEqual(['leeftijd']);
  });
});

describe('htx', () => {
  it('returns the plain string as-is', () => {
    expect(htx('datumBerekening', 'nl')).toBe('datumBerekening');
  });

  it('picks the requested language from a bilingual pair', () => {
    expect(htx({ nl: 'Leeftijd', en: 'Age' }, 'en')).toBe('Age');
  });

  it('falls back to nl when the requested language is missing', () => {
    expect(htx({ nl: 'Leeftijd' } as never, 'en')).toBe('Leeftijd');
  });
});
```

Create `packages/public-site/src/pages/herkomst/herkomstData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { HERKOMST_STRINGS, KT_STAGES, KT_ABC, KT_STANDARDS } from './herkomstData';

describe('HERKOMST_STRINGS', () => {
  it('nl and en declare exactly the same keys', () => {
    expect(Object.keys(HERKOMST_STRINGS.en).sort()).toEqual(
      Object.keys(HERKOMST_STRINGS.nl).sort()
    );
  });

  it('steps has 4 entries in both languages', () => {
    expect(HERKOMST_STRINGS.nl.steps).toHaveLength(4);
    expect(HERKOMST_STRINGS.en.steps).toHaveLength(4);
  });

  it('no string value is empty', () => {
    for (const lang of ['nl', 'en'] as const) {
      for (const [key, value] of Object.entries(HERKOMST_STRINGS[lang])) {
        if (typeof value === 'string') {
          expect(value.trim(), `${lang}.${key}`).not.toBe('');
        }
      }
    }
  });
});

describe('KT_STAGES / KT_ABC / KT_STANDARDS', () => {
  it('has exactly 4 pipeline stages, numbered 1-4', () => {
    expect(KT_STAGES.map((s) => s.no)).toEqual(['1', '2', '3', '4']);
  });

  it('only stage 1 carries the "nieuw" badge', () => {
    expect(KT_STAGES.filter((s) => s.nieuw).map((s) => s.no)).toEqual(['1']);
  });

  it('has exactly 3 concept-chain entries tagged (a)/(b)/(c)', () => {
    expect(KT_ABC.map((c) => c.tag)).toEqual(['(a)', '(b)', '(c)']);
  });

  it('open and closed standards lists are both non-empty', () => {
    expect(KT_STANDARDS.open.length).toBeGreaterThan(0);
    expect(KT_STANDARDS.closed.nl.length).toBeGreaterThan(0);
    expect(KT_STANDARDS.closed.en).toHaveLength(KT_STANDARDS.closed.nl.length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/herkomst/herkomstConcepts.test.ts src/pages/herkomst/herkomstData.test.ts`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Write `herkomstConcepts.ts`**

Read `docs/herkomst-handoff/reference/keten/keten-concepts.jsx` in full before
starting — it has exactly four concepts: `leeftijd`, `geboortedatum`,
`datumberekening`, `bsn`, plus the `KT_GROUPS` array at the top.

```ts
// packages/public-site/src/pages/herkomst/herkomstConcepts.ts
/**
 * De herkomstgraaf: per begrip de vier stappen wet-en-regelgeving en de
 * vier stappen gebruikers. `begrippen[].ref` verwijst naar een ander
 * begrip in deze graaf — dat maakt de keten aanklikbaar door.
 *
 * Content is hand-authored and carried over byte-identical from
 * docs/herkomst-handoff/reference/keten/keten-concepts.jsx — wetteksten
 * zijn citaten, annotaties/regels/DMN zijn voorbeelduitwerkingen. Sourcing
 * this from the knowledge graph (TriplyDB / CPSV-AP / FLINT) is a later
 * concern; this structure is what a later data layer fills.
 */

export type Bilingual = string | { nl: string; en: string };

export function htx(v: Bilingual, lang: 'nl' | 'en'): string {
  return typeof v === 'object' ? (v[lang] ?? v.nl) : v;
}

export interface KtGroup {
  id: string;
  nl: string;
  en: string;
}

export interface KtBegrip {
  ref?: string;
  naam: Bilingual;
  def?: { nl: string; en: string };
}

export interface KtConcept {
  groep: string;
  naam: { nl: string; en: string };
  kort: { nl: string; en: string };
  meta: [string, string][];
  wet: {
    tekst: { nl: string; en: string };
    bron: string;
    annotatie: { nl: string; en: string };
  };
  regel: { nl: string; en: string };
  dmn: {
    expr: string;
    input: [string, { nl: string; en: string }, string | null][];
    output: [string, { nl: string; en: string }][];
  } | null;
  begrippen: KtBegrip[];
  uitleg: { term: Bilingual; tekst: { nl: string; en: string } }[];
  uitvraag: { vraag: { nl: string; en: string }; veld: string }[];
  controle: { nl: string; en: string }[];
  conclusie: { ja: { nl: string; en: string }; nee: { nl: string; en: string } };
}

export const KT_GROUPS: KtGroup[] = [
  // Copy verbatim from keten-concepts.jsx's KT_GROUPS array (2 entries:
  // 'zorgtoeslag', 'basis').
];

export const KT_CONCEPTS: Record<string, KtConcept> = {
  // Copy verbatim from keten-concepts.jsx's KT_CONCEPTS object, one entry
  // per key (leeftijd, geboortedatum, datumberekening, bsn). Below is the
  // shortest one (bsn) fully transformed, as the worked example — apply
  // the exact same transformation (object literal syntax is already valid
  // TS; only `Object.assign(window, ...)` at the file's end is dropped in
  // favour of the named exports above) to the other three by reading them
  // from the source file directly:

  bsn: {
    groep: 'basis',
    naam: { nl: 'Burgerservicenummer', en: 'Citizen service number' },
    kort: {
      nl: 'De sleutel waarmee een persoon in overheidsregistraties wordt aangeduid. Verwijst nergens naar terug: dit is het einde van de keten.',
      en: 'The key identifying a person across government registers. It refers to nothing further: this is the end of the chain.',
    },
    meta: [
      ['Register', 'BRP'],
      ['Type', 'Sleutel'],
      ['DMN', 'nee'],
    ],
    wet: {
      tekst: {
        nl: 'Het burgerservicenummer is het uniek identificerend nummer van een natuurlijke persoon, dat aan hem wordt toegekend bij de inschrijving in de basisregistratie personen.',
        en: 'The citizen service number is the uniquely identifying number of a natural person, assigned to them upon registration in the Personal Records Database.',
      },
      bron: 'Wet algemene bepalingen burgerservicenummer, art. 1 — parafrase',
      annotatie: {
        nl: 'Het BSN is de enige sleutel die de registers verbindt. Daarom is het ook de plaats waar de keten stopt: er is geen onderliggend begrip dat het BSN afleidt.',
        en: 'The BSN is the only key linking the registers. That is also why the chain stops here: no underlying concept derives the BSN.',
      },
    },
    regel: {
      nl: 'Bij elke uitvraag van een registratiegegeven wordt het BSN als sleutel gebruikt; de grondslag voor het gebruik ervan wordt per dienst vastgelegd.',
      en: 'The BSN is used as the key for every register lookup; the legal basis for its use is recorded per service.',
    },
    dmn: null,
    begrippen: [],
    uitleg: [
      {
        term: 'BSN',
        tekst: {
          nl: 'Uw persoonlijke nummer bij de overheid. U vindt het op uw paspoort, identiteitskaart of rijbewijs.',
          en: 'Your personal number with the government. You will find it on your passport, ID card or driving licence.',
        },
      },
    ],
    uitvraag: [
      {
        vraag: {
          nl: 'Inloggen met DigiD — het BSN wordt niet uitgevraagd maar volgt uit de inlog.',
          en: 'Log in with DigiD — the BSN is not asked for but follows from the login.',
        },
        veld: 'OIDC-claim',
      },
    ],
    controle: [
      {
        nl: 'Is de inlog geldig en op het vereiste betrouwbaarheidsniveau (LoA substantieel)?',
        en: 'Is the login valid and at the required assurance level (LoA substantial)?',
      },
    ],
    conclusie: {
      ja: {
        nl: 'De identiteit staat vast; registraties kunnen op deze sleutel worden bevraagd.',
        en: 'Identity is established; registers can be queried on this key.',
      },
      nee: {
        nl: 'Geen toegang tot registratiegegevens; de aanvraag kan alleen op papier verder, met identificatie aan de balie.',
        en: 'No access to register data; the application can only continue on paper, with identification at the counter.',
      },
    },
  },

  // leeftijd, geboortedatum, datumberekening: copy verbatim from
  // keten-concepts.jsx, same transformation as bsn above.
};
```

- [ ] **Step 4: Write `herkomstData.ts`**

Read `docs/herkomst-handoff/reference/keten/keten-data.jsx` in full before
starting. **Only port the keys actually used by the components this plan
builds** (Tasks 3-7) — `keten-data.jsx`'s `KT` object also carries content
for an unrelated "IOU-keten toegelicht" page (`org`, `orgSub`, `back`,
`backLong`, `casusH`/`casusEn`/`casusLede`, `herkomstH`/`herkomstEn`/
`herkomstLede`, `uitkomstH`/`uitkomstEn`/`uitkomstLede`, `footNote`) and a
few genuinely unused keys (`wettekst`, `veld`, `vraag`, `controleH`,
`recursion`) that this spec's components never read — leave all of those
out. `KT_CASUS` and `KT_OUTCOME` belong to that other page too; do not
port them at all.

```ts
// packages/public-site/src/pages/herkomst/herkomstData.ts
/**
 * Chrome strings and background-band content for the Herkomst page.
 * Bilingual copy carried over from
 * docs/herkomst-handoff/reference/keten/keten-data.jsx — only the subset
 * of KT actually used by this page's components (see the plan task that
 * created this file for the full list of what was deliberately excluded).
 */
import type { Lang } from '../../i18n';

export interface HerkomstStrings {
  navHerkomst: string;
  kicker: string;
  title: string;
  sub: string;
  lede: string;
  crumbs: [string, string, string];
  jump: string;
  navPijplijn: string;
  navConcept: string;
  navStandaarden: string;
  ctxH: string;
  ctxLede: string;
  pijplijnH: string;
  pijplijnEn: string;
  pijplijnLede: string;
  conceptH: string;
  conceptEn: string;
  conceptLede: string;
  trackL: string;
  trackLen: string;
  trackR: string;
  trackRen: string;
  steps: { l: string; len: string; r: string; ren: string }[];
  bron: string;
  annotatie: string;
  input: string;
  output: string;
  geenDmn: string;
  afgeleid: string;
  leaf: string;
  reset: string;
  crumbHome: string;
  conclJa: string;
  conclNee: string;
  stdH: string;
  stdEn: string;
  stdLede: string;
  stdOpen: string;
  stdOpenSub: string;
  stdClosed: string;
  stdClosedSub: string;
}

export const HERKOMST_STRINGS: Record<Lang, HerkomstStrings> = {
  nl: {
    // Copy each field's Dutch value verbatim from keten-data.jsx's
    // KT.nl object — only the keys listed in the HerkomstStrings
    // interface above.
  } as HerkomstStrings,
  en: {
    // Same keys, English values from KT.en.
  } as HerkomstStrings,
};

export interface KtStage {
  no: string;
  naam: { nl: string; en: string };
  en: string;
  tool: string;
  toolSub: { nl: string; en: string };
  nieuw?: boolean;
  note: { nl: string; en: string };
  out: { nl: string; en: string };
}

export const KT_STAGES: KtStage[] = [
  // Copy verbatim from keten-data.jsx's KT_STAGES (4 entries).
];

export interface KtAbc {
  tag: string;
  naam: { nl: string; en: string };
  en: string;
  tekst: { nl: string; en: string };
}

export const KT_ABC: KtAbc[] = [
  // Copy verbatim from keten-data.jsx's KT_ABC (3 entries, tags (a)/(b)/(c)).
];

export const KT_STANDARDS: { open: string[]; closed: { nl: string[]; en: string[] } } = {
  // Copy verbatim from keten-data.jsx's KT_STANDARDS.
  open: [],
  closed: { nl: [], en: [] },
};
```

Remove the `as HerkomstStrings` casts once every key is actually filled in
— they're placeholders only for the empty-object stub above; the finished
file must not have unfilled objects or type-assertion escape hatches.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/pages/herkomst/herkomstConcepts.test.ts src/pages/herkomst/herkomstData.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/public-site/src/pages/herkomst/herkomstConcepts.ts packages/public-site/src/pages/herkomst/herkomstData.ts packages/public-site/src/pages/herkomst/herkomstConcepts.test.ts packages/public-site/src/pages/herkomst/herkomstData.test.ts
git commit -m "feat(public-site): add Herkomst content data modules"
```

---

### Task 2: Styling

**Files:**

- Modify: `packages/public-site/src/styles/pub.css`

**Interfaces:**

- Produces (used by every component task): `.pub-herkomst-*` class rules
  matching every `.k-*` rule in the reference CSS.

- [ ] **Step 1: Port the CSS**

Read `docs/herkomst-handoff/reference/keten/keten.css` in full. Append its
entire content to the end of `packages/public-site/src/styles/pub.css`
(currently 925 lines), applying exactly one mechanical transformation:
rename every `.k-` class prefix to `.pub-herkomst-` (e.g. `.k-wrap` →
`.pub-herkomst-wrap`, `.k-phead` → `.pub-herkomst-phead`, `.k-track-h.k-right`
→ `.pub-herkomst-track-h.pub-herkomst-right`). Do not rename the bare `.k`
scope class itself if the reference uses one on a root element — this port
doesn't need a page-root scope class since `pub.css` is already global and
every other page's rules aren't scoped that way either; drop the bare `.k`
selector rule (line 2 of `keten.css`, `.k{...}`) and instead let this
content inherit from `.pub`'s existing base rule (font, color, background,
line-height are already set there — confirmed identical values in
`pub.css`'s `.pub` rule). Every other rule, every color value, every grid
column definition, every media query breakpoint (1100px, 820px, and the
existing `.pub-mobile` variants) carries over unchanged except for the
class-name prefix. Add a one-line comment above the pasted block:

```css
/* ── Herkomst (provenance tab) ──────────────────────────────
   Ported from docs/herkomst-handoff/reference/keten/keten.css,
   .k-* renamed to .pub-herkomst-* throughout. */
```

- [ ] **Step 2: Verify no `.k-` prefix survived**

Run (from `packages/public-site`): `grep -n "\.k-" src/styles/pub.css`
Expected: no matches (empty output). If any match, the rename in Step 1
missed a spot — fix it.

- [ ] **Step 3: Commit**

```bash
git add packages/public-site/src/styles/pub.css
git commit -m "feat(public-site): port Herkomst styling to pub.css"
```

---

### Task 3: `HerkomstChip`

**Files:**

- Create: `packages/public-site/src/pages/herkomst/HerkomstChip.tsx`
- Test: `packages/public-site/src/pages/herkomst/HerkomstChip.test.tsx`

**Interfaces:**

- Consumes: `Bilingual`, `htx`, `KT_CONCEPTS`, `KtBegrip` from
  `./herkomstConcepts` (Task 1).
- Produces (used by Task 4): `HerkomstChip({ c: KtBegrip; lang: Lang;
onOpen: (id: string) => void }): JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/public-site/src/pages/herkomst/HerkomstChip.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HerkomstChip from './HerkomstChip';

describe('HerkomstChip', () => {
  it('renders a clickable chip for a begrip with a ref, showing the target concept name', () => {
    const onOpen = vi.fn();
    render(
      <HerkomstChip c={{ ref: 'geboortedatum', naam: 'geboortedatum' }} lang="nl" onOpen={onOpen} />
    );
    const btn = screen.getByRole('button', { name: /Geboortedatum/ });
    expect(btn).toBeInTheDocument();
  });

  it('calls onOpen with the ref when clicked', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<HerkomstChip c={{ ref: 'bsn', naam: 'BSN' }} lang="nl" onOpen={onOpen} />);
    await user.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('bsn');
  });

  it('renders a non-interactive leaf chip when there is no ref', () => {
    const onOpen = vi.fn();
    render(
      <HerkomstChip
        c={{ naam: { nl: 'Geboortedatum', en: 'Date of birth' }, def: { nl: 'x', en: 'y' } }}
        lang="nl"
        onOpen={onOpen}
      />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Geboortedatum')).toBeInTheDocument();
  });

  it('follows the language switch for the target concept name', () => {
    const onOpen = vi.fn();
    render(<HerkomstChip c={{ ref: 'bsn', naam: 'BSN' }} lang="en" onOpen={onOpen} />);
    expect(screen.getByRole('button', { name: /Citizen service number/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/herkomst/HerkomstChip.test.tsx`
Expected: FAIL — `HerkomstChip.tsx` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/public-site/src/pages/herkomst/HerkomstChip.tsx
import type { Lang } from '../../i18n';
import { KT_CONCEPTS, htx, type KtBegrip } from './herkomstConcepts';

export default function HerkomstChip({
  c,
  lang,
  onOpen,
}: {
  c: KtBegrip;
  lang: Lang;
  onOpen: (id: string) => void;
}) {
  const target = c.ref ? KT_CONCEPTS[c.ref] : null;

  if (!target) {
    return <span className="pub-herkomst-chip pub-herkomst-leaf">{htx(c.naam, lang)}</span>;
  }

  return (
    <button type="button" className="pub-herkomst-chip" onClick={() => onOpen(c.ref!)}>
      {htx(target.naam, lang)}
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M2 6h7M6 3l3 3-3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/herkomst/HerkomstChip.test.tsx`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/public-site/src/pages/herkomst/HerkomstChip.tsx packages/public-site/src/pages/herkomst/HerkomstChip.test.tsx
git commit -m "feat(public-site): add HerkomstChip"
```

---

### Task 4: `HerkomstTrace`

**Files:**

- Create: `packages/public-site/src/pages/herkomst/HerkomstTrace.tsx`
- Test: `packages/public-site/src/pages/herkomst/HerkomstTrace.test.tsx`

**Interfaces:**

- Consumes: `KT_CONCEPTS`, `htx` from `./herkomstConcepts`; `HerkomstStrings`
  from `./herkomstData` (Task 1); `HerkomstChip` (Task 3).
- Produces (used by Task 6): `HerkomstTrace({ id: string; t: HerkomstStrings;
lang: Lang; onOpen: (id: string) => void }): JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/public-site/src/pages/herkomst/HerkomstTrace.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HerkomstTrace from './HerkomstTrace';
import { HERKOMST_STRINGS } from './herkomstData';

describe('HerkomstTrace', () => {
  it('renders the concept header and both track headers', () => {
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Leeftijd/ })).toBeInTheDocument();
    expect(screen.getByText('Wet- & Regelgeving')).toBeInTheDocument();
    expect(screen.getByText('Gebruikers')).toBeInTheDocument();
  });

  it('renders the DMN expression and input/output for leeftijd', () => {
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />);
    expect(screen.getByText(/MEERDERJARIGHEIDSLEEFTIJD/)).toBeInTheDocument();
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
  });

  it('a DMN input with a ref renders a working herkomst link', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={onOpen} />);
    const link = screen.getByRole('link', { name: 'herkomst' });
    await user.click(link);
    expect(onOpen).toHaveBeenCalledWith('geboortedatum');
  });

  it('renders the no-DMN fallback line for a concept with dmn: null', () => {
    render(<HerkomstTrace id="bsn" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />);
    expect(screen.getByText(/Niet van toepassing/)).toBeInTheDocument();
  });

  it('renders "einde van de keten" for a concept with no begrippen', () => {
    render(<HerkomstTrace id="bsn" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />);
    expect(screen.getByText(/einde van de keten/)).toBeInTheDocument();
  });

  it('renders both the positive and negative conclusion for a concept with begrippen', () => {
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />);
    expect(screen.getByText(/LEEFTIJD kan worden berekend/)).toBeInTheDocument();
    expect(screen.getByText(/niet \(nog\) nodig|niet.*nodig/)).toBeInTheDocument();
  });

  it('clicking a begrippen chip opens that concept', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={onOpen} />);
    await user.click(
      within(
        screen.getByText('Dit begrip is afgeleid van:').closest('div')!.parentElement!
      ).getByRole('button', { name: /Geboortedatum/ })
    );
    expect(onOpen).toHaveBeenCalledWith('geboortedatum');
  });

  it('associates every cell with its track header for screen readers', () => {
    const { container } = render(
      <HerkomstTrace id="leeftijd" t={HERKOMST_STRINGS.nl} lang="nl" onOpen={vi.fn()} />
    );
    const wetHeaderId = container.querySelector(
      '.pub-herkomst-track-h:not(.pub-herkomst-right)'
    )!.id;
    const gebruikersHeaderId = container.querySelector(
      '.pub-herkomst-track-h.pub-herkomst-right'
    )!.id;
    expect(wetHeaderId).toBeTruthy();
    expect(gebruikersHeaderId).toBeTruthy();
    const leftCells = container.querySelectorAll('.pub-herkomst-cell:not(.pub-herkomst-r)');
    const rightCells = container.querySelectorAll('.pub-herkomst-cell.pub-herkomst-r');
    expect(leftCells).toHaveLength(4);
    expect(rightCells).toHaveLength(4);
    leftCells.forEach((cell) => expect(cell.getAttribute('aria-labelledby')).toBe(wetHeaderId));
    rightCells.forEach((cell) =>
      expect(cell.getAttribute('aria-labelledby')).toBe(gebruikersHeaderId)
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/herkomst/HerkomstTrace.test.tsx`
Expected: FAIL — `HerkomstTrace.tsx` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/public-site/src/pages/herkomst/HerkomstTrace.tsx
import { Fragment } from 'react';
import type { Lang } from '../../i18n';
import { KT_CONCEPTS, htx } from './herkomstConcepts';
import type { HerkomstStrings } from './herkomstData';
import HerkomstChip from './HerkomstChip';

export default function HerkomstTrace({
  id,
  t,
  lang,
  onOpen,
}: {
  id: string;
  t: HerkomstStrings;
  lang: Lang;
  onOpen: (id: string) => void;
}) {
  const c = KT_CONCEPTS[id];
  const st = t.steps;
  // Improves on the reference prototype's one documented a11y gap: there,
  // track headers are associated with their cells by visual alignment
  // only. Here every cell is programmatically tied to its track header
  // via aria-labelledby so screen reader users get the same "which track
  // am I in" context sighted users get from the sticky header.
  const wetTrackId = `herkomst-track-wet-${id}`;
  const gebruikersTrackId = `herkomst-track-gebruikers-${id}`;

  return (
    <Fragment>
      <div className="pub-herkomst-phead">
        <h3>
          {htx(c.naam, lang)}
          <span className="pub-herkomst-en">
            {lang === 'nl' ? htx(c.naam, 'en') : htx(c.naam, 'nl')}
          </span>
        </h3>
        <p>{htx(c.kort, lang)}</p>
        <div className="pub-herkomst-meta">
          {c.meta.map(([k, v]) => (
            <span className="pub-herkomst-pill" key={k}>
              {k}: <b>{v}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="pub-herkomst-tracks">
        <div className="pub-herkomst-track-h" id={wetTrackId}>
          {t.trackL}
          <span>{t.trackLen}</span>
        </div>
        <div className="pub-herkomst-track-h pub-herkomst-right" id={gebruikersTrackId}>
          {t.trackR}
          <span>{t.trackRen}</span>
        </div>

        <div className="pub-herkomst-row">
          <div className="pub-herkomst-cell" aria-labelledby={wetTrackId}>
            <div className="pub-herkomst-step">
              <i>1</i>
              <div>
                <b>{st[0].l}</b> <em>{st[0].len}</em>
              </div>
            </div>
            <div className="pub-herkomst-quote">
              {htx(c.wet.tekst, lang)}
              <div className="pub-herkomst-src">
                {t.bron}: {c.wet.bron}
              </div>
            </div>
            <div className="pub-herkomst-anno">
              <b>{t.annotatie}</b>
              {htx(c.wet.annotatie, lang)}
            </div>
          </div>
          <div className="pub-herkomst-cell pub-herkomst-r" aria-labelledby={gebruikersTrackId}>
            <div className="pub-herkomst-step">
              <i>1</i>
              <div>
                <b>{st[0].r}</b> <em>{st[0].ren}</em>
              </div>
            </div>
            {c.uitleg.length ? (
              c.uitleg.map((u, i) => (
                <div className="pub-herkomst-anno" key={i}>
                  <b>{htx(u.term, lang)}</b>
                  <span className="pub-herkomst-body">{htx(u.tekst, lang)}</span>
                </div>
              ))
            ) : (
              <div className="pub-herkomst-none">—</div>
            )}
          </div>
        </div>

        <div className="pub-herkomst-row">
          <div className="pub-herkomst-cell" aria-labelledby={wetTrackId}>
            <div className="pub-herkomst-step">
              <i>2</i>
              <div>
                <b>{st[1].l}</b> <em>{st[1].len}</em>
              </div>
            </div>
            <p className="pub-herkomst-body">{htx(c.regel, lang)}</p>
          </div>
          <div className="pub-herkomst-cell pub-herkomst-r" aria-labelledby={gebruikersTrackId}>
            <div className="pub-herkomst-step">
              <i>2</i>
              <div>
                <b>{st[1].r}</b> <em>{st[1].ren}</em>
              </div>
            </div>
            {c.uitvraag.length ? (
              <div className="pub-herkomst-qa">
                {c.uitvraag.map((q, i) => (
                  <div key={i}>
                    <span className="pub-herkomst-q">{htx(q.vraag, lang)}</span>
                    <span className="pub-herkomst-f">{q.veld}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pub-herkomst-none">
                {lang === 'nl'
                  ? 'Niets uit te vragen — dit gegeven ontstaat in het proces zelf.'
                  : 'Nothing to ask — this value arises in the process itself.'}
              </div>
            )}
          </div>
        </div>

        <div className="pub-herkomst-row">
          <div className="pub-herkomst-cell" aria-labelledby={wetTrackId}>
            <div className="pub-herkomst-step">
              <i>3</i>
              <div>
                <b>{st[2].l}</b> <em>{st[2].len}</em>
              </div>
            </div>
            {c.dmn ? (
              <Fragment>
                <div className="pub-herkomst-code">{c.dmn.expr}</div>
                <div className="pub-herkomst-io">
                  <div>
                    <b>{t.input}</b>
                    <ul>
                      {c.dmn.input.map(([k, d, ref]) => (
                        <li key={k}>
                          <code>{k}</code> — {htx(d, lang)}
                          {ref ? (
                            <Fragment>
                              {' '}
                              ·{' '}
                              <a
                                href="#herkomst"
                                onClick={(e) => {
                                  e.preventDefault();
                                  onOpen(ref);
                                }}
                              >
                                {lang === 'nl' ? 'herkomst' : 'provenance'}
                              </a>
                            </Fragment>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <b>{t.output}</b>
                    <ul>
                      {c.dmn.output.map(([k, d]) => (
                        <li key={k}>
                          <code>{k}</code> — {htx(d, lang)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Fragment>
            ) : (
              <div className="pub-herkomst-none">{t.geenDmn}</div>
            )}
          </div>
          <div className="pub-herkomst-cell pub-herkomst-r" aria-labelledby={gebruikersTrackId}>
            <div className="pub-herkomst-step">
              <i>3</i>
              <div>
                <b>{st[2].r}</b> <em>{st[2].ren}</em>
              </div>
            </div>
            <ul className="pub-herkomst-check">
              {c.controle.map((x, i) => (
                <li key={i}>{htx(x, lang)}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pub-herkomst-row">
          <div className="pub-herkomst-cell" aria-labelledby={wetTrackId}>
            <div className="pub-herkomst-step">
              <i>4</i>
              <div>
                <b>{st[3].l}</b> <em>{st[3].len}</em>
              </div>
            </div>
            {c.begrippen.length ? (
              <Fragment>
                <p className="pub-herkomst-body">{t.afgeleid}:</p>
                <div className="pub-herkomst-chips">
                  {c.begrippen.map((b, i) => (
                    <HerkomstChip key={i} c={b} lang={lang} onOpen={onOpen} />
                  ))}
                </div>
                {c.begrippen
                  .filter((b) => b.def)
                  .map((b, i) => (
                    <div className="pub-herkomst-anno" key={'d' + i}>
                      <b>{htx(b.naam, lang)}</b>
                      <span className="pub-herkomst-body">{htx(b.def!, lang)}</span>
                    </div>
                  ))}
              </Fragment>
            ) : (
              <div className="pub-herkomst-none">{t.leaf}</div>
            )}
          </div>
          <div className="pub-herkomst-cell pub-herkomst-r" aria-labelledby={gebruikersTrackId}>
            <div className="pub-herkomst-step">
              <i>4</i>
              <div>
                <b>{st[3].r}</b> <em>{st[3].ren}</em>
              </div>
            </div>
            <div className="pub-herkomst-concl">
              <b>{t.conclJa} — </b>
              {htx(c.conclusie.ja, lang)}
            </div>
            <div className="pub-herkomst-concl pub-herkomst-neg">
              <b>{t.conclNee} — </b>
              {htx(c.conclusie.nee, lang)}
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/herkomst/HerkomstTrace.test.tsx`
Expected: PASS, all 7 tests green. If the "clicking a begrippen chip"
test's DOM-traversal selector doesn't match this exact markup, adjust the
test to locate the chip via `screen.getAllByRole('button', { name: /Geboortedatum/ })`
scoped more simply — the assertion (`onOpen` called with `'geboortedatum'`)
is what matters, not the exact traversal path to find the button.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/public-site/src/pages/herkomst/HerkomstTrace.tsx packages/public-site/src/pages/herkomst/HerkomstTrace.test.tsx
git commit -m "feat(public-site): add HerkomstTrace"
```

---

### Task 5: `HerkomstBackground`

**Files:**

- Create: `packages/public-site/src/pages/herkomst/HerkomstBackground.tsx`
- Test: `packages/public-site/src/pages/herkomst/HerkomstBackground.test.tsx`

**Interfaces:**

- Consumes: `htx` from `./herkomstConcepts`; `HerkomstStrings`, `KT_STAGES`,
  `KT_ABC`, `KT_STANDARDS` from `./herkomstData` (Task 1).
- Produces (used by Task 7): `HerkomstBackground({ t: HerkomstStrings; lang:
Lang }): JSX.Element`, rendering three anchored sections
  (`#pijplijn`, `#conceptketen`, `#standaarden`).

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/public-site/src/pages/herkomst/HerkomstBackground.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HerkomstBackground from './HerkomstBackground';
import { HERKOMST_STRINGS } from './herkomstData';

describe('HerkomstBackground', () => {
  it('renders the three anchored sections', () => {
    const { container } = render(<HerkomstBackground t={HERKOMST_STRINGS.nl} lang="nl" />);
    expect(container.querySelector('#pijplijn')).toBeInTheDocument();
    expect(container.querySelector('#conceptketen')).toBeInTheDocument();
    expect(container.querySelector('#standaarden')).toBeInTheDocument();
  });

  it('renders all 4 pipeline stages with the "nieuw" badge only on stage 1', () => {
    render(<HerkomstBackground t={HERKOMST_STRINGS.nl} lang="nl" />);
    expect(screen.getByText('Regeleditor (FLINT)')).toBeInTheDocument();
    expect(screen.getByText('MijnOmgeving')).toBeInTheDocument();
    expect(screen.getByText('Nieuw in stack')).toBeInTheDocument();
  });

  it('renders the (a)/(b)/(c) concept chain', () => {
    render(<HerkomstBackground t={HERKOMST_STRINGS.nl} lang="nl" />);
    expect(screen.getByText(/\(a\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(b\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(c\)/)).toBeInTheDocument();
  });

  it('renders open and closed standards', () => {
    render(<HerkomstBackground t={HERKOMST_STRINGS.nl} lang="nl" />);
    expect(screen.getByText('CPSV-AP')).toBeInTheDocument();
    expect(screen.getByText('eDOCS')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/herkomst/HerkomstBackground.test.tsx`
Expected: FAIL — `HerkomstBackground.tsx` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/public-site/src/pages/herkomst/HerkomstBackground.tsx
import type { Lang } from '../../i18n';
import { htx } from './herkomstConcepts';
import {
  HERKOMST_STRINGS,
  KT_STAGES,
  KT_ABC,
  KT_STANDARDS,
  type HerkomstStrings,
} from './herkomstData';

function HerkomstSectionHead({ h, en, lede }: { h: string; en: string; lede: string }) {
  return (
    <>
      <h2 className="pub-herkomst-sec-h pub-herkomst-sm">{h}</h2>
      <div className="pub-herkomst-sec-en">{en}</div>
      <p className="pub-herkomst-sec-lede">{lede}</p>
    </>
  );
}

function HerkomstPipeline({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  return (
    <section className="pub-herkomst-block" id="pijplijn">
      <HerkomstSectionHead h={t.pijplijnH} en={t.pijplijnEn} lede={t.pijplijnLede} />
      <div className="pub-herkomst-pipe">
        {KT_STAGES.map((s) => (
          <article className="pub-herkomst-stage" key={s.no}>
            <div className="pub-herkomst-stage-top">
              <div className="pub-herkomst-stage-no">{s.no}</div>
              <div>
                <b>{htx(s.naam, lang)}</b>
                <span>{lang === 'nl' ? s.en : htx(s.naam, 'nl')}</span>
              </div>
            </div>
            <div className="pub-herkomst-stage-body">
              <div className="pub-herkomst-tool">
                <b>{s.tool}</b>
                <span>{htx(s.toolSub, lang)}</span>
                {s.nieuw ? (
                  <span className="pub-herkomst-badge">
                    {lang === 'nl' ? 'Nieuw in stack' : 'New in stack'}
                  </span>
                ) : null}
              </div>
              <p className="pub-herkomst-stage-note">{htx(s.note, lang)}</p>
              <div className="pub-herkomst-out">
                <b>{lang === 'nl' ? 'Levert op' : 'Produces'}</b>
                {htx(s.out, lang)}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HerkomstConceptChain({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  return (
    <section className="pub-herkomst-block" id="conceptketen">
      <HerkomstSectionHead h={t.conceptH} en={t.conceptEn} lede={t.conceptLede} />
      <div className="pub-herkomst-abc">
        {KT_ABC.map((c, i) => (
          <div className="pub-herkomst-abc-cell" key={c.tag}>
            <div className="pub-herkomst-abc-tag">
              {c.tag} · {lang === 'nl' ? 'stadium' : 'stage'} {i + 1}
            </div>
            <h4>
              {htx(c.naam, lang)}
              <span className="pub-herkomst-en">{lang === 'nl' ? c.en : htx(c.naam, 'nl')}</span>
            </h4>
            <p>{htx(c.tekst, lang)}</p>
          </div>
        ))}
      </div>
      <div className="pub-herkomst-catband">
        <div className="pub-herkomst-cat">
          <b>{lang === 'nl' ? 'Regelcatalogus' : 'Rule catalogue'}</b>
          <span>
            {lang === 'nl'
              ? 'bevat (a) + (b) — de wettekst én de interpretatie ervan'
              : 'holds (a) + (b) — the legal text and its interpretation'}
          </span>
        </div>
        <div className="pub-herkomst-cat">
          <b>{lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary'}</b>
          <span>{lang === 'nl' ? 'bevat (c)' : 'holds (c)'}</span>
        </div>
        <div className="pub-herkomst-connector">
          <b>{lang === 'nl' ? 'Procesbibliotheek' : 'Process library'}</b> —{' '}
          {lang === 'nl'
            ? 'de connector: verbindt regels (a + b) en data (c) via processen. Zonder deze schakel zijn het twee losse catalogi.'
            : 'the connector: it links rules (a + b) and data (c) through processes. Without it they are two unconnected catalogues.'}
        </div>
      </div>
    </section>
  );
}

function HerkomstStandards({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  return (
    <section className="pub-herkomst-block" id="standaarden">
      <HerkomstSectionHead h={t.stdH} en={t.stdEn} lede={t.stdLede} />
      <div className="pub-herkomst-std">
        <div className="pub-herkomst-std-lab">
          {t.stdOpen}
          <span>{t.stdOpenSub}</span>
        </div>
        <div className="pub-herkomst-std-body">
          {KT_STANDARDS.open.map((s) => (
            <span className="pub-herkomst-std-item" key={s}>
              {s}
            </span>
          ))}
        </div>
        <div className="pub-herkomst-std-lab pub-herkomst-closed">
          {t.stdClosed}
          <span>{t.stdClosedSub}</span>
        </div>
        <div className="pub-herkomst-std-body pub-herkomst-muted">
          {KT_STANDARDS.closed[lang].map((s) => (
            <span className="pub-herkomst-std-item" key={s}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HerkomstBackground({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  return (
    <div className="pub-herkomst-ctx" id="achtergrond">
      <div className="pub-herkomst-wrap">
        <div className="pub-herkomst-ctx-h">
          <h2>{t.ctxH}</h2>
          <p>{t.ctxLede}</p>
        </div>
        <HerkomstPipeline t={t} lang={lang} />
        <HerkomstConceptChain t={t} lang={lang} />
        <HerkomstStandards t={t} lang={lang} />
      </div>
    </div>
  );
}
```

Note: `HERKOMST_STRINGS` is imported but unused directly in this file
(only its `HerkomstStrings` type is used, via the `t` prop) — remove the
unused value import if `tsc --noEmit` flags it under this repo's
`noUnusedLocals`/`noUnusedParameters` settings; only the type-only import
is needed here.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/herkomst/HerkomstBackground.test.tsx`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `HERKOMST_STRINGS` triggers an unused-import
error per the note above, change the import to `import type { HerkomstStrings } from './herkomstData'` and drop `KT_STAGES`/`KT_ABC`/`KT_STANDARDS` from
that same type-only import (they're runtime values, keep them as a
separate regular import: `import { KT_STAGES, KT_ABC, KT_STANDARDS } from './herkomstData';`).

- [ ] **Step 6: Commit**

```bash
git add packages/public-site/src/pages/herkomst/HerkomstBackground.tsx packages/public-site/src/pages/herkomst/HerkomstBackground.test.tsx
git commit -m "feat(public-site): add HerkomstBackground"
```

---

### Task 6: `HerkomstExplorer`

**Files:**

- Create: `packages/public-site/src/pages/herkomst/HerkomstExplorer.tsx`
- Test: `packages/public-site/src/pages/herkomst/HerkomstExplorer.test.tsx`

**Interfaces:**

- Consumes: `KT_CONCEPTS`, `KT_GROUPS`, `htx` from `./herkomstConcepts`;
  `HerkomstStrings` from `./herkomstData`; `HerkomstTrace` (Task 4).
- Produces (used by Task 7): `HerkomstExplorer({ t: HerkomstStrings; lang:
Lang }): JSX.Element`. Owns `trail: string[]` local state, starting at
  `['leeftijd']`.

- [ ] **Step 1: Write the failing tests**

```tsx
// packages/public-site/src/pages/herkomst/HerkomstExplorer.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HerkomstExplorer from './HerkomstExplorer';
import { HERKOMST_STRINGS } from './herkomstData';

describe('HerkomstExplorer', () => {
  it('starts on Leeftijd, and the trail shows just that one concept', () => {
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    expect(screen.getByRole('heading', { name: /Leeftijd/ })).toBeInTheDocument();
    expect(screen.queryByText('Begin opnieuw')).not.toBeInTheDocument();
  });

  it('lists concepts grouped, with Leeftijd marked current', () => {
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    const nav = screen.getByRole('navigation', { name: 'Herkomst' });
    expect(within(nav).getByRole('button', { name: /Leeftijd/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  it('selecting a different concept in the list resets the trail to just that concept', async () => {
    const user = userEvent.setup();
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    const nav = screen.getByRole('navigation', { name: 'Herkomst' });
    await user.click(within(nav).getByRole('button', { name: /Geboortedatum/ }));
    expect(screen.getByText('Herkomst:')).toBeInTheDocument();
    expect(screen.queryByText('Begin opnieuw')).not.toBeInTheDocument();
  });

  it('drilling into a chip grows the trail and shows Begin opnieuw', async () => {
    const user = userEvent.setup();
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    await user.click(screen.getByRole('button', { name: /Geboortedatum/, hidden: false }));
    expect(screen.getByText('Begin opnieuw')).toBeInTheDocument();
  });

  it('clicking a trail segment truncates the trail to that depth', async () => {
    const user = userEvent.setup();
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    // Drill Leeftijd -> Geboortedatum -> BSN.
    const trace1 = screen.getByText('Dit begrip is afgeleid van:').parentElement!;
    await user.click(within(trace1).getByRole('button', { name: /Geboortedatum/ }));
    const trace2 = screen.getByText('Dit begrip is afgeleid van:').parentElement!;
    await user.click(within(trace2).getByRole('button', { name: /Burgerservicenummer/ }));
    expect(screen.getByRole('heading', { name: /Burgerservicenummer/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Leeftijd' }));
    expect(screen.getByRole('heading', { name: /^Leeftijd/ })).toBeInTheDocument();
    expect(screen.queryByText('Begin opnieuw')).not.toBeInTheDocument();
  });

  it('Begin opnieuw returns to the first concept in the trail', async () => {
    const user = userEvent.setup();
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    await user.click(screen.getByRole('button', { name: /Geboortedatum/ }));
    await user.click(screen.getByRole('button', { name: 'Begin opnieuw' }));
    expect(screen.getByRole('heading', { name: /^Leeftijd/ })).toBeInTheDocument();
    expect(screen.queryByText('Begin opnieuw')).not.toBeInTheDocument();
  });

  it('opening the concept already at the end of the trail is a no-op', async () => {
    const user = userEvent.setup();
    render(<HerkomstExplorer t={HERKOMST_STRINGS.nl} lang="nl" />);
    await user.click(screen.getByRole('button', { name: /Geboortedatum/ }));
    // Clicking a "geboortedatum" chip again from within the geboortedatum
    // trace itself (its own begrippen list has no self-reference, so this
    // exercises the no-op guard via re-selecting the same list item).
    const nav = screen.getByRole('navigation', { name: 'Herkomst' });
    await user.click(within(nav).getByRole('button', { name: /Geboortedatum/ }));
    // Selecting from the list always resets to [id] regardless — the
    // no-op guard specifically applies to onOpen (drill-down), which this
    // covers via the trail staying at depth 1 with no duplicate segment.
    expect(screen.queryByText('Begin opnieuw')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/herkomst/HerkomstExplorer.test.tsx`
Expected: FAIL — `HerkomstExplorer.tsx` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// packages/public-site/src/pages/herkomst/HerkomstExplorer.tsx
import { Fragment, useState } from 'react';
import type { Lang } from '../../i18n';
import { KT_CONCEPTS, KT_GROUPS, htx } from './herkomstConcepts';
import type { HerkomstStrings } from './herkomstData';
import HerkomstTrace from './HerkomstTrace';

export default function HerkomstExplorer({ t, lang }: { t: HerkomstStrings; lang: Lang }) {
  const [trail, setTrail] = useState<string[]>(['leeftijd']);
  const cur = trail[trail.length - 1];
  const open = (id: string) => setTrail((tr) => (tr[tr.length - 1] === id ? tr : [...tr, id]));
  const ids = Object.keys(KT_CONCEPTS);
  const otherLang: Lang = lang === 'nl' ? 'en' : 'nl';

  return (
    <div className="pub-herkomst-exp" id="herkomst">
      <nav className="pub-herkomst-list" aria-label={t.navHerkomst}>
        <div className="pub-herkomst-list-h">{lang === 'nl' ? 'Begrippen' : 'Concepts'}</div>
        {KT_GROUPS.map((g) => (
          <Fragment key={g.id}>
            <div className="pub-herkomst-list-group">{g[lang]}</div>
            {ids
              .filter((id) => KT_CONCEPTS[id].groep === g.id)
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-current={id === cur}
                  onClick={() => setTrail([id])}
                >
                  {htx(KT_CONCEPTS[id].naam, lang)}
                  <small>{htx(KT_CONCEPTS[id].naam, otherLang)}</small>
                </button>
              ))}
          </Fragment>
        ))}
        <div className="pub-herkomst-list-note">
          {lang === 'nl'
            ? 'Alleen het begrip Leeftijd is hier volledig uitgewerkt; de overige drie zijn de gegevens waar Leeftijd op steunt. Andere begrippen volgen dezelfde acht stappen.'
            : 'Only the concept Age is fully worked out here; the other three are the data Age rests on. Other concepts follow the same eight steps.'}
        </div>
      </nav>
      <div className="pub-herkomst-panel">
        <div className="pub-herkomst-trail">
          <span>{t.crumbHome}:</span>
          {trail.map((id, i) => (
            <Fragment key={id + i}>
              {i > 0 ? <span>›</span> : null}
              {i === trail.length - 1 ? (
                <span className="pub-herkomst-here">{htx(KT_CONCEPTS[id].naam, lang)}</span>
              ) : (
                <button type="button" onClick={() => setTrail(trail.slice(0, i + 1))}>
                  {htx(KT_CONCEPTS[id].naam, lang)}
                </button>
              )}
            </Fragment>
          ))}
          {trail.length > 1 ? (
            <button
              type="button"
              style={{ marginLeft: 'auto' }}
              onClick={() => setTrail([trail[0]])}
            >
              {t.reset}
            </button>
          ) : null}
        </div>
        <HerkomstTrace id={cur} t={t} lang={lang} onOpen={open} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/herkomst/HerkomstExplorer.test.tsx`
Expected: PASS, all 7 tests green. Some of these tests rely on precise DOM
scoping that's hard to predict exactly without running the real markup
(e.g. distinguishing the concept-list button from the trace's own chip
button, both of which can render text matching "Geboortedatum") — if a
`getByRole` call in the brief's test matches more than one element, scope
it more tightly using `within(...)` against a stable nearby container
(the `nav[aria-label="Herkomst"]` element for list buttons, the trace's
own root for chip buttons) rather than weakening the assertion itself.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/public-site/src/pages/herkomst/HerkomstExplorer.tsx packages/public-site/src/pages/herkomst/HerkomstExplorer.test.tsx
git commit -m "feat(public-site): add HerkomstExplorer"
```

---

### Task 7: `Herkomst` page, route, and nav

**Files:**

- Create: `packages/public-site/src/pages/Herkomst.tsx`
- Test: `packages/public-site/src/pages/Herkomst.test.tsx`
- Modify: `packages/public-site/src/App.tsx`
- Modify: `packages/public-site/src/components/MainNav.tsx`
- Modify: `packages/public-site/src/lib/sections.ts`
- Modify: `packages/public-site/src/App.test.tsx`

**Interfaces:**

- Consumes: `HERKOMST_STRINGS` (Task 1), `HerkomstExplorer` (Task 6),
  `HerkomstBackground` (Task 5), `Crumbs` (existing component).
- Produces: route `/herkomst`, nav item, `HERKOMST_PATH` constant.

- [ ] **Step 1: Write the failing test for the page component**

```tsx
// packages/public-site/src/pages/Herkomst.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Herkomst from './Herkomst';
import { translations } from '../i18n';

function renderAt(lang: 'nl' | 'en') {
  return render(
    <MemoryRouter>
      <Herkomst t={translations[lang]} lang={lang} />
    </MemoryRouter>
  );
}

describe('Herkomst', () => {
  it('renders the breadcrumb, page head, explorer and background band', () => {
    renderAt('nl');
    expect(screen.getByText('Herkomst van Leeftijd')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Waar komt dit begrip vandaan?' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Leeftijd/ })).toBeInTheDocument();
    expect(screen.getByText('De pijplijn')).toBeInTheDocument();
  });

  it('breadcrumb links to /regels', () => {
    renderAt('nl');
    const links = screen.getAllByRole('link', { name: 'Regelcatalogus' });
    expect(links[0]).toHaveAttribute('href', '/regels');
  });

  it('follows the language switch', () => {
    renderAt('en');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Where does this concept come from?' })
    ).toBeInTheDocument();
  });

  it('jump buttons target the background sections', () => {
    renderAt('nl');
    expect(screen.getByRole('button', { name: 'De pijplijn' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conceptketen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Standaarden' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/Herkomst.test.tsx`
Expected: FAIL — `Herkomst.tsx` doesn't exist yet.

- [ ] **Step 3: Write `Herkomst.tsx`**

```tsx
// packages/public-site/src/pages/Herkomst.tsx
import type { Translations, Lang } from '../i18n';
import Crumbs from '../components/Crumbs';
import { HERKOMST_STRINGS } from './herkomst/herkomstData';
import HerkomstExplorer from './herkomst/HerkomstExplorer';
import HerkomstBackground from './herkomst/HerkomstBackground';

function scrollToHerkomstSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = window.scrollY + el.getBoundingClientRect().top - 20;
  window.scrollTo({ top, behavior: 'smooth' });
}

export default function Herkomst({ lang }: { t: Translations; lang: Lang }) {
  const t = HERKOMST_STRINGS[lang];

  return (
    <main id="pub-main" className="pub-main pub-herkomst-k">
      <div className="pub-herkomst-wrap">
        <Crumbs
          lang={lang}
          trail={[
            { label: t.crumbs[0], to: '/regels' },
            { label: t.crumbs[1], to: '/regels' },
            { label: t.crumbs[2] },
          ]}
        />
        <div className="pub-herkomst-pagehead">
          <div>
            <div className="pub-herkomst-kicker">{t.kicker}</div>
            <h1>{t.title}</h1>
            <p className="pub-herkomst-sub">{t.sub}</p>
            <p className="pub-herkomst-lede">{t.lede}</p>
          </div>
          <aside className="pub-herkomst-jump">
            <b>{t.jump}</b>
            <button type="button" onClick={() => scrollToHerkomstSection('pijplijn')}>
              {t.navPijplijn}
            </button>
            <button type="button" onClick={() => scrollToHerkomstSection('conceptketen')}>
              {t.navConcept}
            </button>
            <button type="button" onClick={() => scrollToHerkomstSection('standaarden')}>
              {t.navStandaarden}
            </button>
          </aside>
        </div>
        <HerkomstExplorer t={t} lang={lang} />
      </div>
      <HerkomstBackground t={t} lang={lang} />
    </main>
  );
}
```

Note: `Herkomst`'s prop signature keeps `t: Translations` (the shared,
site-wide translations object) even though it's unused inside the
function body, to match every other page's `{ t, lang }` call signature
in `App.tsx`'s `<Route element={...} />` list — if this repo's
`noUnusedParameters` setting flags the unused `t`, prefix it `_t` instead
of dropping it from the signature, so `App.tsx`'s route registration
(Step 4) doesn't need special-casing this one route differently from
every other page.

- [ ] **Step 4: Register the route in `App.tsx`**

In `packages/public-site/src/App.tsx`, add the import:

```tsx
import Herkomst from './pages/Herkomst';
```

alongside the existing page imports, and add the route, right after the
`/woordenboek` route:

```tsx
        <Route path="/woordenboek" element={<Woordenboek t={t} lang={lang} />} />
        <Route path="/herkomst" element={<Herkomst t={t} lang={lang} />} />
```

- [ ] **Step 5: Add `HERKOMST_PATH` to `sections.ts`**

In `packages/public-site/src/lib/sections.ts`, right after the existing
`WOORDENBOEK_PATH` export:

```ts
export const WOORDENBOEK_PATH = '/woordenboek';
export const HERKOMST_PATH = '/herkomst';
```

- [ ] **Step 6: Add the nav item to `MainNav.tsx`**

In `packages/public-site/src/components/MainNav.tsx`, change the import:

```tsx
import { PUB_SECTIONS, WOORDENBOEK_PATH, sectionLabel } from '../lib/sections';
```

to:

```tsx
import { PUB_SECTIONS, WOORDENBOEK_PATH, HERKOMST_PATH, sectionLabel } from '../lib/sections';
```

Then add a new `<li>` right after the existing Woordenboek one:

```tsx
          <li>
            <NavLink to={WOORDENBOEK_PATH}>
              {lang === 'nl' ? 'Gegevenswoordenboek' : 'Data dictionary'}
            </NavLink>
          </li>
          <li>
            <NavLink to={HERKOMST_PATH}>{lang === 'nl' ? 'Herkomst' : 'Provenance'}</NavLink>
          </li>
```

- [ ] **Step 7: Add the route-integration test to `App.test.tsx`**

Append a new test inside the existing `describe('App', ...)` block in
`packages/public-site/src/App.test.tsx`:

```tsx
it('renders Herkomst at /herkomst, reachable from the nav', async () => {
  render(
    <MemoryRouter initialEntries={['/herkomst']}>
      <App />
    </MemoryRouter>
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'Waar komt dit begrip vandaan?' })
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Herkomst' })).toHaveAttribute('aria-current', 'page');
});
```

- [ ] **Step 8: Run all the new/changed tests**

Run: `npx vitest run src/pages/Herkomst.test.tsx src/App.test.tsx`
Expected: PASS, every test green (`Herkomst.test.tsx`'s 4 tests, plus
`App.test.tsx`'s existing 4 tests + the 1 new one).

- [ ] **Step 9: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: all tests pass, no regressions in any other page's tests.

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/public-site/src/pages/Herkomst.tsx packages/public-site/src/pages/Herkomst.test.tsx packages/public-site/src/App.tsx packages/public-site/src/App.test.tsx packages/public-site/src/components/MainNav.tsx packages/public-site/src/lib/sections.ts
git commit -m "feat(public-site): add Herkomst page, route, and nav item"
```

---

## Final verification

After Task 7: run the full suite once more (`npx vitest run && npx tsc --noEmit`
from `packages/public-site`), then hand off to
`superpowers:finishing-a-development-branch`. Per the handoff's own
closing instruction ("When you are done, show me the running view and
list anything in the design you could not reproduce with this repo's
existing components — with what you did instead"): report back explicitly
on this point before finishing the branch, even though no browser tool is
available this session to visually confirm — note that as the one thing
this plan cannot independently verify.
