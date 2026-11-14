// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProcesStartenSection from './ProcesStartenSection';

const mockStartable = vi.hoisted(() => vi.fn());
const mockStart = vi.hoisted(() => vi.fn());
vi.mock('../../services/api', () => ({
  businessApi: { process: { startable: mockStartable, start: mockStart } },
}));

// The viewer is tested on its own; here it stands in and exposes its callbacks.
const viewerProps = vi.hoisted(
  () =>
    ({ current: null }) as {
      current: null | {
        processKey: string;
        onStarted: (dossier: string) => void;
        onError: (f: { cause?: string }) => void;
      };
    }
);
vi.mock('../ProcessStartFormViewer', () => ({
  default: (props: NonNullable<typeof viewerProps.current>) => {
    viewerProps.current = props;
    return <div>start-form-{props.processKey}</div>;
  },
}));
vi.mock('../StartFailureNotice', () => ({
  default: ({ failure }: { failure: { cause?: string } }) => <div>failure-{failure.cause}</div>,
}));

/** Started directly; the first task then appears under Taken (like HR onboarding). */
const bulk = {
  key: 'IngezeteneBulkProcess',
  name: 'Ingezetenecriteria voor een lijst gevallen',
  hasStartForm: false,
};
/** Has a start form, which is filled in before the process starts. */
const intake = { key: 'IntakeProcess', name: 'Intake', hasStartForm: true };
/** Every row's button reads "Start proces"; its accessible name adds the process. */
const startLabel = `Start proces: ${bulk.name}`;
const intakeLabel = `Start proces: ${intake.name}`;

beforeEach(() => {
  viewerProps.current = null;
  mockStartable.mockResolvedValue({ success: true, data: [bulk] });
  mockStart.mockResolvedValue({
    success: true,
    data: { processInstanceId: 'pi-1', businessKey: 'bes-123' },
  });
});

afterEach(() => vi.clearAllMocks());

describe('ProcesStartenSection', () => {
  it('lists each process as a row with its name and a Start proces button', async () => {
    render(<ProcesStartenSection />);

    const row = (await screen.findByText(bulk.name)).closest('li')!;
    expect(row).not.toBeNull();
    const button = within(row).getByRole('button', { name: startLabel });
    expect(button).toHaveTextContent(/^Start proces$/);
  });

  it('keeps the visible text in the accessible name while starting', async () => {
    // WCAG 2.5.3: the accessible name must contain the visible text, also while
    // the button reads "Bezig…" (#453).
    mockStart.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ProcesStartenSection />);

    await user.click(await screen.findByRole('button', { name: startLabel }));

    const busy = screen.getByRole('button', { name: `Bezig…: ${bulk.name}` });
    expect(busy).toHaveTextContent(/^Bezig…$/);
  });

  it('does not make the process name itself the button', async () => {
    render(<ProcesStartenSection />);

    expect(await screen.findByText(bulk.name)).not.toHaveAttribute('type', 'button');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('says so when there is nothing to start', async () => {
    mockStartable.mockResolvedValue({ success: true, data: [] });
    render(<ProcesStartenSection />);

    expect(
      await screen.findByText('Er zijn geen processen die u kunt starten.')
    ).toBeInTheDocument();
  });

  describe('a process without a start form', () => {
    it('starts it at once, without a form', async () => {
      const user = userEvent.setup();
      render(<ProcesStartenSection />);

      await user.click(await screen.findByRole('button', { name: startLabel }));

      expect(mockStart).toHaveBeenCalledWith(bulk.key, {});
      expect(screen.queryByText(/^start-form-/)).toBeNull();
    });

    it('confirms the dossier and points to Taken for the first task', async () => {
      const user = userEvent.setup();
      render(<ProcesStartenSection />);

      await user.click(await screen.findByRole('button', { name: startLabel }));

      const notice = await screen.findByRole('status');
      expect(notice).toHaveTextContent('bes-123');
      expect(notice).toHaveTextContent('De eerste taak staat onder Taken.');
      expect(screen.getByRole('button', { name: startLabel })).toBeInTheDocument();
    });

    it('shows why a start failed', async () => {
      mockStart.mockResolvedValue({
        success: false,
        error: { message: 'Forbidden', details: 'engine said no' },
      });
      const user = userEvent.setup();
      render(<ProcesStartenSection />);

      await user.click(await screen.findByRole('button', { name: startLabel }));

      expect(await screen.findByText('failure-engine said no')).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  describe('a process with a start form', () => {
    beforeEach(() => {
      mockStartable.mockResolvedValue({ success: true, data: [intake] });
    });

    it('opens the form first and starts nothing yet', async () => {
      const user = userEvent.setup();
      render(<ProcesStartenSection />);

      await user.click(await screen.findByRole('button', { name: intakeLabel }));

      expect(screen.getByText(`start-form-${intake.key}`)).toBeInTheDocument();
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('confirms the dossier once the form started it, and returns to the list', async () => {
      const user = userEvent.setup();
      render(<ProcesStartenSection />);
      await user.click(await screen.findByRole('button', { name: intakeLabel }));

      viewerProps.current!.onStarted('bes-456');

      expect(await screen.findByRole('status')).toHaveTextContent('bes-456');
      expect(screen.queryByText(`start-form-${intake.key}`)).toBeNull();
    });

    it('shows why the form could not start it', async () => {
      const user = userEvent.setup();
      render(<ProcesStartenSection />);
      await user.click(await screen.findByRole('button', { name: intakeLabel }));

      viewerProps.current!.onError({ cause: 'engine said no' });

      expect(await screen.findByText('failure-engine said no')).toBeInTheDocument();
    });
  });

  describe('fallbacks', () => {
    it('names the instance id when the start returns no business key', async () => {
      mockStart.mockResolvedValue({ success: true, data: { processInstanceId: 'pi-77' } });
      const user = userEvent.setup();
      render(<ProcesStartenSection />);
      await user.click(await screen.findByRole('button', { name: startLabel }));

      expect(await screen.findByRole('status')).toHaveTextContent('pi-77');
    });

    it('still confirms when the start returns no data', async () => {
      mockStart.mockResolvedValue({ success: true });
      const user = userEvent.setup();
      render(<ProcesStartenSection />);
      await user.click(await screen.findByRole('button', { name: startLabel }));

      expect(await screen.findByRole('status')).toHaveTextContent('—');
    });

    it('falls back to the error message when a refusal has no details', async () => {
      mockStart.mockResolvedValue({ success: false, error: { message: 'Forbidden' } });
      const user = userEvent.setup();
      render(<ProcesStartenSection />);
      await user.click(await screen.findByRole('button', { name: startLabel }));

      expect(await screen.findByText('failure-Forbidden')).toBeInTheDocument();
    });

    it('shows the message of a start that throws', async () => {
      mockStart.mockRejectedValue(new Error('network down'));
      const user = userEvent.setup();
      render(<ProcesStartenSection />);
      await user.click(await screen.findByRole('button', { name: startLabel }));

      expect(await screen.findByText('failure-network down')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: startLabel })).toBeEnabled();
    });

    it('shows a failure without a cause when something other than an Error is thrown', async () => {
      mockStart.mockRejectedValue('nope');
      const user = userEvent.setup();
      render(<ProcesStartenSection />);
      await user.click(await screen.findByRole('button', { name: startLabel }));

      expect(await screen.findByText('failure-')).toBeInTheDocument();
    });

    it('treats a list response without data as nothing to start', async () => {
      mockStartable.mockResolvedValue({ success: true });
      render(<ProcesStartenSection />);

      expect(
        await screen.findByText('Er zijn geen processen die u kunt starten.')
      ).toBeInTheDocument();
    });

    it('does not update after it is gone', async () => {
      let resolve!: (v: unknown) => void;
      mockStartable.mockReturnValue(new Promise((r) => (resolve = r)));
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { unmount } = render(<ProcesStartenSection />);
      unmount();
      resolve({ success: true, data: [bulk] });
      await Promise.resolve();

      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });
  });

  it('shows an error when the list cannot be loaded', async () => {
    mockStartable.mockRejectedValue(new Error('down'));
    render(<ProcesStartenSection />);

    expect(await screen.findByText(/konden niet worden geladen/)).toBeInTheDocument();
  });
});
