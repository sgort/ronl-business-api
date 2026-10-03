// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTaskSignature } from './useTaskSignature';

const mockTaskSpec = vi.hoisted(() => vi.fn());
vi.mock('../../services/api', () => ({
  businessApi: { validsign: { taskSpec: mockTaskSpec } },
}));

afterEach(() => vi.clearAllMocks());

describe('useTaskSignature', () => {
  it('is loading until the spec arrives, then returns it', async () => {
    mockTaskSpec.mockResolvedValue({ success: true, data: { required: true, status: 'none' } });
    const { result } = renderHook(() => useTaskSignature('task-1'));
    // No answer yet: a caller must not show the fallback form in this gap.
    expect(result.current).toEqual({ loading: true, spec: null });
    await waitFor(() =>
      expect(result.current).toEqual({ loading: false, spec: { required: true, status: 'none' } })
    );
    expect(mockTaskSpec).toHaveBeenCalledWith('task-1');
  });

  it('is neither loading nor signing without a task, and does not fetch', () => {
    const { result } = renderHook(() => useTaskSignature(null));
    expect(result.current).toEqual({ loading: false, spec: null });
    expect(mockTaskSpec).not.toHaveBeenCalled();
  });

  it('stops loading with no spec when the fetch fails, so the caller falls back to the form', async () => {
    mockTaskSpec.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useTaskSignature('task-1'));
    await waitFor(() => expect(result.current).toEqual({ loading: false, spec: null }));
  });

  it('stops loading with no spec on a success:false answer', async () => {
    mockTaskSpec.mockResolvedValue({ success: false });
    const { result } = renderHook(() => useTaskSignature('task-1'));
    await waitFor(() => expect(result.current).toEqual({ loading: false, spec: null }));
  });

  it("never shows the previous task's spec after switching tasks", async () => {
    let resolveOld!: (v: unknown) => void;
    let resolveNew!: (v: unknown) => void;
    mockTaskSpec.mockImplementation(
      (id: string) => new Promise((r) => (id === 'old' ? (resolveOld = r) : (resolveNew = r)))
    );
    const { result, rerender } = renderHook(({ id }) => useTaskSignature(id), {
      initialProps: { id: 'old' as string | null },
    });
    rerender({ id: 'new' });
    // Both requests are in flight (each starts a microtask after its effect).
    await waitFor(() => expect(mockTaskSpec).toHaveBeenCalledWith('new'));
    resolveOld({ success: true, data: { required: true, status: 'none' } });
    await new Promise((r) => setTimeout(r, 0));
    // The old answer arrived after the switch: still loading the new task.
    expect(result.current).toEqual({ loading: true, spec: null });
    resolveNew({ success: true, data: { required: false } });
    await waitFor(() =>
      expect(result.current).toEqual({ loading: false, spec: { required: false } })
    );
  });
});
