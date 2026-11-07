// Stylelint — REPORT-ONLY (#374, item 2). Every rule is a warning, so
// `npm run lint:css` always exits 0; it measures, it does not gate. The one
// gate is color-no-hex (#374 3d): packages/frontend/src/css-hex.test.ts runs
// this rule with this config in the frontend suite and fails on any hex
// outside the data colours it lists, so a new hex fails CI.
//
// Deliberately no shared config (stylelint-config-standard and the like): it
// would bury these four signals under style complaints and fight the
// one-rule-per-line style several files use on purpose. See docs/css-files.md.
const warn = { severity: "warning" };

// The root class(es) each scoped stylesheet must start every selector with.
// Files not listed are global by design and exempt from this rule only: the
// two app-shell index.css files, public-site's pub.css (the whole site), the
// Keycloak login theme, pa-cockpit's styles.css (imports only), the
// shared token file (a :root block) and Flevoland IT's delivery under
// packages/shared/styles/flevoland/ (their tokens and their element styles).
const ROOTS = {
  "packages/frontend/src/components/LoginChoice/access-denied.css": [".lcp-denied"],
  "packages/frontend/src/components/LoginChoice/single-board.css": [".lcp-single"],
  "packages/frontend/src/components/process/caseworker-process.css": [".cwd-v2", ".pbd"],
  "packages/frontend/src/components/process/process-disclosure.css": [".cwd-v2"],
  "packages/frontend/src/components/process/process-view.css": [".pbd"],
  "packages/frontend/src/components/signing/signing-panel.css": [".pb-sign-panel"],
  "packages/frontend/src/pages/caseworker-v2/dashboard-v2.css": [".cwd-v2"],
  "packages/frontend/src/pages/caseworker-v2/regelsimulatie.css": [".cwd-v2"],
  "packages/frontend/src/pages/infra-board/dashboard-infra.css": [".pbd"],
  "packages/frontend/src/pages/login-choice/login-portal.css": [".lcp"],
  "packages/frontend/src/pages/woo/dashboard-woo.css": [".wood"],
  "packages/pa-cockpit/src/pages/public-affairs-v2/dashboard-pa.css": [".pac"],
  "packages/pa-cockpit/src/pages/public-affairs-v2/dossierbeheer.css": [".pac"],
  "packages/pa-demo/src/demo/changelog/changelog.css": [".pac-dchangelog-*"],
  "packages/pa-demo/src/demo/demo-overrides.css": [".pac"],
  // The chrome both hosts share (#374 item 4): every rule has a selector for each.
  "packages/shared/styles/v2-chrome.css": [
    ".cwd-v2",
    ".pac",
    ".cwd-v2-palette",
    ".cwd-v2-palette-overlay",
    ".pac-palette",
    ".pac-palette-overlay",
  ],
};

// Files allowed hex values (#374 3a), each for its own reason.
const HEX_ALLOWED = [
  // The shared tokens: where the palette's hex values live.
  "packages/shared/styles/tokens.css",
  // Flevoland IT's delivery (#374), kept verbatim: their palette and their
  // element styles.
  "packages/shared/styles/flevoland/tokens.css",
  "packages/shared/styles/flevoland/base.css",
  // The Keycloak theme's copy of Flevoland's tokens (#400), like its source.
  "keycloak-themes/ronl/login/resources/css/flevoland-tokens.css",
  // Open Regels: a separate brand on its own Rijkshuisstijl tokens.
  "packages/public-site/src/styles/pub.css",
  // Tailwind's own palette as the defaults of the tenant-following scales
  // (#374): copied from tailwindcss/colors, checked by tailwind-palette.test.ts.
  "packages/frontend/src/styles/tailwind-palette.css",
  // The app shells' --color-* values: the tenant-theme fallbacks, not palette.
  "packages/frontend/src/index.css",
  "packages/pa-demo/src/index.css",
];

export default {
  plugins: ["./scripts/stylelint/selector-root-class.mjs"],
  rules: {
    // Hex values belong in the shared token file only (HEX_ALLOWED below).
    "color-no-hex": [true, warn],
    "no-duplicate-selectors": [true, warn],
    "declaration-no-important": [true, warn],
  },
  overrides: [
    ...Object.entries(ROOTS).map(([file, roots]) => ({
      files: [file],
      rules: { "rba/selector-root-class": [true, { roots, ...warn }] },
    })),
    { files: HEX_ALLOWED, rules: { "color-no-hex": null } },
    // Flevoland IT's reduced-motion block needs !important to beat component
    // transitions; kept verbatim.
    {
      files: ["packages/shared/styles/flevoland/base.css"],
      rules: { "declaration-no-important": null },
    },
  ],
};
