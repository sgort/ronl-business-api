// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import ProcessStartFormViewer from './ProcessStartFormViewer';

const mockFormInstance = vi.hoisted(() => ({
  importSchema: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  destroy: vi.fn(),
}));
const MockForm = vi.hoisted(() =>
  vi.fn(function MockFormCtor() {
    return mockFormInstance;
  })
);
vi.mock('@bpmn-io/form-js', () => ({ Form: MockForm }));

const mockStartForm = vi.hoisted(() => vi.fn());
const mockStart = vi.hoisted(() => vi.fn());
vi.mock('../services/api', () => ({
  businessApi: { process: { startForm: mockStartForm, start: mockStart } },
}));

function getSubmitHandler() {
  // .at(-1): grabs the most recently registered handler, since the shared mock
  // accumulates calls across every render (e.g. tests that render twice to
  // compare two outcomes).
  const call = mockFormInstance.on.mock.calls.filter(([event]) => event === 'submit').at(-1);
  if (!call) throw new Error('submit handler was never registered');
  return call[1] as (payload: {
    data: Record<string, unknown>;
    errors: Record<string, unknown>;
  }) => Promise<void>;
}

describe('ProcessStartFormViewer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockFormInstance.importSchema.mockClear();
    mockFormInstance.on.mockClear();
    mockFormInstance.destroy.mockClear();
    MockForm.mockClear();
  });

  it('shows a loading indicator before the form schema resolves', () => {
    mockStartForm.mockReturnValue(new Promise(() => {}));

    render(<ProcessStartFormViewer processKey="pk1" onStarted={vi.fn()} onError={vi.fn()} />);

    expect(screen.getByText('Formulier laden…')).toBeInTheDocument();
  });

  it('mounts the form-js form with the schema and initial data on success', async () => {
    mockStartForm.mockResolvedValue({ success: true, data: { schema: 'x' } });

    const { container } = render(
      <ProcessStartFormViewer
        processKey="pk1"
        initialData={{ naam: 'Wessel' }}
        onStarted={vi.fn()}
        onError={vi.fn()}
      />
    );

    await waitFor(() => expect(container.querySelector('.fjs-container')).not.toBeNull());
    expect(mockFormInstance.importSchema).toHaveBeenCalledWith({ schema: 'x' }, { naam: 'Wessel' });
  });

  it('defaults initialData to {} when not provided', async () => {
    mockStartForm.mockResolvedValue({ success: true, data: { schema: 'x' } });

    render(<ProcessStartFormViewer processKey="pk1" onStarted={vi.fn()} onError={vi.fn()} />);

    await waitFor(() =>
      expect(mockFormInstance.importSchema).toHaveBeenCalledWith({ schema: 'x' }, {})
    );
  });

  it('shows "no form" when the backend has no schema for this process', async () => {
    mockStartForm.mockResolvedValue({ success: false });

    render(<ProcessStartFormViewer processKey="pk1" onStarted={vi.fn()} onError={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText('Geen formulier beschikbaar voor dit proces.')).toBeInTheDocument()
    );
    expect(MockForm).not.toHaveBeenCalled();
  });

  it.each([404, 415])('treats a %d response as "no form", not an error', async (httpStatus) => {
    mockStartForm.mockRejectedValue({ response: { status: httpStatus } });

    render(<ProcessStartFormViewer processKey="pk1" onStarted={vi.fn()} onError={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText('Geen formulier beschikbaar voor dit proces.')).toBeInTheDocument()
    );
  });

  it('shows an error for any other failure', async () => {
    mockStartForm.mockRejectedValue(new Error('backend down'));

    render(<ProcessStartFormViewer processKey="pk1" onStarted={vi.fn()} onError={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText('Formulier kon niet worden geladen.')).toBeInTheDocument()
    );
  });

  describe('submit handling', () => {
    async function renderReady(onStarted = vi.fn(), onError = vi.fn()) {
      mockStartForm.mockResolvedValue({ success: true, data: { schema: 'x' } });
      const utils = render(
        <ProcessStartFormViewer processKey="pk1" onStarted={onStarted} onError={onError} />
      );
      await waitFor(() => expect(mockFormInstance.on).toHaveBeenCalled());
      return { ...utils, onStarted, onError };
    }

    it('does nothing when the submit payload has validation errors', async () => {
      await renderReady();
      const submit = getSubmitHandler();

      await act(async () => {
        await submit({ data: {}, errors: { veld: 'verplicht' } });
      });

      expect(mockStart).not.toHaveBeenCalled();
    });

    it('starts the process and reports the businessKey on success', async () => {
      const { onStarted } = await renderReady();
      mockStart.mockResolvedValue({
        success: true,
        data: { businessKey: 'BK-1', processInstanceId: 'pi-1' },
      });
      const submit = getSubmitHandler();

      await act(async () => {
        await submit({ data: { naam: 'Wessel' }, errors: {} });
      });

      expect(mockStart).toHaveBeenCalledWith('pk1', { naam: 'Wessel' });
      expect(onStarted).toHaveBeenCalledWith('BK-1');
    });

    it('falls back to processInstanceId, then "—", when businessKey is absent', async () => {
      const { onStarted } = await renderReady();
      mockStart.mockResolvedValue({ success: true, data: { processInstanceId: 'pi-1' } });
      await act(async () => {
        await getSubmitHandler()({ data: {}, errors: {} });
      });
      expect(onStarted).toHaveBeenCalledWith('pi-1');

      const { onStarted: onStarted2 } = await renderReady();
      mockStart.mockResolvedValue({ success: true, data: {} });
      await act(async () => {
        await getSubmitHandler()({ data: {}, errors: {} });
      });
      expect(onStarted2).toHaveBeenCalledWith('—');
    });

    // #171: the backend's reason used to be dropped here, one line before
    // anything could show it.
    const ENGINE_CAUSE =
      "Cannot instantiate process definition AwbShellProcess:1:x: no decision definition deployed with key 'AwbCompletenessCheck'";

    async function submitFailing() {
      await act(async () => {
        await getSubmitHandler()({ data: {}, errors: {} });
      });
    }

    it('passes the backend cause and engine instance on to onError, and logs them', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { onError } = await renderReady();
      mockStart.mockResolvedValue({
        success: false,
        error: {
          code: 'PROCESS_START_FAILED',
          message: 'Failed to start process',
          details: ENGINE_CAUSE,
          instance: 'http://localhost:8081/engine-rest',
        },
      });

      await submitFailing();

      const failure = { cause: ENGINE_CAUSE, instance: 'http://localhost:8081/engine-rest' };
      expect(onError).toHaveBeenCalledWith(failure);
      // A constant message with the values as arguments, never interpolated (#203).
      expect(consoleError).toHaveBeenCalledWith('Process start failed', {
        processKey: 'pk1',
        ...failure,
      });
    });

    it('falls back to the error message when the backend gives no details', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { onError } = await renderReady();
      mockStart.mockResolvedValue({
        success: false,
        error: { code: 'TENANT_MISMATCH', message: 'Process belongs to another organisation' },
      });

      await submitFailing();

      expect(onError).toHaveBeenCalledWith({
        cause: 'Process belongs to another organisation',
        instance: undefined,
      });
    });

    it('calls onError with no cause when the backend says nothing usable', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { onError } = await renderReady();
      mockStart.mockResolvedValue({ success: false });

      await submitFailing();

      expect(onError).toHaveBeenCalledWith({ cause: undefined, instance: undefined });
    });

    it('passes the thrown error message on when starting the process throws', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { onError } = await renderReady();
      mockStart.mockRejectedValue(new Error('network down'));

      await submitFailing();

      expect(onError).toHaveBeenCalledWith({ cause: 'network down', instance: undefined });
    });

    it('calls onError with no cause when something other than an Error is thrown', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { onError } = await renderReady();
      mockStart.mockRejectedValue('not an Error');

      await submitFailing();

      expect(onError).toHaveBeenCalledWith({ cause: undefined, instance: undefined });
    });
  });

  it('destroys the form-js instance on unmount', async () => {
    mockStartForm.mockResolvedValue({ success: true, data: { schema: 'x' } });

    const { unmount } = render(
      <ProcessStartFormViewer processKey="pk1" onStarted={vi.fn()} onError={vi.fn()} />
    );
    await waitFor(() => expect(MockForm).toHaveBeenCalled());

    unmount();

    expect(mockFormInstance.destroy).toHaveBeenCalled();
  });
});
