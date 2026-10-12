import { useId, useState, type ComponentProps } from 'react';
import ProcessVarsSection from '../CaseworkerDashboard/ProcessVarsSection';
import './process-disclosure.css';

/**
 * "Procesgegevens" as a disclosure, folded until asked for, on every
 * dashboard's task panel. Callers key it by task, so it folds again for each
 * new task. Imports its own CSS so it styles wherever it is used.
 */
export default function ProcessVarsDisclosure(props: ComponentProps<typeof ProcessVarsSection>) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <section className="v2-taken-section">
      <h3>
        <button
          type="button"
          className="cwp-disclosure"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((o) => !o)}
        >
          <span>Procesgegevens</span>
          <span className="cwp-disclosure-hint">
            {open ? 'Gegevens verbergen' : 'Gegevens tonen'}
            <span className="cwp-disclosure-icon" aria-hidden="true">
              {open ? '▲' : '▼'}
            </span>
          </span>
        </button>
      </h3>
      {open && (
        <div id={regionId}>
          <ProcessVarsSection {...props} />
        </div>
      )}
    </section>
  );
}
