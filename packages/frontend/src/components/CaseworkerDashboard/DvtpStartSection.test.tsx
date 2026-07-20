// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DvtpStartSection from './DvtpStartSection';

const mockProcessStartFormViewer = vi.hoisted(() => vi.fn());
vi.mock('../ProcessStartFormViewer', () => ({
  default: (props: {
    processKey: string;
    onStarted: (dossier: string) => void;
    onError: () => void;
  }) => {
    mockProcessStartFormViewer(props);
    return (
      <div>
        <button onClick={() => props.onStarted('d-1')}>fake-start</button>
        <button onClick={() => props.onError()}>fake-error</button>
      </div>
    );
  },
}));

describe('DvtpStartSection', () => {
  it('renders the form viewer with the DvTP process key', () => {
    render(<DvtpStartSection user={null} onNavigateToTasks={vi.fn()} />);
    expect(mockProcessStartFormViewer).toHaveBeenCalledWith(
      expect.objectContaining({ processKey: 'DvtpToestemmingGevenProcess' })
    );
  });

  it('shows the success screen once the form reports it started', async () => {
    const user = userEvent.setup();
    render(<DvtpStartSection user={null} onNavigateToTasks={vi.fn()} />);

    await user.click(screen.getByText('fake-start'));

    expect(screen.getByText('Procedure gestart')).toBeInTheDocument();
  });

  it('"Ga naar Mijn taken" calls onNavigateToTasks', async () => {
    const onNavigateToTasks = vi.fn();
    const user = userEvent.setup();
    render(<DvtpStartSection user={null} onNavigateToTasks={onNavigateToTasks} />);

    await user.click(screen.getByText('fake-start'));
    await user.click(screen.getByRole('button', { name: /Ga naar Mijn taken/ }));

    expect(onNavigateToTasks).toHaveBeenCalled();
  });

  it('"Nieuwe procedure starten" returns to the form', async () => {
    const user = userEvent.setup();
    render(<DvtpStartSection user={null} onNavigateToTasks={vi.fn()} />);

    await user.click(screen.getByText('fake-start'));
    await user.click(screen.getByRole('button', { name: 'Nieuwe procedure starten' }));

    expect(screen.getByText('Toestemming geven — DvTP')).toBeInTheDocument();
  });

  it('shows an error banner when the form reports an error', async () => {
    const user = userEvent.setup();
    render(<DvtpStartSection user={null} onNavigateToTasks={vi.fn()} />);

    await user.click(screen.getByText('fake-error'));

    expect(
      screen.getByText('De procedure kon niet worden gestart. Probeer het opnieuw.')
    ).toBeInTheDocument();
  });
});
