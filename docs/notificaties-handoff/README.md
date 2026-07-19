# Notificaties handoff — Beheer › Monitoring

A read-only explainer page for the **WatchBell & Meldingen** notification layer, to be added
under **Beheer → Monitoring → Notificaties** (directly beneath Zoekcriteria). Sibling of the
existing **Curatiepijplijn** spec page — same visual language, same "document the machinery beside
the thing it explains" pattern.

## Contents

```
notificaties-handoff/
├── CLAUDE-CODE-PROMPT.md      ← paste this into Claude Code with the repo open
├── README.md                 ← you are here
├── design/
│   └── Notificaties-page.png ← screenshot of the signed-off design
└── reference/
    ├── NotificatiesSection.reference.tsx  ← the component to port (already TSX)
    ├── notificaties.css.snippet.css       ← append to dashboard-pa.css (2 new rules)
    └── WATCHBELL.md                        ← canonical feature doc = source of truth for copy
```

## TL;DR for the implementer

1. `modes.config.ts` → add `{ id: 'notificaties', label: 'Notificaties', authRequired: true }`
   between `zoekcriteria` and `curatie-spec` in the beheer Monitoring group.
2. `PASectionRouter.tsx` → add `'notificaties'` to `BEHEER_IDS` + a `case` rendering
   `<NotificatiesSection />`.
3. Drop `NotificatiesSection.reference.tsx` in as `NotificatiesSection.tsx`.
4. Append the CSS snippet to `dashboard-pa.css`.

⌘K registration is automatic (driven by `allStaticSections()`). The notification backend, WatchBell
and NotificationsPanel already exist — this page only _documents_ them; it changes no behaviour.
