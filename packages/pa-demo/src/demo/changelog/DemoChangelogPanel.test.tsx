// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DemoChangelogPanel from './DemoChangelogPanel';
import { DEMO_CHANGELOG } from './changelog.data';

describe('DemoChangelogPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<DemoChangelogPanel isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows every release expanded, because eight entries do not need collapsing', () => {
    // The product panel collapses because it carries 90-odd releases. Eight is
    // short enough that a chevron per entry is friction with nothing bought.
    render(<DemoChangelogPanel isOpen onClose={vi.fn()} />);
    for (const release of DEMO_CHANGELOG) {
      expect(screen.getByText(release.title)).toBeVisible();
      expect(screen.getByText(release.items[0])).toBeVisible();
    }
  });

  it('shows no engineering metadata', () => {
    // The whole reason this panel exists rather than the product one.
    const { container } = render(<DemoChangelogPanel isOpen onClose={vi.fn()} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/Frontend \+ Backend|Full-stack/);
    expect(text).not.toMatch(/GitLab/i);
    expect(container.querySelector('a[href*="git."]')).toBeNull();
  });

  it('closes on the close button and on Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DemoChangelogPanel isOpen onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /sluiten/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('restores body scroll when it closes', () => {
    // The product panel locks body scroll while open; a panel that locks and
    // never unlocks leaves the page dead with no visible cause.
    const { rerender } = render(<DemoChangelogPanel isOpen onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<DemoChangelogPanel isOpen={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('');
  });
});
