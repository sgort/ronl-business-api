/**
 * Demo furniture, not product chrome.
 *
 * Sits above the vendored PA-Cockpit shell and gives a visitor the one
 * control the product itself never exposes: switching the dossier role (see
 * DemoRoleContext for why that inversion is correct here). It also owns the
 * "reset the demo" action and the fictional-data disclaimer.
 *
 * Deliberately its own class prefix (`plato-bar`) and its own stylesheet
 * (./demo-bar.css) rather than reusing any `.pac` class — this bar must not
 * risk colliding with the vendored cockpit's own styling as that evolves.
 *
 * No live/mock toggle is offered here, on purpose: plato has no Live to
 * switch to. `resetDemo` stays, since restarting the demo is a legitimate
 * visitor action; a mock/live toggle would not be.
 */
import './demo-bar.css';
import { DEMO_ROLE_OPTIONS, useDemoRole, type DemoRoleId } from './DemoRoleContext';
import { resetMockDemoData } from '../vendor/services/mock-demo.store';
import { resetMockDossiers } from '../vendor/services/dossierbeheer.api';

export default function DemoBar() {
  const { roleId, setRoleId } = useDemoRole();

  function resetDemo(): void {
    // Two separate mock stores (signals/searches/notifications vs.
    // dossiers) need clearing, and only then is a reload safe to make the
    // fresh seed visible everywhere at once.
    resetMockDemoData();
    resetMockDossiers();
    window.location.reload();
  }

  return (
    <header className="plato-bar">
      <span className="plato-bar-label">Demonstratie · fictieve gegevens</span>

      <div className="plato-bar-roles">
        <span className="plato-bar-label" id="plato-bar-role-label">
          Je rol
        </span>
        <div className="plato-bar-role-group" role="group" aria-labelledby="plato-bar-role-label">
          {DEMO_ROLE_OPTIONS.map((option: { id: DemoRoleId; label: string }) => (
            <button
              key={option.id}
              type="button"
              className="plato-bar-role"
              aria-pressed={roleId === option.id}
              onClick={() => setRoleId(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="plato-bar-reset" onClick={resetDemo}>
        Demo herstellen
      </button>
    </header>
  );
}
