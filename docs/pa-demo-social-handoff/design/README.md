# Design — Flevoland Public Affairs social card

## What is here

| File                               | What it is                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `social-card-pa-demo-offline.html` | **Standalone, self-contained** card. Opens straight from the filesystem, no server or build. Fonts are inlined. |
| `og-pa-demo.png`                   | The 1200 × 630 export — this is the file that ships.                                                            |
| `screenshots/`                     | Every state worth reviewing, below.                                                                             |

Compiled output: `social-card-pa-demo-offline.html` and everything in
`screenshots/`. **Do not edit them.** The editable source is
`../reference/social-card-pa-demo.html` — see that folder's notes.

## Review order

1. `screenshots/01-card-full-1200x630.png` — the card as it ships, at 1:1.
2. `screenshots/05-link-preview-context.png` — the same card inside a link
   preview at 500 px, 320 px and 200 px. This is the state that matters most:
   almost nobody sees the card at full size. Check that the title still reads at
   200 px and that the mode rail degrades into texture rather than noise.
3. `screenshots/02-detail-title-and-badge.png` — the yellow
   `ACCEPTATIEOMGEVING` badge and the title.
4. `screenshots/03-detail-mode-rail.png` — the five cockpit modes, with the
   magenta active edge on _Vandaag_.
5. `screenshots/04-detail-footer-url.png` — the URL and the mockdata
   disclaimer.
6. `social-card-pa-demo-offline.html` — open it to inspect live text, or to
   re-capture after an edit.

`screenshots/link-preview-context.html` is the small harness that produced
state 5; it loads `og-pa-demo.png` from the same folder.

## How to regenerate the PNG

Open `../reference/social-card-pa-demo.html`, edit the copy, then capture the
`#card` element at **1× — exactly 1200 × 630**. Do not scale it up: an
oversized OG image is re-compressed by every scraper and the type goes soft.
