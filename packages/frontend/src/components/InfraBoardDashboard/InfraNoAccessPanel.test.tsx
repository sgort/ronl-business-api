// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import InfraNoAccessPanel from './InfraNoAccessPanel';
import { INFRA_GATE_ROLE } from '../../pages/infra-board/modes.config';

describe('InfraNoAccessPanel', () => {
  it('shows the required role, matching the gate role InfraBoardDashboard guards on', () => {
    render(<InfraNoAccessPanel />);
    expect(screen.getByText('Geen toegang')).toBeInTheDocument();
    expect(screen.getByText(INFRA_GATE_ROLE)).toBeInTheDocument();
  });
});
