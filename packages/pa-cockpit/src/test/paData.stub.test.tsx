// @vitest-environment jsdom
/**
 * Parity between the canonical usePaData stub and the real context.
 *
 * This is the test that makes the stub trustworthy. It renders the real
 * PaDataProvider and compares the keys it hands out against the keys the stub
 * offers, so adding a member to the context without adding it to the stub fails
 * here — loudly, once — instead of surfacing as an unhandled rejection inside
 * whichever component happens to call it first.
 *
 * pa.api is spread from the real module rather than hand-listed, so this file
 * cannot itself drift: only the fetchers the provider calls on mount are
 * replaced, and everything else stays whatever the module really exports.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../services/pa.api', async (importActual) => {
  const actual = await importActual<typeof import('../services/pa.api')>();
  return {
    ...actual,
    fetchSignals: vi.fn().mockResolvedValue([]),
    fetchInbox: vi
      .fn()
      .mockResolvedValue({ data: [], meta: { total: 0, cap: 100, capped: false } }),
    fetchInboxCounts: vi.fn().mockResolvedValue({}),
    fetchDossiers: vi.fn().mockResolvedValue([]),
    fetchAgenda: vi.fn().mockResolvedValue([]),
    fetchNotifications: vi.fn().mockResolvedValue({ items: [], unseenCount: 0 }),
  };
});

import { PaDataProvider, usePaData } from '../pages/public-affairs-v2/PaDataProvider';
import { makePaDataStub } from './paData.stub';

function wrapper({ children }: { children: ReactNode }) {
  return <PaDataProvider>{children}</PaDataProvider>;
}

describe('makePaDataStub', () => {
  it('exposes exactly the members the real context does', async () => {
    const { result } = renderHook(() => usePaData(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());

    const real = Object.keys(result.current).sort();
    const stub = Object.keys(makePaDataStub()).sort();

    // Equality in both directions on purpose: a missing key is the bug this
    // exists for, and a leftover key means the stub is teaching tests to rely
    // on something the context no longer provides.
    expect(stub).toEqual(real);
  });

  it('lets a caller override one member without dropping the rest', () => {
    const confirmSignal = vi.fn();
    const stub = makePaDataStub({ confirmSignal });

    expect(stub.confirmSignal).toBe(confirmSignal);
    expect(Object.keys(stub).sort()).toEqual(Object.keys(makePaDataStub()).sort());
  });

  it('hands out resources shaped the way consumers read them', () => {
    // Components destructure `.data` and call `.refetch()`; a bare array or a
    // missing refetch is the other way these stubs have broken.
    const stub = makePaDataStub();
    for (const key of ['signals', 'inbox', 'dossiers', 'agenda', 'notifications'] as const) {
      expect(stub[key]).toHaveProperty('data');
      expect(typeof stub[key].refetch).toBe('function');
    }
  });
});
