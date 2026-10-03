import { describe, it, expect } from 'vitest';
import { problemMessage } from './problem';

describe('problemMessage', () => {
  it("returns an RFC 9457 problem's detail", () => {
    expect(
      problemMessage(
        {
          type: 'about:blank',
          status: 404,
          title: 'Item not found',
          detail: 'Item niet gevonden.',
          instance: '/v1/public/regels/x',
          code: 'ITEM_NOT_FOUND',
        },
        'fallback'
      )
    ).toBe('Item niet gevonden.');
  });

  it("returns a legacy envelope's error.message", () => {
    expect(problemMessage({ success: false, error: { message: 'boom' } }, 'fallback')).toBe('boom');
  });

  it.each([
    ['null', null],
    ['a string', 'Bad gateway'],
    ['an empty object', {}],
    ['a problem with an empty detail', { status: 500, title: 't', detail: '' }],
    ['a detail without status/title', { detail: 'not a problem' }],
    ['an envelope with a null error', { success: false, error: null }],
    ['an envelope with a non-string message', { error: { message: 1 } }],
  ])('falls back for %s', (_label, body) => {
    expect(problemMessage(body, 'request failed')).toBe('request failed');
  });
});
