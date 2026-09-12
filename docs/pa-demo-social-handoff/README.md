# Handoff — Flevoland Public Affairs social card

A social card (Open Graph / Twitter) for the PA-Cockpit demo deployed as
`packages/pa-demo` at `acc.plato.open-regels.nl`.

## Start here

- **See the design:** `design/social-card-pa-demo-offline.html` — opens
  straight from disk, no server. Then `design/README.md` for the review order
  through the five screenshot states.
- **Build it:** `docs/claude-code-prompt.md` — a ready-to-paste Claude Code
  prompt, written against the real repo layout.
- **Edit the design:** `reference/` — the editable HTML, plus how to switch the
  card from acceptance to production.

## Contents

    design/
      social-card-pa-demo-offline.html   standalone, self-contained (compiled)
      og-pa-demo.png                     the 1200×630 asset that ships
      screenshots/                       01–05, see design/README.md
      README.md
    docs/
      claude-code-prompt.md              implementation prompt
    reference/
      social-card-pa-demo.html           edit this
      social-card-pa-demo.offline-src.html
      README.md

## Scope

One sitewide card, following `packages/public-site`'s existing pattern. The
implementation is three small things: a PNG in `public/`, a meta block in
`index.html`, and a build-time origin rewrite so ACC previews point at ACC.

Two things deliberately left out, both flagged in the prompt: no favicon for
`pa-demo` (it has none today — separate decision), and no PROD card yet, since
the production Static Web App and DNS do not exist (§1/§3 of
`docs/PA-DEMO-GO-LIVE.md`).
