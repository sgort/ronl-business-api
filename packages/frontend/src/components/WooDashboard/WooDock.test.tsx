// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WooDock from './WooDock';
import { WOO_SUGGESTIES } from '../../pages/woo/woo.data';

describe('WooDock', () => {
  it('renders every suggestion and the question input', () => {
    render(<WooDock onClose={vi.fn()} />);

    for (const s of WOO_SUGGESTIES) {
      expect(screen.getByText(s.eyebrow)).toBeInTheDocument();
      expect(screen.getByText(s.text)).toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText('Stel een vraag…')).toBeInTheDocument();
  });

  it('clicking the close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<WooDock onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '×' }));

    expect(onClose).toHaveBeenCalled();
  });
});
