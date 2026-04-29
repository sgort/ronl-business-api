/**
 * SectionRouter — dispatches an `activeSection` id to a renderer.
 *
 * V2-redesigned sections render their new component (e.g. TakenInbox).
 * Everything else falls through to the existing CaseworkerDashboard
 * section components, so the V2 shell is fully functional from day one
 * even before the rest of the sections are redesigned.
 *
 * To add a new V2 redesign:
 *   1. Build the new component
 *   2. Add it to the dispatch table below
 *   3. (Optional) update modes.config.ts if it should appear in a new mode/group
 */

import type { KeycloakUser } from '@ronl/shared';
import type { TenantConfig } from '../../services/tenant';
import TakenInbox from './TakenInbox';

// ── Existing section components (re-used as-is) ─────────────────────
// Names match the actual files under components/CaseworkerDashboard/.
import RegelCatalogus from '../CaseworkerDashboard/RegelCatalogus';
import ProcesBibliotheek from '../CaseworkerDashboard/ProcesBibliotheek';
import GegevenswoordenboekSection from '../CaseworkerDashboard/GegevenswoordenboekSection';
import ArchiefSection from '../CaseworkerDashboard/ArchiefSection';
import BerichtenSection from '../CaseworkerDashboard/BerichtenSection';
import NieuwsSection from '../CaseworkerDashboard/NieuwsSection';
import ProductenDienstenCatalogus from '../CaseworkerDashboard/ProductenDienstenCatalogus';
import ProfielSection from '../CaseworkerDashboard/ProfielSection';
import RollenSection from '../CaseworkerDashboard/RollenSection';
import HrOnboardingSection from '../CaseworkerDashboard/HrOnboardingSection';
import OnboardingArchiefSection from '../CaseworkerDashboard/OnboardingArchiefSection';
import RipFase1Section from '../CaseworkerDashboard/RipFase1Section';
import RipFase1WipSection from '../CaseworkerDashboard/RipFase1WipSection';
import RipFase1GereedSection from '../CaseworkerDashboard/RipFase1GereedSection';
import IouGebruiksscenarioSection from '../CaseworkerDashboard/IouGebruiksscenarioSection';
import IouFeedbackSection from '../CaseworkerDashboard/IouFeedbackSection';
import IouZakenSection from '../CaseworkerDashboard/IouZakenSection';
import AuditSection from '../CaseworkerDashboard/AuditSection';
import CapacityClaimSection from '../CaseworkerDashboard/CapacityClaimSection';
import CapacityClaimArchiefSection from '../CaseworkerDashboard/CapacityClaimArchiefSection';
import DvtpStartSection from '../CaseworkerDashboard/DvtpStartSection';
import DvtpTakenSection from '../CaseworkerDashboard/DvtpTakenSection';
import GereedschapSection from '../CaseworkerDashboard/GereedschapSection';

interface Props {
  sectionId: string;
  user: KeycloakUser | null;
  tenantConfig: TenantConfig | null;
  onTaskCountChange?: (count: number) => void;
  onIouCountChange?: (count: number) => void;
}

export default function SectionRouter({
  sectionId,
  user,
  tenantConfig,
  onTaskCountChange,
  onIouCountChange,
}: Props) {
  // ── V2 Taken (with quick-filter aliases) ──────────────────────────
  if (sectionId === 'taken') {
    return <TakenInbox user={user} onCountChange={onTaskCountChange} />;
  }
  if (sectionId === 'filter-overdue') return <TakenInbox user={user} initialFilter="overdue" />;
  if (sectionId === 'filter-waiting') return <TakenInbox user={user} initialFilter="unassigned" />;
  if (sectionId === 'filter-today') return <TakenInbox user={user} initialFilter="today" />;
  if (sectionId === 'filter-week') return <TakenInbox user={user} initialFilter="week" />;

  // ── Public / shared library (no props) ────────────────────────────
  if (sectionId === 'regelcatalogus') return <RegelCatalogus />;
  if (sectionId === 'procesbibliotheek') return <ProcesBibliotheek />;
  if (sectionId === 'gegevenswoordenboek') return <GegevenswoordenboekSection />;
  if (sectionId === 'producten-diensten') return <ProductenDienstenCatalogus />;
  if (sectionId === 'nieuws') return <NieuwsSection />;
  if (sectionId === 'berichten') return <BerichtenSection />;
  if (sectionId === 'archief') return <ArchiefSection />;

  // ── IOU "Mijn zaken" — IouZakenSection takes a `state` prop ───────
  if (sectionId === 'iou-actieve-zaken') {
    return <IouZakenSection state="opened" onCountChange={onIouCountChange} />;
  }
  if (sectionId === 'iou-archief') {
    return <IouZakenSection state="closed" />;
  }

  // ── Beheer / projects (require user) ──────────────────────────────
  if (sectionId === 'profiel') {
    return <ProfielSection user={user} tenantConfig={tenantConfig} />;
  }
  if (sectionId === 'rollen') return <RollenSection user={user} />;
  if (sectionId === 'hr-onboarding') return <HrOnboardingSection user={user} />;
  if (sectionId === 'onboarding-archief') return <OnboardingArchiefSection user={user} />;
  if (sectionId === 'rip-fase1') return <RipFase1Section user={user} />;
  if (sectionId === 'rip-fase1-wip') return <RipFase1WipSection user={user} />;
  if (sectionId === 'rip-fase1-gereed') return <RipFase1GereedSection user={user} />;

  // ── IOU forms (no props) ──────────────────────────────────────────
  if (sectionId === 'iou-gebruiksscenario') return <IouGebruiksscenarioSection />;
  if (sectionId === 'iou-feedback') return <IouFeedbackSection />;

  // ── Capacity claim ────────────────────────────────────────────────
  if (sectionId === 'capacity-claim') return <CapacityClaimSection user={user} />;
  if (sectionId === 'capacity-claim-archief') return <CapacityClaimArchiefSection user={user} />;

  // ── DVTP ──────────────────────────────────────────────────────────
  if (sectionId === 'dvtp-start')
    return (
      <DvtpStartSection
        user={user}
        onNavigateToTasks={function (): void {
          throw new Error('Function not implemented.');
        }}
      />
    );
  if (sectionId === 'dvtp-taken') return <DvtpTakenSection user={user} />;

  // ── Hulpmiddelen ──────────────────────────────────────────────────
  // GereedschapSection is a launcher: each tile opens an external product
  // in a new tab. Lives in Beheer → Hulpmiddelen.
  if (sectionId === 'gereedschap-overzicht') return <GereedschapSection user={null} />;

  // Audit log is admin-only — modes.config gates the rail item, but we
  // also gate here so deep-links / palette can't bypass it.
  if (sectionId === 'audit-overzicht') {
    const roles = user?.roles ?? [];
    if (!roles.includes('admin')) {
      return (
        <div style={{ padding: '24px 0', color: '#6b7280' }}>
          <p style={{ fontSize: 14 }}>
            Geen toegang. Audit log is alleen beschikbaar voor beheerders.
          </p>
        </div>
      );
    }
    return <AuditSection user={user} activeTab={'audit-overzicht'} />;
  }

  // Fallback for ids we don't yet route (audit, gereedschap, etc.)
  return (
    <div style={{ padding: '24px 0', color: '#6b7280' }}>
      <p style={{ fontSize: 14 }}>
        Sectie <code style={{ background: '#f3f4f6', padding: '2px 6px' }}>{sectionId}</code>{' '}
        bestaat in de oude dashboard maar is nog niet aangesloten op V2.
      </p>
    </div>
  );
}
