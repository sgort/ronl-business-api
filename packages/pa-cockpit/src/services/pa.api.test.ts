// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { FeedItem } from '@ronl/shared';

// The host's `services` state lives on the module-scope `let` in ../host, so it
// only follows a fresh registry the same way pa.api's own env-driven state does:
// configure it via a dynamic import taken *after* vi.resetModules(), in the same
// freshApi() call that will go on to (dynamically, so same registry) import
// pa.api itself. A static top-level `import { configurePaCockpit } from '../host'`
// would bind to the pre-reset module instance and silently configure a copy
// nothing else ever reads.
const authState = {
  authenticated: false,
  token: undefined as string | undefined,
};
const updateTokenMock = vi.fn();

function hostConfig() {
  return {
    auth: {
      authenticated: authState.authenticated,
      token: authState.token,
      getUser: () => null,
      updateToken: updateTokenMock,
      logout: async () => {},
    },
    tenant: {
      initializeTenantTheme: async () => true,
      loadTenantConfigs: async () => ({}),
      getTenantConfig: () => null,
      getDefaultTenantConfig: () => null,
    },
  };
}

/** Fresh module instance with the given mock flags baked in via import.meta.env. */
async function freshApi(
  opts: { signalsMock?: boolean; agendaMock?: boolean; dossiersMock?: boolean } = {}
) {
  vi.stubEnv('VITE_PA_SIGNALS_MOCK', String(!!opts.signalsMock));
  vi.stubEnv('VITE_PA_AGENDA_MOCK', String(!!opts.agendaMock));
  vi.stubEnv('VITE_PA_DOSSIERS_MOCK', String(!!opts.dossiersMock));
  vi.resetModules();
  const { configurePaCockpit } = await import('../host');
  configurePaCockpit(hostConfig());
  return import('./pa.api');
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  authState.authenticated = false;
  authState.token = undefined;
  updateTokenMock.mockReset().mockResolvedValue(true);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('paTabBronnen / signalTag / signalTagLabel', () => {
  it('maps a tab id to its human-readable source labels', async () => {
    const api = await freshApi();
    expect(api.paTabBronnen('politiek')).toContain('Tweede Kamer');
  });

  it('falls back to "nl" tag and the raw tab as label for an unknown tab', async () => {
    const api = await freshApi();
    expect(api.signalTag('unknown')).toBe('nl');
    expect(api.signalTagLabel('unknown')).toBe('unknown');
  });
});

describe('isPaMock / setPaMock', () => {
  it('is one switch: the signals fixtures follow the same override as dossiers', async () => {
    // The whole point of unifying the flags — a single toggle has to move
    // dossiers, signals and searches together, or "mock mode" means two things.
    const api = await freshApi({ dossiersMock: false, signalsMock: false });
    api.setPaMock(true);
    expect(api.isPaMock()).toBe(true);
    await expect(api.fetchSearches()).resolves.not.toHaveLength(0);
  });

  it('defaults to mock when either legacy env flag is set', async () => {
    // Transitional: neither .env file changes meaning while both vars exist.
    expect((await freshApi({ signalsMock: true })).isPaMock()).toBe(true);
    expect((await freshApi({ dossiersMock: true })).isPaMock()).toBe(true);
    expect((await freshApi()).isPaMock()).toBe(false);
  });

  it('falls back to the build-time flag when nothing is stored', async () => {
    const api = await freshApi({ dossiersMock: true });
    expect(api.isPaMock()).toBe(true);
  });

  it('setPaMock persists an override that isPaMock then reflects', async () => {
    const api = await freshApi({ dossiersMock: false });
    api.setPaMock(true);
    expect(api.isPaMock()).toBe(true);
    api.setPaMock(false);
    expect(api.isPaMock()).toBe(false);
  });

  it('falls back to the build-time flag when localStorage throws', async () => {
    const api = await freshApi({ dossiersMock: true });
    const spy = vi.spyOn(window.localStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(api.isPaMock()).toBe(true);

    spy.mockRestore();
  });
});

describe('mock mode curation', () => {
  /** Mock mode plus the store module from the same fresh graph pa.api is using. */
  async function mockApi() {
    const api = await freshApi();
    api.setPaMock(true);
    const store = await import('./mock-demo.store');
    return { api, store };
  }

  it('confirming moves a signal out of the inbox and into the curated set', async () => {
    const { api } = await mockApi();
    const before = await api.fetchInbox({ tab: 'politiek' });
    const target = before.data[0];

    await api.confirmSignal(target.id);

    const after = await api.fetchInbox({ tab: 'politiek' });
    expect(after.meta.total).toBe(before.meta.total - 1);
    expect((await api.fetchSignals({ tab: 'politiek' })).map((s) => s.id)).toContain(target.id);
  });

  it('the inbox count follows a confirm instead of springing back', async () => {
    // The whole point: counts used to be recomputed from the unchanged fixture,
    // so the rail badge decremented optimistically and then reverted.
    const { api } = await mockApi();
    const before = await api.fetchInboxCounts();
    const target = (await api.fetchInbox({ tab: 'politiek' })).data[0];

    await api.confirmSignal(target.id);

    expect((await api.fetchInboxCounts()).politiek).toBe(before.politiek - 1);
  });

  it('keeps a confirm across a reload', async () => {
    const first = await mockApi();
    const target = (await first.api.fetchInbox({ tab: 'politiek' })).data[0];
    await first.api.confirmSignal(target.id);

    // A fresh module graph with localStorage intact is what a reload amounts to.
    const { api } = await mockApi();

    expect((await api.fetchSignals({ tab: 'politiek' })).map((s) => s.id)).toContain(target.id);
  });

  it('linking a dossier sticks too', async () => {
    const { api } = await mockApi();
    const target = (await api.fetchInbox({ tab: 'politiek' })).data[0];

    await api.linkSignalDossier(target.id, 'stikstof');

    const again = (await api.fetchInbox({ tab: 'politiek' })).data.find((s) => s.id === target.id);
    expect(again?.dossierId).toBe('stikstof');
  });

  it('ignoring a signal keeps it out of the inbox, including after a reload', async () => {
    // "Negeren" was client-only state in both modes, so an ignored signal came
    // back on the next load — the button did not do what it said.
    const first = await mockApi();
    const before = await first.api.fetchInboxCounts();
    const target = (await first.api.fetchInbox({ tab: 'politiek' })).data[0];

    await first.api.dismissSignal(target.id);

    expect((await first.api.fetchInboxCounts()).politiek).toBe(before.politiek - 1);
    const { api } = await mockApi();
    expect((await api.fetchInbox({ tab: 'politiek' })).data.map((s) => s.id)).not.toContain(
      target.id
    );
  });

  it('does not resurrect an ignored signal as curated', async () => {
    const { api } = await mockApi();
    const target = (await api.fetchInbox({ tab: 'politiek' })).data[0];

    await api.dismissSignal(target.id);

    expect((await api.fetchSignals({ tab: 'politiek' })).map((s) => s.id)).not.toContain(target.id);
  });

  it('creating a zoekcriterium makes it appear in the list', async () => {
    // The mock branch used to return an id without storing the row, so the new
    // criterium was invisible. Invisible because the branch was unreachable
    // while VITE_PA_SIGNALS_MOCK was false — these calls really hit the backend.
    const { api } = await mockApi();
    const before = (await api.fetchSearches()).length;

    const { id } = await api.createSearch({
      q: 'netcongestie',
      source: ['tk'],
      tags: ['energie'],
      dossierId: 'energie',
      scope: 'tenant',
    });

    const after = await api.fetchSearches();
    expect(after).toHaveLength(before + 1);
    expect(after.find((x) => x.id === id)?.query.q).toBe('netcongestie');
  });

  it('editing a zoekcriterium keeps the untouched fields', async () => {
    const { api } = await mockApi();
    const target = (await api.fetchSearches())[0];

    await api.updateSearch(target.id, { q: 'gewijzigde term' });

    const updated = (await api.fetchSearches()).find((x) => x.id === target.id);
    expect(updated?.query.q).toBe('gewijzigde term');
    expect(updated?.query.source).toEqual(target.query.source);
    expect(updated?.tags).toEqual(target.tags);
  });

  it('the notify bell sticks, including after a reload', async () => {
    const first = await mockApi();
    const target = (await first.api.fetchSearches())[0];

    await first.api.toggleSearchNotify(target.id, true);

    const { api } = await mockApi();
    expect((await api.fetchSearches()).find((x) => x.id === target.id)?.notify).toBe(true);
  });

  it('promoting a criterium to team sticks', async () => {
    const { api } = await mockApi();
    const personal = (await api.fetchSearches()).find((x) => x.scope === 'user');
    if (!personal) return; // fixture has none scoped to a user

    await api.promoteSearchToTenant(personal.id);

    expect((await api.fetchSearches()).find((x) => x.id === personal.id)?.scope).toBe('tenant');
  });

  it('deleting a criterium removes it', async () => {
    const { api } = await mockApi();
    const target = (await api.fetchSearches())[0];

    await api.deleteSavedSearch(target.id);

    expect((await api.fetchSearches()).map((x) => x.id)).not.toContain(target.id);
  });

  it('watching a dossier adds a watch row, and unwatching removes it', async () => {
    // Live models a watch as a saved-search row with an empty query; mock has to
    // match or the bell reads its state from somewhere the toggle never writes.
    const { api } = await mockApi();

    await api.watchDossier('stikstof');
    const watched = (await api.fetchSearches()).filter(
      (x) => x.dossierId === 'stikstof' && x.query.q === ''
    );
    expect(watched).toHaveLength(1);
    expect(watched[0].notify).toBe(true);

    await api.unwatchDossier('stikstof');
    expect(
      (await api.fetchSearches()).filter((x) => x.dossierId === 'stikstof' && x.query.q === '')
    ).toHaveLength(0);
  });

  it('watching twice does not add a second row', async () => {
    const { api } = await mockApi();

    await api.watchDossier('stikstof');
    await api.watchDossier('stikstof');

    expect(
      (await api.fetchSearches()).filter((x) => x.dossierId === 'stikstof' && x.query.q === '')
    ).toHaveLength(1);
  });

  it('a confirmed signal notifies a dossier watch', async () => {
    // The exact case reported: bell on for a dossier, confirm one of its
    // signals, expect a notification. fetchNotifications used to be hardcoded
    // to empty in mock mode, so nothing ever arrived however much you curated.
    const { api } = await mockApi();
    await api.watchDossier('stikstof');
    const target = (await api.fetchInbox()).data.find((s) => s.dossierId === 'stikstof');
    expect(target).toBeTruthy();

    await api.confirmSignal(target!.id);

    const { items, unseenCount } = await api.fetchNotifications();
    expect(items.map((n) => n.signalId)).toContain(target!.id);
    expect(unseenCount).toBeGreaterThan(0);
    expect(items[0].matchedSearches[0].label).toContain('dossier:');
  });

  it('does not notify for a dossier that is not watched', async () => {
    const { api } = await mockApi();
    const target = (await api.fetchInbox()).data.find((s) => s.dossierId === 'stikstof');

    await api.confirmSignal(target!.id);

    expect((await api.fetchNotifications()).items.map((n) => n.signalId)).not.toContain(target!.id);
  });

  it('a topic criterium with the bell on notifies on a term hit', async () => {
    const { api } = await mockApi();
    const target = (await api.fetchInbox()).data[0];
    const { id } = await api.createSearch({
      q: target.title.split(' ')[0],
      source: ['tk'],
      tags: [],
      dossierId: null,
      scope: 'user',
    });
    await api.toggleSearchNotify(id, true);

    await api.confirmSignal(target.id);

    expect((await api.fetchNotifications()).items.map((n) => n.signalId)).toContain(target.id);
  });

  it('acknowledging clears the unseen count and stays cleared after a reload', async () => {
    const first = await mockApi();
    await first.api.watchDossier('stikstof');
    const target = (await first.api.fetchInbox()).data.find((s) => s.dossierId === 'stikstof');
    await first.api.confirmSignal(target!.id);
    expect((await first.api.fetchNotifications()).unseenCount).toBeGreaterThan(0);

    await first.api.ackNotifications();

    const { api } = await mockApi();
    expect((await api.fetchNotifications()).unseenCount).toBe(0);
  });

  it('resetting puts the fixtures back', async () => {
    const { api, store } = await mockApi();
    const before = await api.fetchInboxCounts();
    const target = (await api.fetchInbox({ tab: 'politiek' })).data[0];
    await api.confirmSignal(target.id);
    expect((await api.fetchInboxCounts()).politiek).toBe(before.politiek - 1);

    store.resetMockDemoData();

    expect(await api.fetchInboxCounts()).toEqual(before);
  });
});

describe('fetchSignals', () => {
  it('mock mode: filters confirmed signals by tab and dossierId, sorted by relevance', async () => {
    const api = await freshApi({ signalsMock: true });

    const politiek = await api.fetchSignals({ tab: 'politiek' });
    expect(politiek.every((s) => s.tab === 'politiek')).toBe(true);

    const stikstof = await api.fetchSignals({ dossierId: 'stikstof' });
    expect(stikstof.every((s) => s.dossierId === 'stikstof')).toBe(true);

    const rels = (await api.fetchSignals()).map((s) => s.rel);
    expect(rels).toEqual([...rels].sort((a, b) => b - a));
  });

  it('live mode: requests confirmed signals with tab/dossierId query params', async () => {
    let receivedUrl = '';
    server.use(
      http.get('*/pa/signals', ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ success: true, data: [] });
      })
    );

    const api = await freshApi({ signalsMock: false });
    await api.fetchSignals({ tab: 'politiek', dossierId: 'stikstof' });

    expect(receivedUrl).toContain('status=confirmed');
    expect(receivedUrl).toContain('tab=politiek');
    expect(receivedUrl).toContain('dossierId=stikstof');
  });
});

describe('fetchInbox', () => {
  it('mock mode: filters the inbox fixture by tab and reports meta', async () => {
    const api = await freshApi({ signalsMock: true });

    const result = await api.fetchInbox({ tab: 'politiek' });

    expect(result.data.every((s) => s.tab === 'politiek')).toBe(true);
    expect(result.meta).toEqual({ total: result.data.length, cap: 100, capped: false });
  });

  it('live mode: requests candidate/ai_drafted signals and returns data + meta', async () => {
    server.use(
      http.get('*/pa/signals', () =>
        HttpResponse.json({ success: true, data: [], meta: { total: 0, cap: 100, capped: false } })
      )
    );

    const api = await freshApi({ signalsMock: false });
    const result = await api.fetchInbox();

    expect(result).toEqual({ data: [], meta: { total: 0, cap: 100, capped: false } });
  });
});

describe('fetchSearches', () => {
  it('mock mode: returns the seeded searches', async () => {
    const api = await freshApi({ signalsMock: true });
    const result = await api.fetchSearches();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('dossierId');
  });

  it('live mode: maps dossier_id (snake_case) to dossierId', async () => {
    server.use(
      http.get('*/pa/searches', () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: 's1',
              dossier_id: 'stikstof',
              query: { q: 'x', types: [], source: ['tk'] },
              tags: [],
              scope: 'user',
              notify: false,
            },
          ],
        })
      )
    );

    const api = await freshApi({ signalsMock: false });
    const result = await api.fetchSearches();

    expect(result[0].dossierId).toBe('stikstof');
  });
});

describe('fetchFeed', () => {
  it('mock mode: filters fixtures by title and source', async () => {
    const api = await freshApi({ signalsMock: true });

    const result = await api.fetchFeed({ q: 'stikstof', source: 'tk' });

    expect(result.items.every((it) => it.source === 'tk')).toBe(true);
    expect(result.items.every((it) => it.title.toLowerCase().includes('stikstof'))).toBe(true);
    expect(result.total).toBe(result.items.length);
  });

  it('live mode: sends q/source/top query params', async () => {
    let receivedUrl = '';
    server.use(
      http.get('*/pa/feed', ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ items: [], total: 0 });
      })
    );

    const api = await freshApi({ signalsMock: false });
    await api.fetchFeed({ q: 'stikstof', source: 'tk', top: 10 });

    expect(receivedUrl).toContain('q=stikstof');
    expect(receivedUrl).toContain('source=tk');
    expect(receivedUrl).toContain('top=10');
  });
});

describe('createSavedSearch / createSearch', () => {
  it('mock mode: returns a locally generated id without a network call', async () => {
    const api = await freshApi({ signalsMock: true });
    const result = await api.createSavedSearch({ q: 'stikstof' });
    expect(result.id).toMatch(/^srch-mock-/);
  });

  it('live mode createSavedSearch: posts with default source and empty tags', async () => {
    let receivedBody: unknown;
    server.use(
      http.post('*/pa/searches', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ success: true, data: { id: 'srch-1' } });
      })
    );

    const api = await freshApi({ signalsMock: false });
    await api.createSavedSearch({ q: 'stikstof', dossierId: 'stikstof' });

    expect(receivedBody).toMatchObject({
      scope: 'user',
      dossierId: 'stikstof',
      query: { q: 'stikstof', types: [], source: ['tk', 'ob'] },
      tags: [],
    });
  });

  it('live mode createSearch: posts with the given scope and tags', async () => {
    let receivedBody: unknown;
    server.use(
      http.post('*/pa/searches', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ success: true, data: { id: 'srch-2' } });
      })
    );

    const api = await freshApi({ signalsMock: false });
    await api.createSearch({
      q: 'energie',
      source: ['tk'],
      tags: ['energie'],
      dossierId: null,
      scope: 'tenant',
    });

    expect(receivedBody).toMatchObject({
      scope: 'tenant',
      dossierId: null,
      query: { q: 'energie', types: [], source: ['tk'] },
      tags: ['energie'],
    });
  });
});

describe('promoteToInbox', () => {
  const feedItem: FeedItem = {
    id: 'f1',
    title: 'Stikstof debat',
    type: 'Motie',
    number: '2026D1',
    date: null,
    url: 'https://example.com',
    source: 'ob',
  };

  it('mock mode: builds a candidate signal, mapping ob source to the regionaal tab', async () => {
    const api = await freshApi({ signalsMock: true });

    const result = await api.promoteToInbox(feedItem);

    expect(result).toMatchObject({ tab: 'regionaal', status: 'candidate', title: feedItem.title });
  });

  it('live mode: posts the feed item to /pa/signals', async () => {
    server.use(
      http.post('*/pa/signals', async ({ request }) => {
        const body = (await request.json()) as FeedItem;
        return HttpResponse.json({ success: true, data: { ...body, status: 'candidate' } });
      })
    );

    const api = await freshApi({ signalsMock: false });
    const result = await api.promoteToInbox(feedItem);

    expect(result.status).toBe('candidate');
  });
});

describe('fetchFeedSources', () => {
  it('mock mode: returns the fixed source list', async () => {
    const api = await freshApi({ signalsMock: true });
    expect(await api.fetchFeedSources()).toEqual(['tk', 'ob', 'media']);
  });

  it('live mode: derives sources from the keys of /pa/types', async () => {
    server.use(
      http.get('*/pa/types', () => HttpResponse.json({ success: true, data: { tk: [], eu: [] } }))
    );

    const api = await freshApi({ signalsMock: false });
    expect(await api.fetchFeedSources()).toEqual(['tk', 'eu']);
  });

  it('live mode: falls back to tk/ob when the request fails', async () => {
    server.use(http.get('*/pa/types', () => HttpResponse.json({}, { status: 500 })));

    const api = await freshApi({ signalsMock: false });
    expect(await api.fetchFeedSources()).toEqual(['tk', 'ob']);
  });
});

describe('updateSearch', () => {
  it('mock mode: is a no-op', async () => {
    const api = await freshApi({ signalsMock: true });
    await expect(api.updateSearch('s1', { q: 'x' })).resolves.toBeUndefined();
  });

  it('live mode: only includes explicitly provided fields in the patch body', async () => {
    let receivedBody: unknown;
    server.use(
      http.patch('*/pa/searches/s1', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ success: true, data: {} });
      })
    );

    const api = await freshApi({ signalsMock: false });
    await api.updateSearch('s1', { tags: ['stikstof'] });

    expect(receivedBody).toEqual({ tags: ['stikstof'] });
  });
});

describe('no-op-in-mock-mode write helpers', () => {
  it('deleteSavedSearch, promoteSearchToTenant, toggleSearchNotify, watchDossier, unwatchDossier, ackNotifications resolve without a network call in mock mode', async () => {
    const api = await freshApi({ signalsMock: true });

    await expect(api.deleteSavedSearch('s1')).resolves.toBeUndefined();
    await expect(api.promoteSearchToTenant('s1')).resolves.toBeUndefined();
    await expect(api.toggleSearchNotify('s1', true)).resolves.toBeUndefined();
    await expect(api.watchDossier('d1')).resolves.toBeUndefined();
    await expect(api.unwatchDossier('d1')).resolves.toBeUndefined();
    await expect(api.ackNotifications()).resolves.toBeUndefined();
  });
});

describe('fetchNotifications', () => {
  it('mock mode: returns an empty inbox', async () => {
    const api = await freshApi({ signalsMock: true });
    expect(await api.fetchNotifications()).toEqual({ items: [], unseenCount: 0 });
  });

  it('live mode: adds unseen=true and unwraps meta.unseenCount', async () => {
    let receivedUrl = '';
    server.use(
      http.get('*/pa/notifications', ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ success: true, data: [], meta: { unseenCount: 3 } });
      })
    );

    const api = await freshApi({ signalsMock: false });
    const result = await api.fetchNotifications(true);

    expect(receivedUrl).toContain('unseen=true');
    expect(result.unseenCount).toBe(3);
  });
});

describe('ackNotifications live mode', () => {
  it('sends the given ids, or an empty body when omitted', async () => {
    let receivedBody: unknown;
    server.use(
      http.post('*/pa/notifications/ack', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ success: true, data: null });
      })
    );

    const api = await freshApi({ signalsMock: false });
    await api.ackNotifications(['n1', 'n2']);
    expect(receivedBody).toEqual({ ids: ['n1', 'n2'] });

    await api.ackNotifications();
    expect(receivedBody).toEqual({});
  });
});

describe('fetchFeedToken', () => {
  it('mock mode: returns a stub token', async () => {
    const api = await freshApi({ signalsMock: true });
    expect(await api.fetchFeedToken()).toEqual({ token: 'mock', url: '' });
  });

  it('live mode: fetches the token from the backend', async () => {
    server.use(
      http.get('*/pa/feed-token', () =>
        HttpResponse.json({ success: true, data: { token: 'abc', url: 'https://x/feed' } })
      )
    );

    const api = await freshApi({ signalsMock: false });
    expect(await api.fetchFeedToken()).toEqual({ token: 'abc', url: 'https://x/feed' });
  });
});

describe('fetchDossiers / fetchDossier', () => {
  it('mock mode: fetchDossiers returns the static fixture list', async () => {
    const api = await freshApi({ dossiersMock: true });
    expect((await api.fetchDossiers()).length).toBeGreaterThan(0);
  });

  it('mock mode: fetchDossier finds by id or returns undefined', async () => {
    const api = await freshApi({ dossiersMock: true });
    const all = await api.fetchDossiers();
    expect(await api.fetchDossier(all[0].id)).toEqual(all[0]);
    expect(await api.fetchDossier('does-not-exist')).toBeUndefined();
  });

  it('live mode: fetchDossiers hits GET /pa/dossiers', async () => {
    server.use(http.get('*/pa/dossiers', () => HttpResponse.json({ success: true, data: [] })));

    const api = await freshApi({ dossiersMock: false });
    expect(await api.fetchDossiers()).toEqual([]);
  });

  it('live mode: fetchDossier returns undefined instead of throwing on a failed request', async () => {
    server.use(http.get('*/pa/dossiers/nope', () => HttpResponse.json({}, { status: 404 })));

    const api = await freshApi({ dossiersMock: false });
    expect(await api.fetchDossier('nope')).toBeUndefined();
  });
});

describe('fetchAgenda', () => {
  it('mock mode: returns the static agenda fixture', async () => {
    const api = await freshApi({ agendaMock: true });
    expect((await api.fetchAgenda()).length).toBeGreaterThan(0);
  });

  it('live mode: hits GET /pa/agenda', async () => {
    server.use(http.get('*/pa/agenda', () => HttpResponse.json({ success: true, data: [] })));
    const api = await freshApi({ agendaMock: false });
    expect(await api.fetchAgenda()).toEqual([]);
  });
});

describe('fetchSourcesStatus', () => {
  it('mock mode: reports every source as up', async () => {
    const api = await freshApi({ signalsMock: true });
    const status = await api.fetchSourcesStatus();
    expect(status).toMatchObject({ tk: true, ob: true, eu: true, epTeksten: true, media: true });
    expect(status.feeds.length).toBeGreaterThan(0);
  });

  it('live mode: hits GET /pa/sources/status', async () => {
    server.use(
      http.get('*/pa/sources/status', () =>
        HttpResponse.json({
          success: true,
          data: { tk: false, ob: false, eu: false, epTeksten: false, media: false, feeds: [] },
        })
      )
    );
    const api = await freshApi({ signalsMock: false });
    expect((await api.fetchSourcesStatus()).tk).toBe(false);
  });
});

describe('triggerCurationCycle', () => {
  it('always posts to /pa/curator/run regardless of mock flags', async () => {
    server.use(
      http.post('*/pa/curator/run', () =>
        HttpResponse.json({ success: true, data: { started: true, tenantId: 't1' } })
      )
    );

    const api = await freshApi({ signalsMock: true });
    expect(await api.triggerCurationCycle()).toEqual({ started: true, tenantId: 't1' });
  });
});

describe('confirmSignal', () => {
  it('mock mode: merges the patch onto the matching inbox fixture and marks it confirmed', async () => {
    const api = await freshApi({ signalsMock: true });

    const result = await api.confirmSignal('in1', { rel: 10 });

    expect(result.status).toBe('confirmed');
    expect(result.rel).toBe(10);
  });

  it('mock mode: routes to the watchlist when the signal has no dossierId', async () => {
    const api = await freshApi({ signalsMock: true });

    const result = await api.confirmSignal('in9');

    expect(result.routing).toBe('watchlist');
  });

  it('mock mode: throws for an unknown signal id', async () => {
    const api = await freshApi({ signalsMock: true });
    await expect(api.confirmSignal('does-not-exist')).rejects.toThrow('not found');
  });

  it('live mode: posts the patch to /pa/signals/:id/confirm', async () => {
    server.use(
      http.post('*/pa/signals/sig-1/confirm', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({
          success: true,
          data: { id: 'sig-1', status: 'confirmed', ...(body as object) },
        });
      })
    );

    const api = await freshApi({ signalsMock: false });
    const result = await api.confirmSignal('sig-1', { rel: 7 });

    expect(result.status).toBe('confirmed');
    expect(result.rel).toBe(7);
  });
});

describe('linkSignalDossier', () => {
  it('mock mode: links a signal found in either fixture list and clears routing', async () => {
    const api = await freshApi({ signalsMock: true });

    const result = await api.linkSignalDossier('sg1', 'lelystad');

    expect(result.dossierId).toBe('lelystad');
    expect(result.routing).toBeNull();
  });

  it('mock mode: throws for an unknown signal id', async () => {
    const api = await freshApi({ signalsMock: true });
    await expect(api.linkSignalDossier('does-not-exist', 'lelystad')).rejects.toThrow('not found');
  });

  it('live mode: patches the signal with the new dossierId', async () => {
    server.use(
      http.patch('*/pa/signals/sig-1', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({ success: true, data: { id: 'sig-1', ...(body as object) } });
      })
    );

    const api = await freshApi({ signalsMock: false });
    const result = await api.linkSignalDossier('sig-1', 'stikstof');

    expect(result.dossierId).toBe('stikstof');
  });
});

describe('host configuration', () => {
  it('fails with a named error when no host has been configured', async () => {
    vi.stubEnv('VITE_PA_DOSSIERS_MOCK', 'false');
    vi.resetModules();
    const { __resetPaCockpitHostForTests } = await import('../host');
    __resetPaCockpitHostForTests();

    const api = await import('./pa.api');

    await expect(api.fetchDossiers()).rejects.toThrow(/configurePaCockpit/);
  });
});
