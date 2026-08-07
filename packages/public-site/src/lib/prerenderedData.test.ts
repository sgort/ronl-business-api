import { describe, it, expect, afterEach } from 'vitest';
import { readPrerenderedData } from './prerenderedData';

function setBlob(content: string | null) {
  document.getElementById('__PUB_DATA__')?.remove();
  if (content !== null) {
    const s = document.createElement('script');
    s.id = '__PUB_DATA__';
    s.type = 'application/json';
    s.textContent = content;
    document.body.appendChild(s);
  }
}

afterEach(() => setBlob(null));

describe('readPrerenderedData', () => {
  it('returns the embedded data when the blob matches the requested route', () => {
    setBlob(JSON.stringify({ route: '/regels', data: { services: [{ title: 'X' }] } }));
    expect(readPrerenderedData<{ services: unknown[] }>('/regels')).toEqual({
      services: [{ title: 'X' }],
    });
  });

  it('returns null when the blob is for a different route (stale SPA navigation)', () => {
    setBlob(JSON.stringify({ route: '/processen', data: { a: 1 } }));
    expect(readPrerenderedData('/regels')).toBeNull();
  });

  it('returns null when no blob is present', () => {
    expect(readPrerenderedData('/regels')).toBeNull();
  });

  it('returns null (never throws) when the blob is malformed', () => {
    setBlob('{ not valid json');
    expect(readPrerenderedData('/regels')).toBeNull();
  });

  it('is pure — repeated reads return the same data (safe for a useState lazy init under StrictMode)', () => {
    setBlob(JSON.stringify({ route: '/regels', data: { ok: true } }));
    expect(readPrerenderedData<{ ok: boolean }>('/regels')).toEqual({ ok: true });
    expect(readPrerenderedData<{ ok: boolean }>('/regels')).toEqual({ ok: true });
  });
});
