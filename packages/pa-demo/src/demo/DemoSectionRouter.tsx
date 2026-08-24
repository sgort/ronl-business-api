/**
 * Placeholder for the demo's section router.
 *
 * Task 6 replaces this with the demo-safe sibling of the vendored
 * PASectionRouter — same dispatch idea, without the six
 * `../CaseworkerDashboard/*` imports that would pull in real MCP/LLM calls
 * from a public page (see scripts/vendor-manifest.mjs for why PASectionRouter
 * itself is not vendored).
 *
 * This stub exists only so Task 3 can verify the alias map end-to-end; it
 * renders nothing. The prop shape mirrors the real component's so the
 * vendored PADashboardV2.tsx type-checks against it unchanged.
 */
import type { KeycloakUser } from '@ronl/shared';
import type { TenantConfig } from './shims/tenant';
import type { PaModeId } from '../vendor/pages/public-affairs-v2/modes.config';

interface Props {
  sectionId: string;
  prioritering: unknown;
  kompasViz: unknown;
  user: KeycloakUser | null;
  tenantConfig: TenantConfig | null;
  onOpenDossier: (id: string) => void;
  onNavigate?: (mode: PaModeId, sectionId: string) => void;
}

export default function DemoSectionRouter(_props: Props): null {
  return null;
}
