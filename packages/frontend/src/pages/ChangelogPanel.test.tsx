// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangelogPanel from './ChangelogPanel';
import { changelog } from './changelog-data';

// changelog-data.ts carries the project's real, ever-growing release history
// (60+ versions) — rendering every collapsed card is real DOM work that can
// cross the 5s default under full-suite CPU contention. Give this file more
// headroom rather than trimming the fixture down to something unrealistic.
vi.setConfig({ testTimeout: 15000 });

afterEach(() => {
  document.body.style.overflow = '';
});

describe('ChangelogPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ChangelogPanel isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('when open, shows a version card for every release with the latest one expanded', () => {
    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const latest = changelog.versions[0];
    const latestToggle = screen.getByRole('button', {
      name: (name) => name.includes(`v${latest.version}`),
    });
    expect(latestToggle).toHaveAttribute('aria-expanded', 'true');

    // Every version gets its own toggle button.
    const versionButtons = changelog.versions.map((v) =>
      screen.getByRole('button', { name: (name) => name.includes(`v${v.version}`) })
    );
    expect(versionButtons).toHaveLength(changelog.versions.length);
  });

  it('clicking a collapsed version expands it, clicking again collapses it', async () => {
    const user = userEvent.setup();
    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    const second = changelog.versions[1];
    const toggle = screen.getByRole('button', {
      name: (name) => name.includes(`v${second.version}`),
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('the close (×) button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChangelogPanel isOpen onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close changelog' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the overlay calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<ChangelogPanel isOpen onClose={onClose} />);

    await user.click(container.querySelector('[aria-hidden="true"]')!);

    expect(onClose).toHaveBeenCalled();
  });

  it('pressing Escape calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ChangelogPanel isOpen onClose={onClose} />);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('locks body scroll while open and restores it on close', () => {
    const { rerender } = render(<ChangelogPanel isOpen onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<ChangelogPanel isOpen={false} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('a per-commit format version shows its commit subjects and sha/author trailer', async () => {
    const commitVersion = changelog.versions.find((v) => 'format' in v && v.format === 'commits');
    if (!commitVersion || !('commits' in commitVersion)) return;

    const user = userEvent.setup();
    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    const toggle = screen.getByRole('button', {
      name: (name) => name.includes(`v${commitVersion.version}`),
    });
    if (toggle.getAttribute('aria-expanded') === 'false') {
      // Only expand if not already the default-open latest version.
      await user.click(toggle);
    }

    const firstCommit = commitVersion.commits[0];
    expect(screen.getByText(firstCommit.subject)).toBeInTheDocument();
    expect(screen.getByText(`${firstCommit.sha} — ${firstCommit.author}`)).toBeInTheDocument();
  });
});
