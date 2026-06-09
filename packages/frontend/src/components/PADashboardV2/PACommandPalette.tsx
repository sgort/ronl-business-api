/**
 * PACommandPalette — ⌘K / Ctrl+K quick navigator for the PA cockpit.
 *
 * Searches static sections (from modes.config) plus all dossiers (data-driven).
 * Selecting an item switches to the owning mode and sets the active section.
 * Mirrors the caseworker CommandPalette; reuses the same `.cwd-v2-palette*`
 * styles (kept global) plus the `.pac-palette*` skin in dashboard-pa.css.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  allStaticSections,
  findPaModeForSection,
  type PaModeId,
} from '../../pages/public-affairs-v2/modes.config';
import { getDossiers } from '../../pages/public-affairs-v2/pa.data';

interface Hit {
  id: string;
  label: string;
  mode: PaModeId;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: PaModeId, sectionId: string) => void;
}

export default function PACommandPalette({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: Hit[] = useMemo(() => {
    const out: Hit[] = [];
    for (const s of allStaticSections()) {
      const mode = findPaModeForSection(s.id);
      if (mode) out.push({ id: s.id, label: s.label, mode });
    }
    for (const d of getDossiers()) {
      out.push({ id: d.id, label: d.naam, mode: 'dossiers' });
    }
    return out;
  }, []);

  const hits: Hit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q) || it.mode.includes(q));
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

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
      className="pac-palette-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="pac-palette"
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
          placeholder="Spring naar… (dossier, monitoring, voortgang, …)"
          onChange={(e) => setQuery(e.target.value)}
        />

        {hits.length === 0 ? (
          <div className="pal-empty">Niets gevonden voor "{query}"</div>
        ) : (
          <ul>
            {hits.map((h, i) => (
              <li
                key={h.mode + h.id}
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
