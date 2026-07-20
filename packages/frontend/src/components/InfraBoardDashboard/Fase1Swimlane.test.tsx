// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Fase1Swimlane from './Fase1Swimlane';
import { FASE1_LANES, FASE1_NODES } from '../../pages/infra-board/rip-model';

describe('Fase1Swimlane', () => {
  it('renders a lane label for every swimlane', () => {
    render(<Fase1Swimlane statusById={{}} />);
    for (const lane of FASE1_LANES) {
      expect(screen.getByText(lane.label)).toBeInTheDocument();
    }
  });

  it('defaults a node with no explicit status to "todo"', () => {
    render(<Fase1Swimlane statusById={{}} />);
    const firstTaskNode = FASE1_NODES.find((n) => n.kind === 'task')!;
    const el = screen.getByText(firstTaskNode.label).closest('.pb-swim-node');
    expect(el).toHaveClass('todo');
  });

  it('applies the given status class to a node', () => {
    const node = FASE1_NODES.find((n) => n.kind === 'task')!;
    render(<Fase1Swimlane statusById={{ [node.id]: 'done' }} />);
    const el = screen.getByText(node.label).closest('.pb-swim-node');
    expect(el).toHaveClass('done');
  });

  it('marks a claimed node with the claimed class and an in-progress indicator', () => {
    const node = FASE1_NODES.find((n) => n.kind === 'task')!;
    render(<Fase1Swimlane statusById={{}} claimedNodeIds={new Set([node.id])} />);
    const el = screen.getByText(node.label).closest('.pb-swim-node');
    expect(el).toHaveClass('pb-swim-node-claimed');
    expect(screen.getByTitle('In behandeling')).toBeInTheDocument();
  });
});
