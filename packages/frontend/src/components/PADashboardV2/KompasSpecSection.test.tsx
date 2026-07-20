// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import KompasSpecSection from './KompasSpecSection';
import { KOMPAS_CRITERIA, KOMPAS_BANDS, kompasMax } from '../../pages/public-affairs-v2/pa.data';

describe('KompasSpecSection', () => {
  it('renders a table row for every criterion', () => {
    render(<KompasSpecSection />);
    for (const c of KOMPAS_CRITERIA) {
      expect(screen.getByText(c.name)).toBeInTheDocument();
    }
  });

  it("renders a table row for every band, and the top band's range ends at the max score", () => {
    const { container } = render(<KompasSpecSection />);
    for (const band of KOMPAS_BANDS) {
      expect(screen.getByText(band.label)).toBeInTheDocument();
    }
    const firstRange = container.querySelector('.pac-spec-range');
    expect(firstRange).toHaveTextContent(`–${kompasMax()}`);
  });
});
