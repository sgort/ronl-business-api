// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WooSectionRouter from './WooSectionRouter';
import type { WooFilters } from '../../pages/woo/woo.data';

vi.mock('./Overzicht', () => ({ default: () => <div>overzicht</div> }));
vi.mock('./Verzoeken', () => ({ default: () => <div>verzoeken</div> }));
vi.mock('./Tijdigheid', () => ({ default: () => <div>tijdigheid</div> }));
vi.mock('./Proces', () => ({ default: () => <div>proces</div> }));
vi.mock('./Publicatie', () => ({ default: () => <div>publicatie</div> }));
vi.mock('./Bezwaar', () => ({ default: () => <div>bezwaar</div> }));

const mockRegister = vi.hoisted(() => vi.fn());
vi.mock('./Register', () => ({
  default: (props: never) => {
    mockRegister(props);
    return <div>register</div>;
  },
}));

const emptyFilters: WooFilters = {};

describe('WooSectionRouter', () => {
  it.each([
    ['overzicht', 'overzicht'],
    ['verzoeken', 'verzoeken'],
    ['tijdigheid', 'tijdigheid'],
    ['proces', 'proces'],
    ['publicatie', 'publicatie'],
  ] as const)('routes tab "%s" to its section component', (tab, text) => {
    render(
      <WooSectionRouter
        tab={tab}
        registerOpen={false}
        filters={emptyFilters}
        onResetFilters={vi.fn()}
      />
    );
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('falls back to Bezwaar for an unrecognised tab', () => {
    render(
      <WooSectionRouter
        tab={'unknown' as never}
        registerOpen={false}
        filters={emptyFilters}
        onResetFilters={vi.fn()}
      />
    );
    expect(screen.getByText('bezwaar')).toBeInTheDocument();
  });

  it('registerOpen takes priority over the active tab, passing filtered rows and the reset handler', () => {
    const onResetFilters = vi.fn();
    render(
      <WooSectionRouter
        tab="overzicht"
        registerOpen
        filters={{ status: 'open' }}
        onResetFilters={onResetFilters}
      />
    );

    expect(screen.getByText('register')).toBeInTheDocument();
    expect(screen.queryByText('overzicht')).not.toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { status: 'open' },
        onReset: onResetFilters,
        rows: expect.any(Array),
      })
    );
  });
});
