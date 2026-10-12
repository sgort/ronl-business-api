// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PhaseSwimlaneModel } from '@ronl/shared';

const kc = vi.hoisted(() => ({
  tokenParsed: { sub: 'sub-me', realm_access: { roles: ['rip-projectleider'] } } as Record<
    string,
    unknown
  >,
}));
vi.mock('../../services/keycloak', () => ({ default: kc }));

import ProcessView from './ProcessView';

const MODEL: PhaseSwimlaneModel = {
  phaseCode: 'R2.4',
  lanes: [{ key: 'pl', label: 'Projectleider', candidateGroups: ['rip-projectleider'] }],
  nodes: [
    { id: 'a', bpmnId: 'a', kind: 'task', col: 0, row: 0, label: 'Taak A' },
    { id: 'b', bpmnId: 'b', kind: 'task', col: 1, row: 0, label: 'Taak B' },
  ],
  edges: [{ from: 'a', to: 'b' }],
};

const legend = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-legend]')].map((e) => e.getAttribute('data-legend'));

describe('ProcessView', () => {
  it('renders the title bar with code, live meta, crumbs and the stepper slot', () => {
    render(
      <ProcessView
        model={MODEL}
        statusById={{}}
        title={{
          name: 'DO en -raming',
          code: 'R2.4',
          live: true,
          crumbs: <span>Hoofdproces ›</span>,
        }}
        stepper={<div data-testid="stepper" />}
      />
    );
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(
      'Hoofdproces ›DO en -raming R2.4'
    );
    expect(screen.getByText(/procesmodel \(live\)/)).toBeTruthy();
    expect(screen.getByTestId('stepper')).toBeTruthy();
  });

  it('omits "(live)" when not live', () => {
    render(<ProcessView model={MODEL} statusById={{}} title={{ name: 'X', code: 'R2.4' }} />);
    expect(screen.queryByText(/\(live\)/)).toBeNull();
  });

  it('marks tasks from the token viewer and builds the legend from what is shown', () => {
    const { container } = render(
      <ProcessView
        model={MODEL}
        statusById={{ a: 'active' }}
        tasks={[
          { taskDefinitionKey: 'a', assignee: 'sub-me' },
          { taskDefinitionKey: 'b', assignee: 'sub-colleague' },
        ]}
        title={{ name: 'X', code: 'R2.4' }}
      />
    );
    expect(container.querySelector('[data-node-id="a"]')!.getAttribute('data-mark')).toBe('mine');
    expect(container.querySelector('[data-node-id="b"]')!.getAttribute('data-mark')).toBe(
      'claimed'
    );
    expect(legend(container)).toEqual(['active', 'mine', 'claimed', 'role', 'todo']);
    expect(screen.getByText('Jouw rol (rip-projectleider)')).toBeTruthy();
  });

  it('lets the viewer prop override the token', () => {
    const { container } = render(
      <ProcessView
        model={MODEL}
        statusById={{}}
        tasks={[{ taskDefinitionKey: 'a', assignee: 'sub-me' }]}
        title={{ name: 'X', code: 'R2.4' }}
        viewer={{ userId: 'someone-else', roles: [] }}
      />
    );
    expect(container.querySelector('[data-node-id="a"]')!.getAttribute('data-mark')).toBe(
      'claimed'
    );
    expect(legend(container)).not.toContain('role');
  });

  it('roots itself in .pbd so it styles on any dashboard', () => {
    const { container } = render(
      <ProcessView model={MODEL} statusById={{}} title={{ name: 'X', code: 'R2.4' }} />
    );
    expect(container.firstElementChild!.classList).toContain('pbd');
  });
});

describe('ProcessView — status swatches', () => {
  it('colours the swatch of a further status like the nodes it explains', () => {
    const { container } = render(
      <ProcessView model={MODEL} statusById={{ a: 'action' }} title={{ name: 'X', code: 'R2.4' }} />
    );
    const sw = container.querySelector('[data-legend="action"] .sw') as HTMLElement;
    expect(sw.style.borderTopColor).toBe('rgb(231, 0, 119)');
  });
});
