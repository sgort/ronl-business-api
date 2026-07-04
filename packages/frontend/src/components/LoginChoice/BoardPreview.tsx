import type { PreviewKind } from '../../pages/login-choice/boards.config';

function CasePreview() {
  return (
    <div className="preview pv-case">
      <span className="ptag">Werk · Taken</span>
      <div className="task-list">
        <div className="task-row late">
          <span className="bar" style={{ width: '56%' }} />
          <span className="chip" />
        </div>
        <div className="task-row">
          <span className="bar" style={{ width: '70%' }} />
          <span className="chip open" />
        </div>
        <div className="task-row">
          <span className="bar" style={{ width: '44%' }} />
          <span className="chip open" />
        </div>
      </div>
    </div>
  );
}

function PaPreview() {
  return (
    <div className="preview pv-pa">
      <span className="ptag">Kompas · Issues</span>
      <div className="radar">
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="ring r3" />
        <span className="spoke" style={{ transform: 'rotate(20deg)' }} />
        <span className="spoke" style={{ transform: 'rotate(140deg)' }} />
        <span className="spoke" style={{ transform: 'rotate(260deg)' }} />
        <span className="core" />
        <span className="blob" style={{ left: '74%', top: '34%' }} />
        <span className="blob" style={{ left: '30%', top: '64%' }} />
        <span className="blob" style={{ left: '64%', top: '72%' }} />
      </div>
    </div>
  );
}

function InfraPreview() {
  return (
    <div className="preview pv-infra">
      <span className="ptag">Portfolio · Fases</span>
      <div className="lanes">
        <div className="lane">
          <span className="lh" />
          <span className="pcard g" />
          <span className="pcard" />
        </div>
        <div className="lane">
          <span className="lh" />
          <span className="pcard" />
          <span className="pcard r" />
          <span className="pcard" />
        </div>
        <div className="lane">
          <span className="lh" />
          <span className="pcard g" />
        </div>
        <div className="lane">
          <span className="lh" />
          <span className="pcard" />
          <span className="pcard g" />
        </div>
      </div>
    </div>
  );
}

function WooPreview() {
  return (
    <div className="preview pv-woo">
      <span className="ptag">Woo · Compliance</span>
      <div className="woo-mini">
        <div className="woo-kpi">
          <span className="wdot geel" />
          <span className="wlbl">Open</span>
          <b>34</b>
        </div>
        <div className="woo-kpi">
          <span className="wdot rood" />
          <span className="wlbl">Doorlooptijd</span>
          <b>31d</b>
        </div>
        <div className="woo-kpi">
          <span className="wdot geel" />
          <span className="wlbl">Op tijd</span>
          <b>87%</b>
        </div>
        <div className="woo-kpi">
          <span className="wdot blauw" />
          <span className="wlbl">Publicaties</span>
          <b>1.284</b>
        </div>
      </div>
    </div>
  );
}

export default function BoardPreview({ kind }: { kind: PreviewKind }) {
  if (kind === 'pa') return <PaPreview />;
  if (kind === 'infra') return <InfraPreview />;
  if (kind === 'woo') return <WooPreview />;
  return <CasePreview />;
}
