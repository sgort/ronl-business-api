import { useEffect, useMemo, useRef, useState } from 'react';
import { getMockPortfolio } from '../../pages/infra-board/infra-board.data';
import { useRipActiveAcrossPhases } from '../../services/infra.api';
import type { InfraModeId } from '../../pages/infra-board/modes.config';
import type { ProjectRef } from '../../pages/InfraBoardDashboard';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectView: (mode: InfraModeId) => void;
  onSelectProject: (ref: ProjectRef) => void;
}

type Hit =
  | { kind: 'view'; id: InfraModeId; label: string; tag: string }
  | { kind: 'project'; ref: ProjectRef; label: string; tag: string };

export default function InfraCommandPalette({
  open,
  onClose,
  onSelectView,
  onSelectProject,
}: Props) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const { data: live } = useRipActiveAcrossPhases();

  const items: Hit[] = useMemo(() => {
    const views: Hit[] = [
      { kind: 'view', id: 'mijn-dag', label: 'Mijn dag', tag: 'weergave' },
      { kind: 'view', id: 'portfolio', label: 'Portfolio', tag: 'weergave' },
      { kind: 'view', id: 'beheer', label: 'Beheer · Faseladder', tag: 'weergave' },
    ];
    const liveRows: Hit[] = (live ?? []).map((i) => ({
      kind: 'project',
      ref: { nr: i.projectNumber || i.id.slice(0, 8), instanceId: i.id },
      label: `${i.projectNumber} · ${i.projectName}`,
      tag: 'live',
    }));
    const mockRows: Hit[] = getMockPortfolio().map((p) => ({
      kind: 'project',
      ref: { nr: p.nr },
      label: `${p.nr} · ${p.naam}`,
      tag: 'project',
    }));
    return [...views, ...liveRows, ...mockRows];
  }, [live]);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => it.label.toLowerCase().includes(s) || it.tag.includes(s));
  }, [items, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setHi(0);
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => {
    if (hi >= hits.length) setHi(0);
  }, [hits.length, hi]);
  if (!open) return null;

  const choose = (h: Hit) => {
    if (h.kind === 'view') onSelectView(h.id);
    else onSelectProject(h.ref);
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
          ref={ref}
          value={q}
          placeholder="Spring naar weergave of project (nr, naam)…"
          onChange={(e) => setQ(e.target.value)}
        />
        {hits.length === 0 ? (
          <div className="pal-empty">Niets gevonden voor "{q}"</div>
        ) : (
          <ul>
            {hits.slice(0, 40).map((h, i) => (
              <li
                key={i}
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
