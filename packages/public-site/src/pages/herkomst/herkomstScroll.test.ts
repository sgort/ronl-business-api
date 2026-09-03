// packages/public-site/src/pages/herkomst/herkomstScroll.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrollToId } from './herkomstScroll';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('scrollToId', () => {
  it('scrolls the named element to 20px below the top of the viewport', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });

    const el = document.createElement('section');
    el.id = 'pijplijn';
    document.body.appendChild(el);
    // jsdom gives every element a zero rect, so the offset under test has to be
    // supplied explicitly -- otherwise the assertion below would pass for any
    // arithmetic that happens to yield 0.
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 120 } as DOMRect);

    scrollToId('pijplijn');

    // 300 (current scroll) + 120 (distance to the element) - 20 (breathing room)
    expect(scrollTo).toHaveBeenCalledWith({ top: 400, behavior: 'smooth' });
    vi.unstubAllGlobals();
  });

  it('does nothing when no element carries that id', () => {
    // The jump-links are rendered before the sections they point at exist on a
    // route that has not finished mounting; a missing target must be a no-op
    // rather than a TypeError on null.
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    expect(() => scrollToId('does-not-exist')).not.toThrow();
    expect(scrollTo).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
