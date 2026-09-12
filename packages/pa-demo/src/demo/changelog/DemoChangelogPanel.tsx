/**
 * The demo's own changelog panel — a slide-over listing DEMO_CHANGELOG, every
 * entry expanded. Not a copy of the product's ChangelogPanel: that one is an
 * engineering changelog (per-commit SHA/author, scope badges, a repo link,
 * collapsible cards for ~90 releases) built for an authenticated internal
 * audience. Three curated entries need none of that — no collapsing, no
 * metadata, just version/date, the themed heading, and the bullets.
 *
 * Typed with PaChangelogPanelProps from @ronl/pa-cockpit rather than a local
 * restatement of { isOpen, onClose }, so it is assignable to
 * PaCockpitHost['ChangelogPanel'] by construction: if the shell ever starts
 * passing this seam something else, that is a type error here rather than a
 * prop this panel silently ignores.
 *
 * pac-* classes, styled in the colocated changelog.css, not Tailwind: Task 8
 * made @ronl/pa-cockpit Tailwind-free specifically so a host forgetting a
 * `content` glob doesn't get its classes silently purged. Reintroducing
 * Tailwind here would put pa-demo right back in that failure mode.
 */
import { useEffect } from 'react';
import type { PaChangelogPanelProps } from '@ronl/pa-cockpit';
import { DEMO_CHANGELOG } from './changelog.data';
import './changelog.css';

export default function DemoChangelogPanel({ isOpen, onClose }: PaChangelogPanelProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="pac-dchangelog-overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="pac-dchangelog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-changelog-title"
      >
        <div className="pac-dchangelog-header">
          <h2 id="demo-changelog-title" className="pac-dchangelog-title">
            Wat is er nieuw
          </h2>
          <button onClick={onClose} className="pac-dchangelog-close" aria-label="Sluiten">
            <svg
              className="pac-dchangelog-close-icon"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="pac-dchangelog-content">
          {DEMO_CHANGELOG.map((release) => (
            <article key={release.version} className="pac-dchangelog-entry">
              <div className="pac-dchangelog-meta">
                <div className="pac-dchangelog-version">{release.version}</div>
                <div className="pac-dchangelog-date">{release.date}</div>
              </div>
              <div className="pac-dchangelog-body">
                <h3 className="pac-dchangelog-entry-title">
                  <span className="pac-dchangelog-icon" aria-hidden="true">
                    {release.icon}
                  </span>
                  {release.title}
                </h3>
                <ul className="pac-dchangelog-items">
                  {release.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
