# Design: Herkomst van een begrip (provenance tab, public search site)

## Problem

A new tab — **Herkomst** (EN: _Provenance_) — in `packages/public-site`, alongside
the existing Home / Berichten / Nieuws / Producten & Diensten / Regelcatalogus /
Procesbibliotheek / Gegevenswoordenboek nav. It answers one question for one
concept: **where does this concept come from?** It traces the concept _Leeftijd_
(the age requirement for zorgtoeslag) from the quoted legal text all the way to
the question a citizen sees on screen, and lets the user drill into the data
that concept rests on.

A complete, high-fidelity HTML design prototype and handoff already exist at
`docs/herkomst-handoff/` (README, screenshots, and editable JSX/CSS reference
sources) — that handoff is the source of truth for layout, copy, tokens,
interactions and the data contract; this spec restates what's needed to
implement it against this repo's actual conventions and doesn't repeat content
better read there. Per [[handoff-specs-are-source-of-truth]], the handoff
overrides this spec on any visual/content detail; this spec is authoritative
only on the technical breakdown (files, components, routing, content strategy).

## Design

### Route + navigation

- New route `/herkomst` in `App.tsx`, alongside a `HERKOMST_PATH = '/herkomst'`
  constant in `lib/sections.ts` — mirrors the existing `WOORDENBOEK_PATH`
  pattern exactly (Herkomst is a standalone page with no content type and no
  detail route, same shape as Woordenboek, not a typed `PUB_SECTIONS` entry).
- One new `<NavLink to={HERKOMST_PATH}>` in `MainNav.tsx`, positioned after
  Gegevenswoordenboek (matches the screenshots' tab order).

### Component breakdown

New directory `src/pages/herkomst/`, plus the page itself:

- **`src/pages/Herkomst.tsx`** — page shell. Mirrors `Woordenboek.tsx`'s
  `{ t, lang }: { t: Translations; lang: Lang }` prop signature. Renders:
  breadcrumb (`Crumbs` component, trail `[{label: 'Regelcatalogus', to: '/regels'}, {label: 'Zorgtoeslag', to: '/regels'}, {label: 'Herkomst van Leeftijd'}]`
  — see "Breadcrumb simplification" below), page head (kicker/h1/sub/lede +
  jump list to `#pijplijn`/`#conceptketen`/`#standaarden`), `HerkomstExplorer`,
  then `HerkomstBackground`.
- **`src/pages/herkomst/HerkomstExplorer.tsx`** — concept list + trail +
  panel (~reference `KExplorer`). Owns `trail: string[]` local state
  (`useState(['leeftijd'])`); `lang` comes from props. Renders the concept
  list (grouped by `KT_GROUPS`-equivalent), the trail bar (`Herkomst: Leeftijd
› Geboortedatum`, truncate-on-click, "Begin opnieuw" once `trail.length > 1`),
  and `HerkomstTrace` for the current concept.
- **`src/pages/herkomst/HerkomstTrace.tsx`** — the eight-step two-track grid
  (~reference `KTrace`). Concept header (name, other-language name, summary,
  meta pills) then four aligned row pairs (Juridische analyse/Uitleg begrippen,
  Regel/Uitvraag gegevens, DMN/Controle gegevens, Begrippen/Conclusie). Handles
  the two "chain-ends-here" cases: no-DMN concepts render the italic
  "Niet van toepassing" line; concepts with no `begrippen` render "registratiegegeven
  — einde van de keten" instead of chips.
- **`src/pages/herkomst/HerkomstChip.tsx`** — concept chip (~reference
  `KChip`). Clickable (`ref` present, calls `onOpen(ref)`) or a plain leaf
  chip (`ref` absent — own inline definition, not clickable, distinct style).
- **`src/pages/herkomst/HerkomstBackground.tsx`** — the grey Achtergrond band:
  pipeline (4 stages), concept chain ((a)/(b)/(c) + catalogue band + connector
  strip), standards (open vs. gesloten). One file, matching the reference's
  own `keten-parts.jsx` grouping (95 lines there for all three sections).

### Content — two modules, kept out of the shared `Translations` interface

Matches `Woordenboek.tsx`'s established precedent: page-specific content does
not get folded into the global `Translations` interface (which is
structurally enforced by `i18n.test.ts` and shared across every page) — it
stays in a page-scoped module.

- **`src/pages/herkomst/herkomstConcepts.ts`** — the provenance graph
  (~reference `KT_CONCEPTS`/`KT_GROUPS`), carried over **byte-identical** to
  the handoff per its own explicit instruction ("hand-authored, and that is
  the intent... keep the content structure as it is, so a later data layer
  has an obvious shape to fill"). TypeScript types added, content untouched.
  `begrippen[].ref` is what drives the recursion — a concept either points at
  another concept in this same module (clickable chip) or carries its own
  `def` (leaf chip).
- **`src/pages/herkomst/herkomstData.ts`** — this page's own chrome strings
  and background-band content (~reference `KT`/`KT_STAGES`/`KT_ABC`/
  `KT_STANDARDS`), keyed by `lang: 'nl' | 'en'`, same `{nl, en}`-shaped
  bilingual pattern the concepts module uses (a local `htx()` helper mirrors
  the reference's `ktx()`).

### Styling

Appended to the existing single `src/styles/pub.css` — this codebase has one
shared stylesheet, no per-page CSS modules (confirmed: `Woordenboek.tsx` uses
bare `.pub-embed`/`.pub-lede-2` classes with no CSS import of its own).

Every design token the reference CSS needs already exists in `pub.css`
verbatim — `--ro-blue`, `--ro-link`, `--ro-link-hover`, `--ro-violet`,
`--ro-mustard`, `--ro-green`, `--ro-lint`, `--ro-ink`/`-2`/`-3`, `--ro-rule`/
`-2`, `--ro-bg`, `--ro-paper`, `--pub-font`, `--pub-mono` — nothing new to
define. `--ro-focus` also already exists for the focus-ring requirement.

Class prefix renamed from the reference's `.k-*` to `.pub-herkomst-*`
throughout (CSS and JSX both) — matches this codebase's actual naming
convention (`.pub-embed`, `.pub-crumbs`, `.pub-section-h`, `.pub-lede-2`);
the reference's short `.k-` prefix was scoped for a standalone prototype
file and isn't how this repo names things. One-to-one rename, no rule
dropped or restructured — see the full class list in
`docs/herkomst-handoff/reference/keten/keten.css` for exact values to carry
over (colors, spacing, grid columns, the two responsive breakpoints at
1100px and 820px, and the `overflow-wrap:anywhere` fix on `.k-io`/now
`.pub-herkomst-io` — flagged in the handoff as a real bug in an earlier
iteration, don't reintroduce it).

### Interactions (from the handoff, restated for implementation)

- Selecting a concept in the list resets the trail to `[id]`.
- Clicking a concept chip (step 4) or a "herkomst" link (step 3 DMN inputs)
  pushes onto the trail via `onOpen(id)`; opening the concept already at the
  end of the trail is a no-op (trail never grows a duplicate tail) —
  `open = id => setTrail(tr => (tr[tr.length-1] === id ? tr : [...tr, id]))`.
- Trail segments before the last truncate the trail to that depth; "Begin
  opnieuw" resets to `[trail[0]]`.
- Jump buttons smooth-scroll to the background anchors. The handoff's
  `kJump` helper scopes to a `.pub-pane` scroll container that only exists
  in the standalone prototype (built to preview inside an embedded pane);
  confirmed `packages/public-site/src/styles/pub.css`'s `.pub-main` sets no
  `overflow`, so this real site scrolls the window. Implementation uses a
  plain `window.scrollTo({ top: ..., behavior: 'smooth' })` relative
  offset — no `.closest()` container check needed here.
- Language toggle (already owned by `App.tsx`'s `lang` state) swaps every
  string on this page too, via `herkomstData.ts`/`herkomstConcepts.ts`'s
  `{nl,en}` shape — no layout shift expected.
- No loading/error/empty states — content is local and synchronous.

### Responsive behavior

- **≤1100px**: explorer collapses to one column (list above panel); pipeline
  goes 2-up; concept chain stacks to one column.
- **≤820px**: the two tracks stack (legal steps first, then user steps);
  sticky track headers become static; DMN Input/Output grid goes one column.
- DMN identifiers are long and unbreakable — the Input/Output grid needs
  `minmax(0,1fr)` columns and `overflow-wrap:anywhere` on list items and
  code, or the output column overflows into the right-hand track. Real bug
  in an earlier prototype iteration; carry the fix, don't reintroduce it.

### Accessibility

Parent site targets WCAG 2.1 AA; this page must not regress it: skip link
(already site-wide via `SkipLink`), visible focus (2px black outline + `--ro-focus`
glow — already a site token), 4.5:1 contrast throughout, `aria-current="page"`
on the active nav tab (`NavLink` handles this automatically), `aria-current`
on the selected concept in the list. The trail should be a real breadcrumb —
`nav` + list, matching how `Crumbs.tsx` already structures the page-level
breadcrumb. Track headers should be programmatically associated with their
cells for screen readers — the reference relies on visual alignment only
(its one documented a11y gap); improve on it here rather than carrying the
gap forward, since the handoff explicitly calls this out as something
production should do better.

### Breadcrumb simplification

The handoff's own "Open questions" section flags that "Zorgtoeslag" should
ideally deep-link to the specific rule (_Leeftijdseis 18 jaar_) once the
Regelcatalogus can deep-link to it. It can't yet (confirmed: `/regels/:slug`
exists but there's no established slug for this specific rule in the
current data), so both "Regelcatalogus" and "Zorgtoeslag" crumbs point at
`/regels` for now — same target, matching what actually exists today. Not a
regression from the handoff, just resolving its own flagged open question
with the simplest available answer.

## Out of scope

Per the handoff's own explicit scope:

- **URL-addressable traces** (`/herkomst/{conceptId}`). Local `trail` state
  is fine for now.
- **Sourcing content from TriplyDB / CPSV-AP / FLINT.** The content stays
  hand-authored in `herkomstConcepts.ts`; showing the worked example is the
  objective, not data integration.
- Editing provenance content, authentication, and any change to the
  existing search, catalogue or dictionary views beyond the one nav item
  and one route.

## Testing

- `herkomstData.ts`: a structural test mirroring the existing
  `src/i18n/i18n.test.ts` exactly (confirmed present) — `herkomstData.ts`'s
  `nl`/`en` entries are `Record<Lang, {...}>`-shaped the same way
  `translations` is, so the same three checks apply directly: both
  languages declare exactly the same keys, `KT_STEPS`-equivalent arrays
  have matching lengths in both languages, and no string value is empty.
- `HerkomstExplorer`: trail push/truncate/reset behavior — selecting a
  concept resets the trail; opening a chip pushes; opening the current
  concept again is a no-op (no duplicate tail); trail segment click
  truncates to that depth; "Begin opnieuw" resets to the first concept.
- `HerkomstTrace`: renders the no-DMN fallback line for a concept with
  `dmn: null`; renders "einde van de keten" for a concept with empty
  `begrippen`; DMN input rows with a `ref` render a working "herkomst" link
  that calls `onOpen`.
- `HerkomstChip`: a chip with `ref` is a clickable button calling `onOpen`;
  a chip without `ref` renders as a non-interactive leaf.
- `Herkomst.tsx` route: renders via `App.tsx`'s router at `/herkomst`;
  `MainNav` shows the tab as `aria-current="page"` when active.
- Language toggle: switching `lang` swaps concept names, legal text,
  annotations and step labels without throwing (every concept has both
  `nl`/`en` keys populated).
