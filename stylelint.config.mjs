// Stylelint — REPORT-ONLY (#374, item 2). Every rule is a warning, so
// `npm run lint:css` always exits 0; it measures, it does not gate. Turning a
// rule into an error, and wiring it into CI, is a later step of #374.
//
// Deliberately no shared config (stylelint-config-standard and the like): it
// would bury these four signals under style complaints and fight the
// one-rule-per-line style several files use on purpose. See docs/css-files.md.
const warn = { severity: "warning" };

// The root class(es) each scoped stylesheet must start every selector with.
// Files not listed are global by design and exempt from this rule only: the
// two app-shell index.css files, public-site's pub.css (the whole site), the
// Keycloak login theme, and pa-cockpit's styles.css (imports only).
const ROOTS = {
  "packages/frontend/src/components/LoginChoice/access-denied.css": [".lcp-denied"],
  "packages/frontend/src/components/LoginChoice/single-board.css": [".lcp-single"],
  "packages/frontend/src/components/process/caseworker-process.css": [".cwd-v2", ".pbd"],
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
};

export default {
  plugins: ["./scripts/stylelint/selector-root-class.mjs"],
  rules: {
    // No token file exists yet, so every hex value is reported: the baseline
    // for #374 item 3. A token file, once added, gets an override turning it off.
    "color-no-hex": [true, warn],
    "no-duplicate-selectors": [true, warn],
    "declaration-no-important": [true, warn],
  },
  overrides: Object.entries(ROOTS).map(([file, roots]) => ({
    files: [file],
    rules: { "rba/selector-root-class": [true, { roots, ...warn }] },
  })),
};
