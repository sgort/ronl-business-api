# Reference — editable sources

| File                                   | Role                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `social-card-pa-demo.html`             | **The source. Edit this one.** Includes the grey hint bar at the bottom of the screen, which is preview-only chrome and is outside the captured `#card` element. |
| `social-card-pa-demo.offline-src.html` | Same card with the hint bar swapped for a bundler thumbnail. Input to the standalone build in `../design/`; edit only if you are rebuilding that.                |

## Switching the card to production

The card is currently the **acceptance** variant. For
`plato.open-regels.nl`, two edits in `social-card-pa-demo.html`:

1. The badge — `<p class="badge">` — drop it entirely, or replace
   `Acceptatieomgeving` with something true of production. It exists to stop an
   ACC screenshot being mistaken for the live product; on production it is noise.
2. The footer URL — `<span class="url">` — `acc.plato.open-regels.nl` →
   `plato.open-regels.nl`.

Leave `Mockdata · geen productiegegevens` in place. It is true on production
too: per `docs/PA-DEMO-GO-LIVE.md`, `pa-demo` is mock-only by construction on
every environment.

Then re-capture `#card` at 1× and replace both `../design/og-pa-demo.png` and
the deployed `public/og-pa-demo.png`.

## Design system notes

- Colours are Rijksoverheid: `#154273` Rijksblauw, `#0f3560` for the rail,
  `#ffb612` yellow as the primary accent, `#c3167f` magenta as the
  site's signature. Body copy `#cfdcea`, secondary `#9db4cf`.
- Yellow leads; magenta appears at three points only (accent bar's lower
  section, the rail's heading rule, the active row's left edge). The badge is
  deliberately yellow, not magenta — magenta text on Rijksblauw reads muddy at
  small sizes.
- Type: Fira Sans for everything except the URL, mode numbers and badge, which
  are JetBrains Mono.
- This is the sibling of `social/social-card.html` (the public search site's
  card) and shares its grid, so the two read as one family.
