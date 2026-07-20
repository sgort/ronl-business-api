import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { PersonState } from '../types/brp.types';
import { brpApi } from './brp.api';

const mockKeycloak = vi.hoisted(() => ({
  token: undefined as string | undefined,
}));

vi.mock('./keycloak', () => ({ default: mockKeycloak }));

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  mockKeycloak.token = undefined;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const person: PersonState = {
  burgerservicenummer: '999992235',
  leeftijd: 30,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  naam: { voornamen: 'Wessel', geslachtsnaam: 'Kooyman', voorletters: 'W.' } as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geboorte: {} as any,
};

describe('brpApi.getPersonByBSN', () => {
  it('returns the first person on a successful lookup', async () => {
    server.use(
      http.post('*/brp/personen', () =>
        HttpResponse.json({ success: true, data: { type: 'x', personen: [person] } })
      )
    );

    const result = await brpApi.getPersonByBSN('999992235');

    expect(result).toEqual(person);
  });

  it('returns null when no personen are found', async () => {
    server.use(
      http.post('*/brp/personen', () =>
        HttpResponse.json({ success: true, data: { type: 'x', personen: [] } })
      )
    );

    const result = await brpApi.getPersonByBSN('000000000');

    expect(result).toBeNull();
  });

  it('returns null when the response body reports success: false', async () => {
    server.use(
      http.post('*/brp/personen', () =>
        HttpResponse.json({ success: false, data: { type: 'x', personen: [] } })
      )
    );

    const result = await brpApi.getPersonByBSN('999992235');

    expect(result).toBeNull();
  });

  it('rethrows when the request fails', async () => {
    server.use(http.post('*/brp/personen', () => HttpResponse.json({}, { status: 500 })));

    await expect(brpApi.getPersonByBSN('999992235')).rejects.toBeTruthy();
  });

  it('attaches a bearer token when one is available', async () => {
    mockKeycloak.token = 'test-token';
    let receivedAuth: string | null = null;
    server.use(
      http.post('*/brp/personen', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({ success: true, data: { type: 'x', personen: [person] } });
      })
    );

    await brpApi.getPersonByBSN('999992235');

    expect(receivedAuth).toBe('Bearer test-token');
  });

  it('sends no Authorization header when there is no token', async () => {
    let receivedAuth: string | null = 'unset';
    server.use(
      http.post('*/brp/personen', ({ request }) => {
        receivedAuth = request.headers.get('authorization');
        return HttpResponse.json({ success: true, data: { type: 'x', personen: [person] } });
      })
    );

    await brpApi.getPersonByBSN('999992235');

    expect(receivedAuth).toBeNull();
  });
});

describe('brpApi.getBaseUrl', () => {
  it('returns the configured API base URL', () => {
    expect(brpApi.getBaseUrl()).toBe(import.meta.env.VITE_API_URL);
  });
});
