// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WBars, WColumns, WDonut, WGauge, WTrend } from './charts';

describe('WBars', () => {
  it('renders a row per input with the value and an optional unit', () => {
    render(
      <WBars
        rows={[
          { naam: 'A', n: 10 },
          { naam: 'B', n: 5 },
        ]}
        unit="%"
      />
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});

describe('WColumns', () => {
  it('renders a labelled column pair per data point', () => {
    render(<WColumns data={[{ m: 'Jan', in: 20, uit: 15 }]} />);
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });
});

describe('WTrend', () => {
  it('renders an accessible SVG with a point label per data point', () => {
    render(
      <WTrend
        points={[
          { x: 0, label: 'Jan', y: 10 },
          { x: 1, label: 'Feb', y: 20 },
        ]}
        label="Test trend"
      />
    );
    expect(screen.getByRole('img', { name: 'Test trend' })).toBeInTheDocument();
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Feb')).toBeInTheDocument();
  });
});

describe('WGauge', () => {
  it('shows the value and target percentages', () => {
    render(<WGauge value={87} target={90} />);
    expect(screen.getByText('87%')).toBeInTheDocument();
    expect(screen.getByText('doel 90%')).toBeInTheDocument();
  });

  it('defaults the target to 90 when not provided', () => {
    render(<WGauge value={50} />);
    expect(screen.getByText('doel 90%')).toBeInTheDocument();
  });
});

describe('WDonut', () => {
  it('shows the total of the segment values in the centre', () => {
    render(
      <WDonut
        segments={[
          { naam: 'A', n: 30, color: '#000' },
          { naam: 'B', n: 70, color: '#fff' },
        ]}
      />
    );
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('appends a percent sign when segments use pct instead of n', () => {
    render(
      <WDonut
        segments={[
          { naam: 'A', pct: 40, color: '#000' },
          { naam: 'B', pct: 60, color: '#fff' },
        ]}
      />
    );
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
