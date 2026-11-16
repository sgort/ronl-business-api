# Design brief: Flevoland look for the Caseworker dashboard

16 November 2026 · Steven Gort · issue #405

Redesign the Caseworker dashboard in Flevoland's full house style, so it can be built as the first app of step 2 (issue #405). The other dashboards follow the same pattern.

## Context

The Caseworker dashboard is where medewerkers of Provincie Flevoland work through their tasks: an inbox of open tasks, starting processes, looking up rules and data, and an AI assistant on the side. It is a dense, information-heavy work screen used all day.

Step 1 of the Flevoland rebrand is live: Flevoland users already see Flevoland IT's **colours** (navy text, Flevoland blue, Material greys, yellow accent fills, Flevoland status colours). Step 2 adds the rest of their house style: the Fira Sans font, the type scale, spacing, buttons, form fields, the focus ring and link styling.

That cannot be done by loading Flevoland IT's stylesheet as it is. It was written for public pages: 18px body text, 44px controls, paragraphs capped at 70 characters. The dashboard today runs mostly at 11–13px. Applied literally, it roughly doubles the size of everything on a screen built for density. So we need a design first: how the Flevoland look translates to a dense work screen.

## Scope

The whole Caseworker dashboard, as a Flevoland medewerker sees it on acceptance (acc.mijn.open-regels.nl, user `test-caseworker-flevoland`):

| Part                                       | What it is                                                                                                | Priority                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Chrome                                     | Top bar (logo, search with ⌘K hint, user), mode tabs, left rail with section groups and counts, main area | First: shared with the Infra-board, Woo and PA-Cockpit                    |
| Taken inbox                                | Three panes: filters, task list, task detail with process steps, variables and the task form              | First: the main work screen                                               |
| Process view                               | Phase stepper and swimlane of where a case stands                                                         | High                                                                      |
| Forms and buttons                          | Task forms, Proces starten, Regelsimulatie                                                                | High                                                                      |
| Command palette (⌘K) and AI assistant dock | Overlays on every screen                                                                                  | Medium                                                                    |
| Other sections                             | Nieuws, Berichten, Archief, Profiel, Rollen, Besluiten, Gereedschap, Audit and others                     | Medium: some still use older Tailwind styling and need the same treatment |
| Empty, loading, error and no-access states | Every section's edge cases                                                                                | Medium                                                                    |

The chrome is one shared stylesheet used by four dashboards. A chrome design made here is the chrome for all of them, so design it with the Infra-board (Gantt, portfolio) and PA-Cockpit (tables, radar) in mind.

## Source material

Flevoland IT's delivery, v0.2.0 (12-10-2026), is in the repository unchanged:

- `packages/shared/styles/flevoland/tokens.css`: their design tokens, already in use: colours, Fira Sans and Roboto font stacks, type sizes 14–44px, weights, line heights, a 4px spacing scale, borders (radius 2px on controls), shadows, a 3px focus outline in `#003a8e`, a 44px minimum target size, motion.
- `packages/shared/styles/flevoland/base.css`: their element styles, not loaded: body 18px with line height 1.6, headings 18–44px, links always underlined, buttons in brand blue with 2px borders and 44px height, form fields 44px with 2px `#757575` borders, checkboxes 20px, reduced-motion and forced-colours rules, and an NL Design System Button mapping.

Their file sets **WCAG 2.2 AA** as the target and explains three deliberate deviations from the Flevoland intranet (darker field borders, underlined links, the darkest focus colour). Keep those.

For comparison: the dashboard today uses Inter (body), JetBrains Mono (labels, counts, codes) and Source Serif 4 (logo), loaded from Google Fonts. Flevoland asks for self-hosted Fira Sans for privacy (AVG).

## The design question

How does Flevoland's house style, written for public pages, translate to a dense work screen? Please decide and show:

1. **Type scale.** Today most text is 11–13px and nothing is above 22px. What is body text, secondary text, table text and the smallest label in the dashboard? Flevoland's smallest token is 14px.
2. **Density.** How much less fits on screen, and where that is acceptable. The task list, the swimlane and later the Infra-board Gantt and PA tables are where it hurts most.
3. **Controls.** Button and field heights (Flevoland: 44px, the WCAG 2.2 enhanced target), and which compact variant, if any, is allowed inside tables, toolbars and the rail. WCAG 2.2 AA itself asks for 24px.
4. **Fonts.** Fira Sans for everything, or Fira Sans plus a monospace for codes, counts and IDs, and what replaces the serif logo.
5. **Buttons.** Primary, secondary, ghost and danger, mapped to Flevoland's button and their NL Design System variants, including disabled and hover.
6. **Focus and links.** The 3px `#003a8e` focus ring on every interactive element, including the light variant on dark surfaces such as the top bar, and when links are underlined.
7. **The ⌘K search hint.** Its contrast fails today (3.78:1); the redesign should fix it.

## Constraints

- **Flevoland only.** Other tenants (Heusden, Amsterdam, Toeslagen and others) keep today's look. The design applies when the user belongs to Flevoland.
- **Whole screens.** No screen may be half Flevoland, half old. Every part of the dashboard needs a design before it ships.
- **Step 1 colours stand:** pink only for accent text and thin lines, yellow only as a fill with dark text, Flevoland's status colours.
- **Accessibility:** WCAG 2.2 AA at least, 4.5:1 for text, 3:1 for controls and focus. Every page is checked automatically with axe-core; the result may not get worse.
- **Built from Flevoland's tokens.** Every value should exist in their token file, or be named as a new one with its reason, so it can be built without one-off values.
- **No new hosting:** fonts are self-hosted as woff2 files, no external font service.

## Deliverables

1. The chrome: top bar, mode tabs, left rail, main area, at 1440px and 1280px wide.
2. The Taken inbox: empty, with tasks, a task selected, a task form with validation errors.
3. A component sheet: type scale, buttons in every state, form fields in every state, focus ring on light and dark, links, badges and counts, the compact variants you allow.
4. The process view, command palette and assistant dock.
5. A short note per decision in "The design question": what you chose and why, and every value that is not in Flevoland's token file.

We build the Caseworker dashboard first from this, then apply the same chrome and components to the Infra-board, Woo and PA-Cockpit.

## Open questions for Flevoland IT

- [ ] Is a compact scale (body text below 18px, controls below 44px) acceptable on internal work screens, and down to what size?
- [ ] Do they have a monospace font in their house style for codes and numbers?
- [ ] Is there a Flevoland logo or wordmark for the top bar in place of today's text logo?
- [ ] Who at Flevoland IT reviews the result, and in what form (screens, a demo on acceptance)?
