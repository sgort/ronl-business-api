// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KompasScorer from './KompasScorer';
import { KOMPAS_CRITERIA, kompasMax } from '../../../pages/public-affairs-v2/pa.data';

describe('KompasScorer', () => {
  it('shows the summed total and max out of every criterion', () => {
    render(
      <KompasScorer
        kompas={{ opgaven: { score: 2, duiding: '' }, momentum: { score: 1, duiding: '' } }}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(`/ ${kompasMax()}`)).toBeInTheDocument();
  });

  it('clicking a score button calls onChange with that criterion updated', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<KompasScorer kompas={{}} onChange={onChange} />);

    const opgavenRow = screen.getByText(KOMPAS_CRITERIA[0].short).closest('.pac-db-krit')!;
    const twoButton = Array.from(opgavenRow.querySelectorAll('button')).find(
      (b) => b.textContent === '2'
    )!;
    await user.click(twoButton);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ [KOMPAS_CRITERIA[0].key]: { duiding: '', score: 2 } })
    );
  });

  it('typing a duiding calls onChange, preserving the existing score', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<KompasScorer kompas={{ opgaven: { score: 2, duiding: '' } }} onChange={onChange} />);

    const opgavenRow = screen.getByText(KOMPAS_CRITERIA[0].short).closest('.pac-db-krit')!;
    const input = opgavenRow.querySelector('input') as HTMLInputElement;
    await user.type(input, 'x');

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ opgaven: { score: 2, duiding: 'x' } })
    );
  });

  it('readOnly disables score buttons and makes the duiding input read-only', () => {
    const { container } = render(<KompasScorer kompas={{}} onChange={vi.fn()} readOnly />);

    expect(container.querySelectorAll('.pac-db-scoreseg button[disabled]').length).toBe(
      KOMPAS_CRITERIA.length * 3
    );
    const firstInput = container.querySelector('.pac-db-krit-duiding input') as HTMLInputElement;
    expect(firstInput).toHaveAttribute('readonly');
  });
});
