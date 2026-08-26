/**
 * The canonical stub for usePaData().
 *
 * Twelve test files mock PaDataProvider by hand. Each stub is a plain object,
 * so a member added to the context and missed in a stub is `undefined` at the
 * call site — which surfaces as an unhandled rejection that still lets every
 * test in the file pass. That has happened five times in three days
 * (fetchInboxCounts, refreshInboxCounts, signals, notifications,
 * dismissSignal); one of them shipped and failed an ACC deploy at the Unit
 * tests step, after the suite had gone green locally.
 *
 * One stub, asserted against the real context in paData.stub.test.tsx, turns
 * that whole class from "silent until something calls it" into a single failing
 * test the moment the context grows a member.
 *
 * Pass overrides for whatever a given test asserts on:
 *   mockUsePaData.mockReturnValue(makePaDataStub({ confirmSignal }));
 */
import { vi } from 'vitest';
import type { Dossier, PlenaryItem, Signal } from '@ronl/shared';

function resource<T>(data: T) {
  return { data, status: 'ok' as const, refetch: vi.fn() };
}

export function makePaDataStub(overrides: Record<string, unknown> = {}) {
  return {
    signals: resource([] as Signal[]),
    inbox: resource([] as Signal[]),
    dossiers: resource([] as Dossier[]),
    agenda: resource([] as PlenaryItem[]),
    notifications: resource({ items: [], unseenCount: 0 }),
    inboxCounts: {} as Record<string, number>,
    updateInboxCount: vi.fn(),
    refreshInboxCounts: vi.fn().mockResolvedValue(undefined),
    confirmSignal: vi.fn(),
    dismissSignal: vi.fn().mockResolvedValue(undefined),
    linkSignalDossier: vi.fn(),
    watchDossier: vi.fn().mockResolvedValue(undefined),
    unwatchDossier: vi.fn().mockResolvedValue(undefined),
    toggleSearchNotify: vi.fn().mockResolvedValue(undefined),
    ackNotifications: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
