import type { ReactNode } from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useQueryState } from './useQueryState';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/zoeken?q=zorg&soort=regel%2Cproduct&sort=az']}>{children}</MemoryRouter>;
}

describe('useQueryState', () => {
  it('parses q, csv facets and sort from the URL', () => {
    const { result } = renderHook(() => useQueryState(), { wrapper });
    expect(result.current[0]).toEqual({
      q: 'zorg',
      soort: ['regel', 'product'],
      bron: [],
      doelgroep: [],
      sort: 'az',
    });
  });

  it('defaults to an empty query when no params are present', () => {
    const { result } = renderHook(() => useQueryState(), {
      wrapper: ({ children }) => <MemoryRouter initialEntries={['/zoeken']}>{children}</MemoryRouter>,
    });
    expect(result.current[0]).toEqual({ q: '', soort: [], bron: [], doelgroep: [], sort: 'rel' });
  });

  it('setQuery merges and re-serialises into the URL', () => {
    const { result } = renderHook(() => useQueryState(), { wrapper });
    act(() => result.current[1]({ soort: ['proces'] }));
    expect(result.current[0].soort).toEqual(['proces']);
    expect(result.current[0].q).toBe('zorg'); // untouched fields survive the merge
  });
});
