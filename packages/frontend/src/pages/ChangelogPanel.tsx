import { useEffect } from 'react';
import { changelog, type ChangelogVersion, type ChangelogSection } from './changelog-data';

interface ChangelogPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangelogPanel({ isOpen, onClose }: ChangelogPanelProps) {
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

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-full sm:w-[500px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changelog-title"
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <h2 id="changelog-title" className="text-xl font-bold">
                  Changelog
                </h2>
                <p className="text-sm text-blue-100">RONL Business API Updates</p>
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
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {changelog.versions.map((version, versionIndex) => (
            <VersionCard key={version.version} version={version} isLatest={versionIndex === 0} />
          ))}
        </div>

        {/* Footer - Sticky at bottom */}
        <div className="flex-shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-600">
          <p>
            For more information, visit{' '}
            <a
              href="https://iou-architectuur.open-regels.nl/ronl-business-api/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              iou-architectuur.open-regels.nl
            </a>
          </p>
        </div>
      </div>
    </>
  );
}

// Version Card Component
function VersionCard({ version, isLatest }: { version: ChangelogVersion; isLatest: boolean }) {
  const statusColors = {
    blue: 'bg-blue-100 text-blue-800 border-blue-300',
    purple: 'bg-purple-100 text-purple-800 border-purple-300',
    green: 'bg-green-100 text-green-800 border-green-300',
    orange: 'bg-orange-100 text-orange-800 border-orange-300',
    red: 'bg-red-100 text-red-800 border-red-300',
    gray: 'bg-gray-100 text-gray-800 border-gray-300',
  };

  const borderColors = {
    blue: 'border-blue-300',
    purple: 'border-purple-300',
    green: 'border-green-300',
    orange: 'border-orange-300',
    red: 'border-red-300',
    gray: 'border-gray-300',
  };

  const statusColor =
    statusColors[version.statusColor as keyof typeof statusColors] || statusColors.blue;
  const borderColor =
    borderColors[version.borderColor as keyof typeof borderColors] || borderColors.blue;

  return (
    <div className={`border-l-4 ${borderColor} bg-white rounded-lg shadow-md overflow-hidden`}>
      {/* Version Header */}
      <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-bold text-gray-900">v{version.version}</h3>
            {isLatest && (
              <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                Latest
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusColor}`}>
              {version.status}
            </span>
            <span className="text-sm text-gray-600">{version.date}</span>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="p-5 space-y-6">
        {version.sections.map((section, sectionIndex) => (
          <SectionCard key={sectionIndex} section={section} />
        ))}
      </div>
    </div>
  );
}

// Section Card Component
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
        {section.items.map((item, itemIndex) => (
          <li key={itemIndex} className="flex items-start gap-2">
            <span className="text-blue-500 mt-1 flex-shrink-0">•</span>
            <span className="text-gray-700 text-sm leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
