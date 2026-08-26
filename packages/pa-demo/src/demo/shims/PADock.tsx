/**
 * Stands in for packages/frontend's PADock, which this demo deliberately
 * does not reuse: it imports McpChatSection from components/CaseworkerDashboard,
 * which pulls in businessApi and would fire real MCP/LLM calls from a public
 * page. (That is also why the dock is a host seam in @ronl/pa-cockpit rather
 * than package-owned — see PaCockpitHost.Dock.)
 *
 * Typed with the package's own PaDockProps rather than a local restatement of
 * { user, onClose }, so it is assignable to PaCockpitHost['Dock'] by
 * construction: if the shell ever starts handing this seam something else,
 * that is a type error here rather than a prop the shim silently ignores.
 */
import type { PaDockProps } from '@ronl/pa-cockpit';

export default function PADock(_props: PaDockProps): null {
  return null;
}
