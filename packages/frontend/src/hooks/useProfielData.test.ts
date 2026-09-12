// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useProfielData } from './useProfielData';

const mockProfile = vi.hoisted(() => vi.fn());
vi.mock('../services/api', () => ({ businessApi: { hr: { profile: mockProfile } } }));

describe('useProfielData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no data, not loading, no error', () => {
    const { result } = renderHook(() => useProfielData('emp-1'));

    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets loading while in flight and populates data on success', async () => {
    let resolve!: (v: { success: boolean; data: Record<string, unknown> }) => void;
    mockProfile.mockReturnValue(new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useProfielData('emp-1'));

    act(() => {
      result.current.load('emp-1');
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve({ success: true, data: { naam: 'Wessel' } });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ naam: 'Wessel' });
    expect(result.current.error).toBeNull();
  });

  it('sets data to null when the response is unsuccessful', async () => {
    mockProfile.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useProfielData('emp-1'));
    await act(async () => {
      await result.current.load('emp-1');
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets an error and clears data when the call rejects', async () => {
    mockProfile.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useProfielData('emp-1'));
    await act(async () => {
      await result.current.load('emp-1');
    });

    expect(result.current.error).toBe('Onboardingprofiel kon niet worden geladen.');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });
  it('records an explicit null when the profile succeeds but carries no record', async () => {
    // `undefined` means "not looked up yet" in this hook's contract, and the
    // caller renders a placeholder for it. A successful lookup that found
    // nothing has to collapse to null so the empty state shows instead.
    mockProfile.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useProfielData('emp-1'));
    await act(async () => {
      await result.current.load('emp-1');
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
