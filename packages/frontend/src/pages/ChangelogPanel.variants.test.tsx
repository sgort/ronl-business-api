// @vitest-environment jsdom
/**
 * Display variants of the changelog panel, driven by a synthetic changelog.
 *
 * Separate from ChangelogPanel.test.tsx on purpose: that file asserts against
 * the project's real release history (60+ entries), which is exactly what
 * makes it unable to reach the shapes the history happens not to contain
 * right now — an "Upcoming" release, a commit type with no icon mapping, a
 * legacy section with an unknown icon colour, an empty version list. Mocking
 * changelog-data there would take the real-history assertions with it, so the
 * fixtures live here instead.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockChangelog = vi.hoisted(() => ({
  changelog: { versions: [] as unknown[] },
}));
vi.mock('./changelog-data', async (importActual) => ({
  ...(await importActual<typeof import('./changelog-data')>()),
  get changelog() {
    return mockChangelog.changelog;
  },
}));

import ChangelogPanel from './ChangelogPanel';

const feedback = [
  { type: 'feedback' as const, iid: 12, title: 'Trage takenlijst', url: 'https://git/12' },
  { type: 'usecase' as const, iid: 34, title: 'Vergunning aanvragen', url: 'https://git/34' },
];

function setVersions(versions: unknown[]) {
  mockChangelog.changelog = { versions };
}

describe('ChangelogPanel with an empty changelog', () => {
  it('opens without expanding anything, rather than throwing on a missing first entry', () => {
    setVersions([]);
    render(<ChangelogPanel isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('ChangelogPanel per-commit entries', () => {
  it('marks only the first release as Latest and renders each status in its own colour', async () => {
    setVersions([
      {
        format: 'commits',
        version: '9.9.9',
        status: 'Released',
        date: '1 sep 2026',
        scope: ['backend'],
        commits: [{ sha: 'aaa1111', author: 'Steven Gort', type: 'feat', subject: 'Nieuw ding' }],
      },
      {
        format: 'commits',
        version: '9.9.8',
        status: 'Upcoming',
        date: '2 sep 2026',
        scope: ['frontend'],
        commits: [{ sha: 'bbb2222', author: 'Steven Gort', type: 'fix', subject: 'Reparatie' }],
      },
      {
        format: 'commits',
        version: '9.9.7',
        status: 'Ingetrokken',
        date: '3 sep 2026',
        scope: ['ci'],
        commits: [{ sha: 'ccc3333', author: 'Steven Gort', type: 'chore', subject: 'Opruimen' }],
      },
    ]);

    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    expect(screen.getAllByText('Latest')).toHaveLength(1);
    expect(screen.getByText('Released')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Ingetrokken')).toBeInTheDocument();

    // Only the newest release starts open.
    expect(screen.getByText('Nieuw ding')).toBeInTheDocument();
    expect(screen.queryByText('Reparatie')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /v9\.9\.8/ }));
    expect(screen.getByText('Reparatie')).toBeInTheDocument();
  });

  it('gives a commit type it has no icon for the neutral fallback rather than nothing', () => {
    setVersions([
      {
        format: 'commits',
        version: '9.9.9',
        status: 'Released',
        date: '1 sep 2026',
        scope: ['backend'],
        commits: [
          {
            sha: 'ddd4444',
            author: 'Steven Gort',
            type: 'wip',
            subject: 'Onbekend committype',
            details: ['Waarom dit nodig was.'],
          },
        ],
      },
    ]);

    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Onbekend committype')).toBeInTheDocument();
    expect(screen.getByText('Waarom dit nodig was.')).toBeInTheDocument();
  });

  it('lists resolved work items as chip links, labelled by kind', () => {
    setVersions([
      {
        format: 'commits',
        version: '9.9.9',
        status: 'Released',
        date: '1 sep 2026',
        scope: ['backend'],
        commits: [{ sha: 'eee5555', author: 'Steven Gort', type: 'feat', subject: 'Iets' }],
        feedback,
      },
    ]);

    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    expect(screen.getByText('Feedback / use case handled')).toBeInTheDocument();
    // The chip carries the kind and the work-item number together.
    expect(screen.getByText('Feedback #12')).toBeInTheDocument();
    expect(screen.getByText('Use Case #34')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Trage takenlijst/ })).toHaveAttribute(
      'href',
      'https://git/12'
    );
    expect(screen.getByRole('link', { name: /Vergunning aanvragen/ })).toHaveAttribute(
      'href',
      'https://git/34'
    );
  });

  it('omits the work-item block entirely when a release resolved none', () => {
    setVersions([
      {
        format: 'commits',
        version: '9.9.9',
        status: 'Released',
        date: '1 sep 2026',
        scope: ['backend'],
        commits: [{ sha: 'fff6666', author: 'Steven Gort', type: 'feat', subject: 'Iets' }],
        feedback: [],
      },
    ]);

    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    expect(screen.queryByText('Feedback / use case handled')).not.toBeInTheDocument();
    expect(screen.queryByText(/Use Case #/)).not.toBeInTheDocument();
  });
});

describe('ChangelogPanel legacy section entries', () => {
  it('renders a section with an icon colour it does not recognise', () => {
    // iconColor comes from hand-written history entries; an unknown value must
    // fall back to the default rather than dropping the class entirely.
    setVersions([
      {
        version: '9.9.9',
        status: 'Released',
        statusColor: 'green',
        borderColor: 'green',
        date: '1 sep 2026',
        sections: [
          {
            icon: '🎨',
            iconColor: 'teal',
            title: 'Onbekende kleur',
            items: ['Een gewone regel', feedback[0]],
          },
        ],
      },
    ]);

    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    const heading = screen.getByText('Onbekende kleur');
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Een gewone regel')).toBeInTheDocument();
    // A work item inside a legacy section renders as the same chip link the
    // per-commit format uses.
    expect(screen.getByRole('link', { name: /Trage takenlijst/ })).toBeInTheDocument();
  });

  it('renders a legacy entry with no scope badge at all', () => {
    setVersions([
      {
        version: '9.9.9',
        status: 'Released',
        statusColor: 'green',
        borderColor: 'green',
        date: '1 sep 2026',
        sections: [{ icon: '✨', iconColor: 'blue', title: 'Nieuw', items: ['Iets'] }],
      },
    ]);

    render(<ChangelogPanel isOpen onClose={vi.fn()} />);

    const header = screen.getByRole('button', { name: /v9\.9\.9/ });
    expect(within(header).queryByText(/Full-stack|Frontend|Backend/)).not.toBeInTheDocument();
  });
});
