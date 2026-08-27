/**
 * Stands in for the vendored PADock, which is deliberately not copied: it
 * imports McpChatSection from components/CaseworkerDashboard, which pulls in
 * businessApi and would fire real MCP/LLM calls from a public page.
 *
 * Prop shape mirrors the real component's (see
 * packages/frontend/src/components/PADashboardV2/PADock.tsx) so the
 * vendored pages/PADashboardV2.tsx type-checks against it unchanged.
 */
import type { KeycloakUser } from '@ronl/shared';

interface Props {
  user: KeycloakUser | null;
  onClose: () => void;
}

export default function PADock(_props: Props): null {
  return null;
}
