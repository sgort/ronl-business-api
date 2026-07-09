import { useState, useMemo, useEffect, useRef } from 'react';
import { WOO_TABS, type WooTabId } from '../../pages/woo/modes.config';
import { WOO_REGISTER } from '../../pages/woo/woo.data';

interface PaletteItem {
  kind: 'view' | 'register';
  id: string;
  label: string;
  tag: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectTab: (id: WooTabId) => void;
  onOpenRegister: () => void;
}

export default function WooCommandPalette({ open, onClose, onSelectTab, onOpenRegister }: Props) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: PaletteItem[] = useMemo(() => {
    const views: PaletteItem[] = WOO_TABS.map((t) => ({
      kind: 'view',
      id: t.id,
      label: t.label,
      tag: 'weergave',
    }));
    views.push({ kind: 'register', id: 'register', label: 'Verzoekenregister', tag: 'register' });
    const regs: PaletteItem[] = WOO_REGISTER.map((r) => ({
      kind: 'register',
      id: 'register',
      label: `${r.id} · ${r.onderwerp}`,
      tag: 'verzoek',
    }));
    return [...views, ...regs];
  }, []);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => it.label.toLowerCase().includes(s) || it.tag.includes(s));
  }, [items, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setHi(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (hi >= hits.length) setHi(0);
  }, [hits.length, hi]);

  if (!open) return null;

  const choose = (h: PaletteItem) => {
    if (h.kind === 'view') onSelectTab(h.id as WooTabId);
    else onOpenRegister();
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
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (hits[hi]) choose(hits[hi]);
          }
        }}
      >
        <input
          ref={inputRef}
          value={q}
          placeholder="Spring naar weergave of verzoek (ID, onderwerp)…"
          onChange={(e) => setQ(e.target.value)}
        />
        {hits.length === 0 ? (
          <div className="pal-empty">Niets gevonden voor &ldquo;{q}&rdquo;</div>
        ) : (
          <ul>
            {hits.slice(0, 40).map((h, i) => (
              <li
                key={`${h.kind}-${h.id}-${i}`}
                className={i === hi ? 'active' : ''}
                onMouseEnter={() => setHi(i)}
                onClick={() => choose(h)}
              >
                <span className="label">{h.label}</span>
                <span className="mode">{h.tag}</span>
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
