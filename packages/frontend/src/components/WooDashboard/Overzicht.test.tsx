// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Overzicht from './Overzicht';
import { WOO_KPIS, WOO_TENANT } from '../../pages/woo/woo.data';

describe('Overzicht', () => {
  it('renders the tenant name and a KPI card for every WOO_KPIS entry', () => {
    const { container } = render(<Overzicht />);

    expect(screen.getByText(`Overzicht · ${WOO_TENANT.displayName}`)).toBeInTheDocument();
    const kpiValues = Array.from(container.querySelectorAll('.w-kpi-val')).map(
      (el) => el.textContent
    );
    for (const k of WOO_KPIS) {
      expect(screen.getByText(k.label)).toBeInTheDocument();
      expect(kpiValues).toContain(k.value);
    }
  });
});
