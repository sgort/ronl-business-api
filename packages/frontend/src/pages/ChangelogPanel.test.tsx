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
// changelog-data.ts renders 60+ real version entries, so these tests are
// genuinely slow rather than unreliable. 15s was enough in isolation but not
// inside a full `npm test` run, where Vitest saturates every core with
// parallel test files and this one was observed taking 22s. A timeout exists
// to catch a hang, not to assert a speed, so raising it costs no coverage —
// see simEngine.test.ts for the one place where a real budget is asserted.
vi.setConfig({ testTimeout: 60000 });

afterEach(() => {
  document.body.style.overflow = '';
});

// A plain `name.includes('v2026.08.1')` also matches 'v2026.08.13' (and any
// other version the string is a prefix of) — harmless while every patch
// stayed single-digit, but the release history now has 2026.08.1 alongside
// 2026.08.10-13, so a bare substring check is ambiguous. Require the version
// not be immediately followed by another digit.
function versionButtonName(version: string) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`v${escaped}(?!\\d)`);
  return (name: string) => pattern.test(name);
}

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
      name: versionButtonName(latest.version),
    });
    expect(latestToggle).toHaveAttribute('aria-expanded', 'true');

    // Every version gets its own toggle button.
    const versionButtons = changelog.versions.map((v) =>
      screen.getByRole('button', { name: versionButtonName(v.version) })
    );
    expect(versionButtons).toHaveLength(changelog.versions.length);
  });

  it('clicking a collapsed version expands it, clicking again collapses it', async () => {
    const user = userEvent.setup();
    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    const second = changelog.versions[1];
    const toggle = screen.getByRole('button', {
      name: versionButtonName(second.version),
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
      name: versionButtonName(commitVersion.version),
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
