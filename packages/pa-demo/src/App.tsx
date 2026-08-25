/**
 * Assembles the demo: the vendored cockpit shell, wrapped in the one piece
 * of demo-only state it needs.
 *
 * PADashboardV2 takes no props — it reads its user through the shimmed
 * getUser(), its tenant through the shimmed tenant service, and its section
 * content through the overlay PASectionRouter, which re-exports
 * DemoSectionRouter (see src/vendor/README.md). DemoRoleProvider has to stay
 * an ancestor of that tree even though this demo no longer renders a role
 * switcher of its own here: DemoSectionRouter calls useDemoRole() to become
 * a context consumer (see its file header for why that's what makes a role
 * switch actually re-render anything), and it throws without a provider
 * ancestor. The switcher itself lives on Beheer → Rollen & rechten
 * (src/demo/RollenRechten.tsx), which reads and writes this same context.
 *
 * demo-overrides.css is imported here (rather than in some deeper vendored
 * consumer, which would mean editing a vendored file) so it loads once for
 * the whole app and applies globally — see its own header for what it hides
 * and why.
 */
import { DemoRoleProvider } from './demo/DemoRoleContext';
import PADashboardV2 from './vendor/pages/PADashboardV2';
import './demo/demo-overrides.css';

export default function App() {
  return (
    <DemoRoleProvider>
      <PADashboardV2 />
    </DemoRoleProvider>
  );
}
