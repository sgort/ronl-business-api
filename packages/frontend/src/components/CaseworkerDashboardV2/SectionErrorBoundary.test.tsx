// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SectionErrorBoundary from './SectionErrorBoundary';

const mockShouldThrow = vi.hoisted(() => ({ current: true }));

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('kaboom');
  return <div>ok</div>;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SectionErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    render(
      <SectionErrorBoundary sectionId="vandaag">
        <Bomb shouldThrow={false} />
      </SectionErrorBoundary>
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('shows the fallback panel with the section id and error message when a child throws', () => {
    render(
      <SectionErrorBoundary sectionId="vandaag">
        <Bomb shouldThrow={true} />
      </SectionErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('vandaag')).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });

  it('"Probeer opnieuw" resets the error state and re-attempts rendering the children', async () => {
    // A mutable ref (read at render time, not a prop) lets the retry click
    // land on a child that no longer throws — proving retry actually
    // re-renders the subtree rather than just leaving the fallback up.
    mockShouldThrow.current = true;
    function FlakyBomb() {
      if (mockShouldThrow.current) throw new Error('kaboom');
      return <div>ok</div>;
    }
    const user = userEvent.setup();
    render(
      <SectionErrorBoundary sectionId="vandaag">
        <FlakyBomb />
      </SectionErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    mockShouldThrow.current = false;
    await user.click(screen.getByRole('button', { name: 'Probeer opnieuw' }));

    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('changing sectionId resets a previously caught error', () => {
    const { rerender } = render(
      <SectionErrorBoundary sectionId="vandaag">
        <Bomb shouldThrow={true} />
      </SectionErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <SectionErrorBoundary sectionId="monitoring">
        <Bomb shouldThrow={false} />
      </SectionErrorBoundary>
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
