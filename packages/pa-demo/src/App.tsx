/**
 * Assembles the demo: the role/reset bar above the vendored cockpit shell.
 *
 * PADashboardV2 takes no props — it reads its user through the shimmed
 * getUser(), its tenant through the shimmed tenant service, and its section
 * content through the overlay PASectionRouter, which re-exports
 * DemoSectionRouter (see src/vendor/README.md). DemoRoleProvider has to be
 * an ancestor of that whole tree: DemoSectionRouter calls useDemoRole() to
 * become a context consumer (see its file header for why that's what makes
 * the role switch actually re-render anything), and DemoBar itself reads and
 * writes the same context to drive the role buttons.
 *
 * demo-overrides.css is imported here (rather than in some deeper vendored
 * consumer, which would mean editing a vendored file) so it loads once for
 * the whole app and applies globally — see its own header for what it hides
 * and why.
 */
import DemoBar from './demo/DemoBar';
import { DemoRoleProvider } from './demo/DemoRoleContext';
import PADashboardV2 from './vendor/pages/PADashboardV2';
import './demo/demo-overrides.css';

export default function App() {
  return (
    <DemoRoleProvider>
      <DemoBar />
      <PADashboardV2 />
    </DemoRoleProvider>
  );
}
