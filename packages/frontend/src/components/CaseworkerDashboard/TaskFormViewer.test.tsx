// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskFormViewer from './TaskFormViewer';

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

const mockBusinessApi = vi.hoisted(() => ({
  task: { formSchema: vi.fn(), complete: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

function getSubmitHandler() {
  const call = mockFormInstance.on.mock.calls.filter(([event]) => event === 'submit').at(-1);
  if (!call) throw new Error('submit handler was never registered');
  return call[1] as (payload: {
    data: Record<string, unknown>;
    errors: Record<string, unknown>;
  }) => Promise<void>;
}

describe('TaskFormViewer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockFormInstance.importSchema.mockClear();
    mockFormInstance.on.mockClear();
    mockFormInstance.destroy.mockClear();
    MockForm.mockClear();
    mockBusinessApi.task.formSchema.mockClear();
    mockBusinessApi.task.complete.mockClear();
  });

  it('shows a loading indicator before the form schema resolves', () => {
    mockBusinessApi.task.formSchema.mockReturnValue(new Promise(() => {}));
    render(<TaskFormViewer taskId="t1" variables={null} onCompleted={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText('Formulier laden…')).toBeInTheDocument();
  });

  it('mounts the form-js form with the schema and task variables', async () => {
    mockBusinessApi.task.formSchema.mockResolvedValue({ success: true, data: { schema: 'x' } });
    const { container } = render(
      <TaskFormViewer
        taskId="t1"
        variables={{ naam: 'Wessel' }}
        onCompleted={vi.fn()}
        onError={vi.fn()}
      />
    );

    await waitFor(() => expect(container.querySelector('.fjs-container')).not.toBeNull());
    expect(mockFormInstance.importSchema).toHaveBeenCalledWith({ schema: 'x' }, { naam: 'Wessel' });
  });

  it('defaults variables to {} when null', async () => {
    mockBusinessApi.task.formSchema.mockResolvedValue({ success: true, data: { schema: 'x' } });
    render(<TaskFormViewer taskId="t1" variables={null} onCompleted={vi.fn()} onError={vi.fn()} />);

    await waitFor(() =>
      expect(mockFormInstance.importSchema).toHaveBeenCalledWith({ schema: 'x' }, {})
    );
  });

  it('shows a generic complete button when the backend has no form schema', async () => {
    mockBusinessApi.task.formSchema.mockResolvedValue({ success: false });
    render(<TaskFormViewer taskId="t1" variables={null} onCompleted={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Taak voltooien' })).toBeInTheDocument();
    expect(MockForm).not.toHaveBeenCalled();
  });

  it.each([404, 415])('treats a %d response as "no form", not an error', async (httpStatus) => {
    mockBusinessApi.task.formSchema.mockRejectedValue({ response: { status: httpStatus } });
    render(<TaskFormViewer taskId="t1" variables={null} onCompleted={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Taak voltooien' })).toBeInTheDocument();
  });

  it('shows an error for any other schema-fetch failure', async () => {
    mockBusinessApi.task.formSchema.mockRejectedValue(new Error('backend down'));
    render(<TaskFormViewer taskId="t1" variables={null} onCompleted={vi.fn()} onError={vi.fn()} />);

    expect(await screen.findByText('Formulier kon niet worden geladen.')).toBeInTheDocument();
  });

  it('the generic complete button calls task.complete and onCompleted on success', async () => {
    mockBusinessApi.task.formSchema.mockResolvedValue({ success: false });
    mockBusinessApi.task.complete.mockResolvedValue({ success: true });
    const onCompleted = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskFormViewer taskId="t1" variables={null} onCompleted={onCompleted} onError={vi.fn()} />
    );

    await user.click(await screen.findByRole('button', { name: 'Taak voltooien' }));

    expect(mockBusinessApi.task.complete).toHaveBeenCalledWith('t1', {});
    expect(onCompleted).toHaveBeenCalled();
  });

  it('the generic complete button calls onError when completion fails', async () => {
    mockBusinessApi.task.formSchema.mockResolvedValue({ success: false });
    mockBusinessApi.task.complete.mockResolvedValue({ success: false });
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<TaskFormViewer taskId="t1" variables={null} onCompleted={vi.fn()} onError={onError} />);

    await user.click(await screen.findByRole('button', { name: 'Taak voltooien' }));

    expect(onError).toHaveBeenCalled();
  });

  describe('form-js submit handling', () => {
    async function renderReady(onCompleted = vi.fn(), onError = vi.fn()) {
      mockBusinessApi.task.formSchema.mockResolvedValue({ success: true, data: { schema: 'x' } });
      const utils = render(
        <TaskFormViewer taskId="t1" variables={null} onCompleted={onCompleted} onError={onError} />
      );
      await waitFor(() => expect(mockFormInstance.on).toHaveBeenCalled());
      return { ...utils, onCompleted, onError };
    }

    it('does nothing when the submit payload has validation errors', async () => {
      await renderReady();
      const submit = getSubmitHandler();

      await act(async () => {
        await submit({ data: {}, errors: { veld: 'verplicht' } });
      });

      expect(mockBusinessApi.task.complete).not.toHaveBeenCalled();
    });

    it('completes the task and calls onCompleted on success', async () => {
      const { onCompleted } = await renderReady();
      mockBusinessApi.task.complete.mockResolvedValue({ success: true });

      await act(async () => {
        await getSubmitHandler()({ data: { naam: 'Wessel' }, errors: {} });
      });

      expect(mockBusinessApi.task.complete).toHaveBeenCalledWith('t1', { naam: 'Wessel' });
      expect(onCompleted).toHaveBeenCalled();
    });

    it('calls onError when completion is unsuccessful', async () => {
      const { onError } = await renderReady();
      mockBusinessApi.task.complete.mockResolvedValue({ success: false });

      await act(async () => {
        await getSubmitHandler()({ data: {}, errors: {} });
      });

      expect(onError).toHaveBeenCalled();
    });

    it('calls onError when completion throws', async () => {
      const { onError } = await renderReady();
      mockBusinessApi.task.complete.mockRejectedValue(new Error('network down'));

      await act(async () => {
        await getSubmitHandler()({ data: {}, errors: {} });
      });

      expect(onError).toHaveBeenCalled();
    });
  });

  it('destroys the form-js instance on unmount', async () => {
    mockBusinessApi.task.formSchema.mockResolvedValue({ success: true, data: { schema: 'x' } });

    const { unmount } = render(
      <TaskFormViewer taskId="t1" variables={null} onCompleted={vi.fn()} onError={vi.fn()} />
    );
    await waitFor(() => expect(MockForm).toHaveBeenCalled());

    unmount();

    expect(mockFormInstance.destroy).toHaveBeenCalled();
  });
});
