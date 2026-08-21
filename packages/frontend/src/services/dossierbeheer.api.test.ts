import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { DossierWriteInput } from './dossierbeheer.api';

const mockIsDossiersMock = vi.hoisted(() => vi.fn());
vi.mock('./pa.api', () => ({ isPaMock: mockIsDossiersMock }));

const mockKeycloak = vi.hoisted(() => ({
  authenticated: false,
  token: undefined as string | undefined,
  updateToken: vi.fn(),
}));
vi.mock('./keycloak', () => ({ default: mockKeycloak }));

/** Fresh module instance per test so the in-memory mock store never leaks between tests. */
async function freshApi(isMock: boolean) {
  vi.resetModules();
  mockIsDossiersMock.mockReturnValue(isMock);
  return import('./dossierbeheer.api');
}

const baseInput: DossierWriteInput = {
  naam: 'Test dossier',
  onderwerp: 'Testonderwerp',
  status: 'actief',
  momentum: 'flat',
  eigenaar: 'Tester',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kompas: {} as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  md: {} as any,
};

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  mockKeycloak.authenticated = false;
  mockKeycloak.token = undefined;
  mockKeycloak.updateToken.mockReset().mockResolvedValue(true);
});

describe('dossierbeheer.api — mock mode', () => {
  it('creates a dossier with versie 1 and a creation note', async () => {
    const api = await freshApi(true);

    const created = await api.createDossier(baseInput);

    expect(created.id).toBe('test-dossier');
    expect(created.versie).toBe(1);
    expect(created.gepubliceerd).toBe(false);
    expect(created.versies).toHaveLength(1);
    expect(created.versies[0].note).toBe('Aangemaakt.');
  });

  it('notes "aangemaakt en gepubliceerd" when created already published', async () => {
    const api = await freshApi(true);

    const created = await api.createDossier({ ...baseInput, gepubliceerd: true });

    expect(created.versies[0].note).toBe('Aangemaakt en gepubliceerd.');
  });

  it('prepends new dossiers so fetchAdminDossiers returns them first', async () => {
    const api = await freshApi(true);
    const created = await api.createDossier(baseInput);

    const all = await api.fetchAdminDossiers();

    expect(all[0].id).toBe(created.id);
  });

  it('updateDossier rejects for an unknown id', async () => {
    const api = await freshApi(true);

    await expect(api.updateDossier('nowhere', { naam: 'x' })).rejects.toThrow('not found');
  });

  it('updateDossier increments versie and appends an update note', async () => {
    const api = await freshApi(true);
    const created = await api.createDossier(baseInput);

    const updated = await api.updateDossier(created.id, { naam: 'Nieuwe naam' });

    expect(updated.versie).toBe(2);
    expect(updated.naam).toBe('Nieuwe naam');
    expect(updated.versies).toHaveLength(2);
    expect(updated.versies[1].note).toBe('Bijgewerkt.');
  });

  it('archiveDossier sets status, clears gepubliceerd, and records archief metadata', async () => {
    const api = await freshApi(true);
    const created = await api.createDossier(baseInput);

    const archived = await api.archiveDossier(created.id, {
      classificatie: 'intern',
      bewaartermijn: 'V10',
      reden: 'Afgerond',
    });

    expect(archived.status).toBe('gearchiveerd');
    expect(archived.gepubliceerd).toBe(false);
    expect(archived.archief?.classificatie).toBe('intern');
    expect(archived.versie).toBe(2);
  });

  it('archiveDossier rejects for an unknown id', async () => {
    const api = await freshApi(true);

    await expect(
      api.archiveDossier('nowhere', { classificatie: 'intern', bewaartermijn: 'V10', reden: 'x' })
    ).rejects.toThrow('not found');
  });

  it('updateDossier rejects once a dossier is archived', async () => {
    const api = await freshApi(true);
    const created = await api.createDossier(baseInput);
    await api.archiveDossier(created.id, {
      classificatie: 'intern',
      bewaartermijn: 'V10',
      reden: 'x',
    });

    await expect(api.updateDossier(created.id, { naam: 'x' })).rejects.toThrow('archived');
  });

  it('unarchiveDossier restores an archived dossier to the given status', async () => {
    const api = await freshApi(true);
    const created = await api.createDossier(baseInput);
    await api.archiveDossier(created.id, {
      classificatie: 'intern',
      bewaartermijn: 'V10',
      reden: 'x',
    });

    const restored = await api.unarchiveDossier(created.id, 'sluimerend');

    expect(restored.status).toBe('sluimerend');
    expect(restored.archief).toBeNull();
  });

  it('unarchiveDossier rejects when the dossier is not archived', async () => {
    const api = await freshApi(true);
    const created = await api.createDossier(baseInput);

    await expect(api.unarchiveDossier(created.id)).rejects.toThrow('not archived');
  });

  it('unarchiveDossier rejects for an unknown id', async () => {
    const api = await freshApi(true);

    await expect(api.unarchiveDossier('nowhere')).rejects.toThrow('not found');
  });

  it('deleteDossier removes the dossier from subsequent fetches', async () => {
    const api = await freshApi(true);
    const created = await api.createDossier(baseInput);

    await api.deleteDossier(created.id);

    const all = await api.fetchAdminDossiers();
    expect(all.find((d) => d.id === created.id)).toBeUndefined();
  });

  it('fetchTemplates and fetchSnippets return the static libraries unchanged', async () => {
    const api = await freshApi(true);

    expect((await api.fetchTemplates()).length).toBeGreaterThan(0);
    expect((await api.fetchSnippets()).length).toBeGreaterThan(0);
  });
});

describe('dossierbeheer.api — live mode', () => {
  it('fetches admin dossiers from the backend with an auth header', async () => {
    mockKeycloak.authenticated = true;
    mockKeycloak.token = 'test-token';
    let receivedAuth: string | null = null;

    server.use(
      http.get('*/pa/dossiers', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({ success: true, data: [] });
      })
    );

    const api = await freshApi(false);
    const result = await api.fetchAdminDossiers();

    expect(result).toEqual([]);
    expect(receivedAuth).toBe('Bearer test-token');
  });

  it('posts a new dossier to the backend', async () => {
    server.use(
      http.post('*/pa/dossiers', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({
          success: true,
          data: { ...(body as object), id: 'from-server' },
        });
      })
    );

    const api = await freshApi(false);
    const result = await api.createDossier(baseInput);

    expect(result.id).toBe('from-server');
  });

  it('deletes a dossier via the backend', async () => {
    let called = false;
    server.use(
      http.delete('*/pa/dossiers/some-id', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    const api = await freshApi(false);
    await api.deleteDossier('some-id');

    expect(called).toBe(true);
  });
});
