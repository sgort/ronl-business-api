/**
 * Assembles the demo: the cockpit shell from @ronl/pa-cockpit, wrapped in the
 * one piece of demo-only state it needs.
 *
 * Everything host-specific arrives through `host` (see demo/pa-cockpit-host.tsx):
 * the narrowed mode set, the section router, the null dock, the null session
 * warning and the demo changelog panel — plus the auth and tenant services,
 * which that module registers via configurePaCockpit as an import side effect.
 * DemoRoleProvider has to stay an ancestor of that tree even though this demo
 * renders no role switcher here: DemoSectionRouter calls useDemoRole() to
 * become a context consumer (see its file header for why that's what makes a
 * role switch actually re-render anything), and it throws without a provider
 * ancestor. The switcher itself lives on Beheer → Rollen & rechten
 * (src/demo/RollenRechten.tsx), which reads and writes this same context.
 *
 * Import order is load-bearing: '@ronl/pa-cockpit/styles.css' pulls in
 * dashboard-pa.css and dossierbeheer.css, and demo-overrides.css must come
 * after them — both of its rule blocks win on cascade order at equal
 * specificity rather than with !important. See that file's own header.
 */
import { PADashboardV2 } from '@ronl/pa-cockpit';
import { DemoRoleProvider } from './demo/DemoRoleContext';
import { demoCockpitHost } from './demo/pa-cockpit-host';
import '@ronl/pa-cockpit/styles.css';
import './demo/demo-overrides.css';

export default function App() {
  return (
    <DemoRoleProvider>
      <PADashboardV2 host={demoCockpitHost} />
    </DemoRoleProvider>
  );
}
