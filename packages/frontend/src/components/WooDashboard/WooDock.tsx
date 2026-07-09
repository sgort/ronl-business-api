import { WOO_SUGGESTIES } from '../../pages/woo/woo.data';

interface Props {
  onClose: () => void;
}

export default function WooDock({ onClose }: Props) {
  return (
    <aside className="v2-dock">
      <div className="v2-dock-head">
        <h3 className="v2-dock-title">Woo-assistent</h3>
        <button type="button" className="v2-dock-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="v2-dock-body">
        <div className="w-dock-msg">
          Vraag de assistent om tijdigheid te analyseren, knelpunten te duiden of een
          managementrapportage voor te bereiden. <b>Alle data is fictief.</b>
        </div>
        {WOO_SUGGESTIES.map((s, i) => (
          <div className="w-dock-suggest" key={i}>
            <div className="eyebrow">{s.eyebrow}</div>
            {s.text}
          </div>
        ))}
        <div className="w-dock-input">
          <input placeholder="Stel een vraag…" />
        </div>
      </div>
    </aside>
  );
}
