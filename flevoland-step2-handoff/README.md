# Flevoland step 2: Caseworker in Flevoland's house style — handoff

Design for issue #405, from the brief
[`docs/superpowers/specs/2026-11-16-flevoland-step2-caseworker-design-brief.md`](../docs/superpowers/specs/2026-11-16-flevoland-step2-caseworker-design-brief.md).

Documentation is English; the UI copy stays Dutch.

## Status

**Design, awaiting sign-off (decharge) by Flevoland IT.** Not ready to build yet.
After sign-off and answers to the open questions below, the design is patched
where needed and the implementation instructions (`CLAUDE-CODE-PROMPT.md`, and
`ARCHITECTURE.md` if needed) are added to this folder.

## Contents

| file                                                    | what                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `design/Flevoland stap 2 - Overzicht (standalone).html`  | every state side by side (screenshots); start here                                                    |
| `design/Flevoland stap 2 - Caseworker (standalone).html` | the working prototype; open a state by name: `#selected`, `#list`, `#errors`, `#empty`, `#loading`, `#error`, `#process`, `#palette`, `#dock`, `#beheer` |
| `design/Flevoland stap 2 - Componenten (standalone).html`| component sheet, the decision note per design question, density measurements, new tokens              |
| `design/screenshots/`                                   | one PNG per state, 1440×900 (02 at 1280×800)                                                           |
| `reference/fl-step2.css`                                | **edit this**: the design as CSS, scoped `.fl2` (becomes `:root[data-tenant="flevoland"] .cwd-v2` / `.pac`); class names match `dashboard-v2.css` and `v2-chrome.css` |
| `reference/fl-app.reference.jsx`                        | prototype source (React); markup reference for the components, not production code                   |

The three HTML files are **compiled output**: self-contained (fonts, CSS, React
inlined), they open straight from disk with no server or internet. Keep them in
one folder so the links between them work. Do not edit them; the editable
sources are `reference/` and the design project below.

Design project (claude.ai): `IOU`, pages *Flevoland stap 2 - Overzicht / Caseworker /
Componenten*, sources in `flevoland-stap2/`.

## Suggested review order

1. `01-chrome-taak-gekozen-1440.png`, `02-chrome-taak-gekozen-1280.png` — chrome and inbox with a claimed task and its form
2. `04-formulier-met-fouten.png` — validation errors
3. `08-procesweergave.png` — phase stepper and swimlane
4. `09-commandopalet.png`, `10-assistent.png` — overlays
5. `03`, `05`, `06`, `07` — inbox with tasks, empty, loading, load error
6. `11-beheer-rail.png` — rail with groups
7. `12-componentenblad.png` — the full component sheet and decision notes

## Decided (pending sign-off)

- Type: 14px body/table/UI text, 12px labels/counts/metadata (new token), 16px fields and section headings, 20px form titles, 24px page titles.
- Controls: 44px default (forms, dialogs, primary actions); one compact 32px variant for toolbars, list headers, table rows, the dock; 36px navigation rows.
- Fonts: Fira Sans throughout with tabular figures; Fira Mono only for IDs and process keys; both self-hosted woff2. The serif logo becomes a Fira Sans wordmark.
- Buttons: primary blue, secondary, ghost, danger, danger-secondary, mapped to Flevoland's NL DS Button tokens. Yellow only for the assistant toggle.
- Focus: 3px `#003a8e`, offset 2px; white on the top bar and tab bar; inset on full-width rows. Links underlined in text.
- ⌘K hint: white search field and kbd chip, 9.2:1 (was 3.78:1).
- New tokens (outside Flevoland's file): `font-size-2xs` 12px, `size-control-compact` 32px, `size-row` 36px, `font-family-code` (Fira Mono), `color-background-backdrop`.
- axe-core (WCAG 2.2 A/AA): 0 violations on all states at 1440 and 1280 and on the component sheet.

## Open for Flevoland IT

- [ ] Is a compact scale acceptable on internal work screens: 14px body, 12px metadata, 32px compact controls?
- [ ] Is Fira Mono acceptable for codes and IDs, or their system monospace stack?
- [ ] A Flevoland logo or wordmark for the top bar, to replace "ronl."
- [ ] Who reviews, and in what form (these files, or a demo on acceptance)?
- [ ] Sign-off (decharge) on the design as a whole.

## Not yet designed

Other sections (Nieuws, Berichten, Archief, Profiel, Rollen, Besluiten, Gereedschap,
Audit and others) and the Infra-board, Woo and PA-Cockpit applications of the
chrome. They follow after sign-off, using the same components.
