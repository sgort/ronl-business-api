/**
 * CommandPalette — ⌘K / Ctrl+K quick navigator for V2.
 *
 * Searches across all section ids registered in modes.config.ts.
 * Selecting an item:
 *   - switches to the mode that owns the section
 *   - sets that section as active
 *
 * Keyboard:
 *   ↑ / ↓   move highlight
 *   Enter   activate
 *   Esc     close
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  allSearchableSections,
  findModeForSection,
  type ModeId,
  type RailItem,
} from '../../pages/caseworker-v2/modes.config';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: ModeId, sectionId: string) => void;
}

interface Hit extends RailItem {
  mode: ModeId;
}

export default function CommandPalette({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the searchable list once.
  const items: Hit[] = useMemo(() => {
    return allSearchableSections()
      .map((it) => {
        const mode = findModeForSection(it.id);
        return mode ? { ...it, mode } : null;
      })
      .filter((x): x is Hit => x !== null);
  }, []);

  const hits: Hit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q) ||
        it.mode.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Reset & focus when opened.
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // Focus next tick so the input is mounted.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Clamp highlight when hits change.
  useEffect(() => {
    if (highlight >= hits.length) setHighlight(0);
  }, [hits.length, highlight]);

  if (!open) return null;

  const choose = (h: Hit) => {
    onSelect(h.mode, h.id);
    onClose();
  };

  return (
    <div
      className="cwd-v2-palette-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="cwd-v2-palette"
        role="dialog"
        aria-label="Snel navigeren"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const h = hits[highlight];
            if (h) choose(h);
          }
        }}
      >
        <input
          ref={inputRef}
          value={query}
          placeholder="Spring naar… (taken, regelcatalogus, profiel, …)"
          onChange={(e) => setQuery(e.target.value)}
        />

        {hits.length === 0 ? (
          <div className="pal-empty">Niets gevonden voor "{query}"</div>
        ) : (
          <ul>
            {hits.map((h, i) => (
              <li
                key={h.id}
                className={i === highlight ? 'active' : ''}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(h)}
              >
                <span className="label">{h.label}</span>
                <span className="mode">{h.mode}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="pal-hint">
          <span>↑↓ navigeren</span>
          <span>↵ openen</span>
          <span>Esc sluiten</span>
        </div>
      </div>
    </div>
  );
}
