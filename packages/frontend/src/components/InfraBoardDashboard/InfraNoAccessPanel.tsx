import { INFRA_GATE_ROLE } from '../../pages/infra-board/modes.config';

/** Defence-in-depth fallback when a signed-in user lacks the infra-projectteam role. */
export default function InfraNoAccessPanel() {
  return (
    <div className="v2-no-access">
      <h2 className="v2-no-access-title">Geen toegang</h2>
      <p className="v2-no-access-body">
        Het Infra-board is alleen beschikbaar voor leden van het infra-projectteam van Provincie
        Flevoland.
      </p>
      <p className="v2-no-access-meta">
        Vereiste rol: <code>{INFRA_GATE_ROLE}</code>
      </p>
    </div>
  );
}
