/**
 * PASectionRouter — packages/frontend's `host.SectionRouter` (see
 * pages/pa-cockpit-host.tsx). A permanent host seam, not a candidate for
 * moving into @ronl/pa-cockpit.
 *
 * Handles exactly the sections that are this host's business: Profiel,
 * Rollen and the four IOU/Gereedschap panels — none of which the package
 * knows or should know about. Everything else (Vandaag, Issuekaart,
 * Monitoring, Voortgang, the package's own "beheer" panels, and the
 * dossier-lookup-or-placeholder fallthrough) is package-owned section-id
 * grammar, dispatched by @ronl/pa-cockpit's `PaSectionsRouter`.
 *
 * Order matters: this file's own switch runs FIRST, and `PaSectionsRouter`
 * is the unconditional tail, not the other way around. Its terminal branch
 * assumes any id it does not recognise as a static section is a dossier id
 * — rendering Issuekaart when found, a "no longer available" placeholder
 * when not — exactly as the pre-extraction monolith always did. Calling it
 * before this switch would send 'profiel' (etc.) straight into that
 * placeholder instead of ever reaching the case below, because
 * `PaSectionsRouter` has no way to know 'profiel' is this host's business
 * until this file has already ruled everything else out.
 */

import { PaSectionsRouter, type PaSectionRouterProps } from '@ronl/pa-cockpit';
import ProfielSection from '../CaseworkerDashboard/ProfielSection';
import RollenSection from '../CaseworkerDashboard/RollenSection';
import IouGebruiksscenarioSection from '../CaseworkerDashboard/IouGebruiksscenarioSection';
import IouFeedbackSection from '../CaseworkerDashboard/IouFeedbackSection';
import IouZakenSection from '../CaseworkerDashboard/IouZakenSection';
import GereedschapSection from '../CaseworkerDashboard/GereedschapSection';

export default function PASectionRouter(props: PaSectionRouterProps) {
  const { sectionId, user, tenantConfig } = props;

  switch (sectionId) {
    case 'profiel':
      return (
        <div className="v2-main-pad">
          <ProfielSection user={user} tenantConfig={tenantConfig} showManualFetch={false} />
        </div>
      );
    case 'rollen':
      return (
        <div className="v2-main-pad">
          <RollenSection user={user} />
        </div>
      );
    case 'iou-gebruiksscenario':
      return (
        <div className="v2-main-pad">
          <IouGebruiksscenarioSection />
        </div>
      );
    case 'iou-feedback':
      return (
        <div className="v2-main-pad">
          <IouFeedbackSection />
        </div>
      );
    case 'iou-actieve-zaken':
      return (
        <div className="v2-main-pad">
          <IouZakenSection state="opened" />
        </div>
      );
    case 'iou-archief':
      return (
        <div className="v2-main-pad">
          <IouZakenSection state="closed" />
        </div>
      );
    case 'gereedschap-overzicht':
      return (
        <div className="v2-main-pad">
          <GereedschapSection user={user} />
        </div>
      );
    default:
      return <PaSectionsRouter {...props} />;
  }
}
