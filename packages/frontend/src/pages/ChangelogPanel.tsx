import { useEffect, useState } from 'react';
import {
  changelog,
  type ChangelogEntry,
  type ChangelogVersion,
  type ChangelogVersionV2,
  type ChangelogSection,
  type ChangelogCommit,
  type CommitType,
  type FeedbackItem,
} from './changelog-data';

interface ChangelogPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangelogPanel({ isOpen, onClose }: ChangelogPanelProps) {
  // Only the latest (first) entry starts expanded — matches the Regeleditor/
  // LDE/CPSV Editor changelog pattern of one open card, the rest collapsed.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(changelog.versions[0] ? [changelog.versions[0].version] : [])
  );
  const toggle = (version: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      return next;
    });
  };

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Prevent body scroll when panel is open
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

  // Tenant-aware header. V2 sets --color-primary / --color-primary-dark on
  // :root via initializeTenantTheme; V1 inherits the same tokens. When neither
  // is present (e.g. preview mocks), the legacy blue gradient is the fallback.
  const headerStyle: React.CSSProperties = {
    background:
      'linear-gradient(to right, var(--color-primary, #2563eb), var(--color-primary-dark, #1d4ed8))',
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-full sm:w-[500px] bg-white shadow-2xl z-[60] transform transition-transform duration-300 ease-out flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
      >
        {/* Header — tenant-aware gradient */}
        <div className="flex-shrink-0 text-white px-6 py-4 shadow-md" style={headerStyle}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <h2 id="changelog-title" className="text-xl font-bold">
                  Changelog
                </h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.78)' }}>
                  RONL Business API Updates
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
              aria-label="Close changelog"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          <ChangelogIntroCard latest={changelog.versions[0]} />
          <div className="space-y-4">
            {changelog.versions.map((version, versionIndex) => (
              <VersionCard
                key={version.version}
                version={version}
                isLatest={versionIndex === 0}
                isExpanded={expanded.has(version.version)}
                onToggle={() => toggle(version.version)}
              />
            ))}
          </div>
        </div>

        {/* Footer - Sticky at bottom */}
        <div className="flex-shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-600">
          <p>
            For more information, visit{' '}
            <a
              href="https://iou-architectuur.open-regels.nl/ronl-business-api/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-primary, #2563eb)' }}
              className="hover:underline"
            >
              iou-architectuur.open-regels.nl
            </a>
          </p>
        </div>
      </div>
    </>
  );
}

// Intro card — light-blue header card above the release list, matching the
// Regeleditor/LDE/CPSV Editor changelog pattern. Shows the latest release's
// scope badge (only meaningful for the new per-commit format, which always
// carries scope; legacy top entries omit it, same as before).
function ChangelogIntroCard({ latest }: { latest: ChangelogEntry | undefined }) {
  const scope = latest?.scope;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-gray-900">RONL Business API</h3>
          <p className="text-sm text-gray-600 mt-0.5">
            This project serves as a reference for implementing a compliant, secure, and reliable
            public service for Dutch provinces and municipalities.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {scope && <ScopeBadge scope={scope} />}
          <GitLabLink />
        </div>
      </div>
    </div>
  );
}

// GitLab badge — links to the repo hosting this changelog's commits.
function GitLabLink() {
  return (
    <a
      href="https://git.open-regels.nl/hosting/ronl-business-api"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M23.955 13.587l-1.342-4.135-2.664-8.189c-.135-.423-.73-.423-.867 0L16.418 9.45H7.582L4.918 1.263c-.135-.423-.73-.423-.867 0L1.386 9.45.044 13.587a.924.924 0 00.331 1.03L12 23.054l11.625-8.437a.92.92 0 00.33-1.03" />
      </svg>
      GitLab
    </a>
  );
}

// Chevron toggle icon
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// Version Card Component — branches on the legacy (sections) vs new
// (per-commit) format. Both are collapsible; only the latest starts open.
function VersionCard({
  version,
  isLatest,
  isExpanded,
  onToggle,
}: {
  version: ChangelogEntry;
  isLatest: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (isCommitFormat(version)) {
    return (
      <div
        className={`border-l-4 ${newFormatBorderColor(version.status)} bg-white rounded-lg shadow-md overflow-hidden`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="w-full text-left bg-gray-50 px-5 py-4 border-b border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-bold text-gray-900">v{version.version}</h3>
                {isLatest && (
                  <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                    Latest
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {version.date} · {version.commits.length} commit
                {version.commits.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {version.scope && <ScopeBadge scope={version.scope} />}
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusBadgeClass(version.status)}`}
              >
                {version.status}
              </span>
              <Chevron open={isExpanded} />
            </div>
          </div>
        </button>
        {isExpanded && (
          <div className="p-5 space-y-6">
            <CommitList version={version} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`border-l-4 ${legacyBorderColor(version.borderColor)} bg-white rounded-lg shadow-md overflow-hidden`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full text-left bg-gray-50 px-5 py-4 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-bold text-gray-900">v{version.version}</h3>
            {isLatest && (
              <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                Latest
              </span>
            )}
            {version.scope && <ScopeBadge scope={version.scope} />}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 text-xs font-semibold rounded-full border ${legacyStatusClass(version.statusColor)}`}
            >
              {version.status}
            </span>
            <span className="text-sm text-gray-600">{version.date}</span>
            <Chevron open={isExpanded} />
          </div>
        </div>
      </button>
      {isExpanded && (
        <div className="p-5 space-y-6">
          <SectionList version={version} />
        </div>
      )}
    </div>
  );
}

function isCommitFormat(version: ChangelogEntry): version is ChangelogVersionV2 {
  return 'format' in version && version.format === 'commits';
}

function SectionList({ version }: { version: ChangelogVersion }) {
  return (
    <>
      {version.sections.map((section, sectionIndex) => (
        <SectionCard key={sectionIndex} section={section} />
      ))}
    </>
  );
}

function CommitList({ version }: { version: ChangelogVersionV2 }) {
  return (
    <>
      <div className="space-y-5">
        {version.commits.map((commit) => (
          <CommitBlock key={commit.sha} commit={commit} />
        ))}
      </div>
      {version.feedback && version.feedback.length > 0 && (
        <FeedbackBlock items={version.feedback} />
      )}
    </>
  );
}

// One commit's block: icon + bold colored header (subject), SHA + author
// as a small trailer, then its body paragraphs.
const COMMIT_TYPE_META: Record<CommitType, { icon: string; color: keyof typeof TEXT_COLORS }> = {
  feat: { icon: '✨', color: 'green' },
  fix: { icon: '🐛', color: 'red' },
  test: { icon: '🧪', color: 'purple' },
  docs: { icon: '📘', color: 'blue' },
  chore: { icon: '🧹', color: 'gray' },
  refactor: { icon: '♻️', color: 'orange' },
  other: { icon: '📄', color: 'gray' },
};

const TEXT_COLORS = {
  blue: 'text-blue-700',
  purple: 'text-purple-700',
  green: 'text-green-700',
  orange: 'text-orange-700',
  red: 'text-red-700',
  gray: 'text-gray-700',
};

function CommitBlock({ commit }: { commit: ChangelogCommit }) {
  const meta = COMMIT_TYPE_META[commit.type] ?? COMMIT_TYPE_META.other;

  return (
    <div>
      <div className="flex items-start gap-2">
        <span className="text-xl leading-none flex-shrink-0">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <h4 className={`text-base font-bold ${TEXT_COLORS[meta.color]}`}>{commit.subject}</h4>
          <p className="text-xs text-gray-400 font-mono mt-0.5">
            {commit.sha} — {commit.author}
          </p>
          {commit.details && commit.details.length > 0 && (
            <div className="mt-2 space-y-2">
              {commit.details.map((paragraph, i) => (
                <p key={i} className="text-sm text-gray-700 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// RONL-specific: external GitLab work items (feedback/use-case) a release
// resolves — its own labeled block, same chip-link presentation as the
// legacy Feedback section, below the commit list.
function FeedbackBlock({ items }: { items: FeedbackItem[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl text-purple-600">💬</span>
        <h4 className="text-lg font-semibold text-gray-900">Feedback / use case handled</h4>
      </div>
      <ul className="space-y-2 ml-9">
        {items.map((item, itemIndex) => (
          <FeedbackListItem key={itemIndex} item={item} />
        ))}
      </ul>
    </div>
  );
}

// Scope Badge — which deployable(s) a release touched (frontend / backend / both)
function ScopeBadge({ scope }: { scope: NonNullable<ChangelogVersion['scope']> }) {
  const config = {
    frontend: { label: 'Frontend', cls: 'bg-blue-100 text-blue-800' },
    backend: { label: 'Backend', cls: 'bg-purple-100 text-purple-800' },
    both: { label: 'Full-stack', cls: 'bg-gray-200 text-gray-700' },
  }[scope];

  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${config.cls}`}>
      {config.label}
    </span>
  );
}

// ── Legacy (sections) format rendering + color lookups ──────────────

const LEGACY_STATUS_COLORS = {
  blue: 'bg-blue-100 text-blue-800 border-blue-300',
  purple: 'bg-purple-100 text-purple-800 border-purple-300',
  green: 'bg-green-100 text-green-800 border-green-300',
  orange: 'bg-orange-100 text-orange-800 border-orange-300',
  red: 'bg-red-100 text-red-800 border-red-300',
  gray: 'bg-gray-100 text-gray-800 border-gray-300',
};

const LEGACY_BORDER_COLORS = {
  blue: 'border-blue-300',
  purple: 'border-purple-300',
  green: 'border-green-300',
  orange: 'border-orange-300',
  red: 'border-red-300',
  gray: 'border-gray-300',
};

function legacyStatusClass(statusColor: string): string {
  return (
    LEGACY_STATUS_COLORS[statusColor as keyof typeof LEGACY_STATUS_COLORS] ||
    LEGACY_STATUS_COLORS.blue
  );
}

function legacyBorderColor(borderColor: string): string {
  return (
    LEGACY_BORDER_COLORS[borderColor as keyof typeof LEGACY_BORDER_COLORS] ||
    LEGACY_BORDER_COLORS.blue
  );
}

// New-format status/border colors — derived from the status text itself
// (no raw color keys in the data), keeping the same 6-key palette.
function statusBadgeClass(status: string): string {
  if (status === 'Released') return LEGACY_STATUS_COLORS.green;
  if (status === 'Upcoming') return LEGACY_STATUS_COLORS.blue;
  return LEGACY_STATUS_COLORS.gray;
}

function newFormatBorderColor(status: string): string {
  if (status === 'Released') return LEGACY_BORDER_COLORS.green;
  if (status === 'Upcoming') return LEGACY_BORDER_COLORS.blue;
  return LEGACY_BORDER_COLORS.gray;
}

// Section Card Component (legacy format)
function SectionCard({ section }: { section: ChangelogSection }) {
  const iconColors = {
    blue: 'text-blue-600',
    purple: 'text-purple-600',
    green: 'text-green-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
    gray: 'text-gray-600',
  };

  const iconColor = iconColors[section.iconColor as keyof typeof iconColors] || iconColors.blue;

  return (
    <div className="space-y-3">
      {/* Section Title */}
      <div className="flex items-center gap-2">
        <span className={`text-2xl ${iconColor}`}>{section.icon}</span>
        <h4 className="text-lg font-semibold text-gray-900">{section.title}</h4>
      </div>

      {/* Items */}
      <ul className="space-y-2 ml-9">
        {section.items.map((item, itemIndex) => {
          if (typeof item === 'string') {
            return (
              <li key={itemIndex} className="flex items-start gap-2">
                <span className="text-blue-500 mt-1 flex-shrink-0">•</span>
                <span className="text-gray-700 text-sm leading-relaxed">{item}</span>
              </li>
            );
          }
          return <FeedbackListItem key={itemIndex} item={item} />;
        })}
      </ul>
    </div>
  );
}

// Shared chip-link renderer for a single feedback/use-case work item —
// used by both the legacy SectionCard and the new FeedbackBlock.
function FeedbackListItem({ item }: { item: FeedbackItem }) {
  const chipClass =
    item.type === 'usecase'
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  const chipLabel = item.type === 'usecase' ? 'Use Case' : 'Feedback';

  return (
    <li className="flex items-start gap-2">
      <span className="text-blue-500 mt-1 flex-shrink-0">•</span>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-2 text-sm leading-relaxed text-gray-700 hover:text-blue-700 hover:underline group"
      >
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 mt-0.5 ${chipClass}`}
        >
          {chipLabel} #{item.iid}
        </span>
        <span className="group-hover:underline">{item.title}</span>
      </a>
    </li>
  );
}
