import { describe, it, expect } from 'vitest';
import { hrefFor } from './slug';

describe('hrefFor', () => {
  it('builds the per-type detail path', () => {
    expect(hrefFor({ type: 'bericht', slug: 'b1' })).toBe('/berichten/b1');
    expect(hrefFor({ type: 'nieuws', slug: 'n1' })).toBe('/nieuws/n1');
    expect(hrefFor({ type: 'product', slug: 'p1' })).toBe('/producten/p1');
    expect(hrefFor({ type: 'regel', slug: 'zorgtoeslag' })).toBe('/regels/zorgtoeslag');
    expect(hrefFor({ type: 'proces', slug: 'zorgtoeslag-process' })).toBe(
      '/processen/zorgtoeslag-process'
    );
  });
});
