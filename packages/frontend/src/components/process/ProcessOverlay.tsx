import { useEffect, useMemo, useRef, useState } from 'react';
import type { PhaseSwimlaneModel, Task } from '@ronl/shared';
import type { StatusKey } from '../../pages/infra-board/rip-model';
import PhaseStepper from './PhaseStepper';
import PhaseSwimlane from './PhaseSwimlane';
import { phaseRef, phaseStepClass, phaseStepTitle, stepperPhases } from './phaseSet';
import type { ProcessContext } from './processContext';
import { myLaneKeys } from './laneSteps';
import './caseworker-process.css';

const NO_STATUS: Record<string, StatusKey> = {};
const NOTHING = new Set<string>();

/** The call activity in `model` that runs a loaded subprocess, and that subprocess's key. */
function subprocessOf(model: PhaseSwimlaneModel | undefined, ctx: ProcessContext) {
  const call = model?.nodes.find((n) => n.kind === 'call' && n.calls && ctx.models[n.calls]);
  return call ? { key: call.calls!, phase: call.phase } : undefined;
}

/**
 * The process model on demand: a modal overlay with the full phase stepper,
 * a breadcrumb between main process and subprocess, a legend and the shared
 * swimlane. Esc and a backdrop click close it; focus is trapped inside and
 * handed back to whatever held it when the overlay opened.
 */
export default function ProcessOverlay({
  task,
  ctx,
  roles,
  initialPhase,
  dossierRef,
  returnFocus,
  onClose,
}: {
  task: Task;
  ctx: ProcessContext;
  roles: readonly string[];
  /** Open at this phase instead of the task's own. */
  initialPhase?: string;
  dossierRef?: string;
  /** Where focus goes on close when whatever opened the overlay is gone (the ⌘K palette). */
  returnFocus?: () => HTMLElement | null;
  onClose: () => void;
}) {
  const top = ctx.chain[0]?.processKey ?? ctx.current.processKey;
  const sub = subprocessOf(ctx.models[top], ctx);
  const topSet = ctx.models[top]?.phaseSet;

  /** The subprocess's phase (Awb 4+5) shows the subprocess; every other phase the main process. */
  const processFor = (phase: string | null | undefined) =>
    sub && phase && phase === sub.phase ? sub.key : top;

  const [sel, setSel] = useState<string | null>(initialPhase ?? ctx.phase);
  const [proc, setProc] = useState<string>(
    initialPhase && initialPhase !== ctx.phase ? processFor(initialPhase) : ctx.current.processKey
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;

  // Focus the close button on open. On close, hand focus back to whatever
  // held it -- or, when that is gone (the ⌘K palette unmounts before the
  // overlay mounts), to the fallback the caller names.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      const usable = trigger && trigger !== document.body && trigger.isConnected;
      (usable ? trigger : returnFocusRef.current?.())?.focus?.();
    };
  }, []);

  // Esc and the Tab trap listen on the document, not the dialog: focus can
  // leave the panel without the user moving it -- "open ↘" unmounts the
  // button it was on, a click on the swimlane drops it on <body> -- and the
  // modal must stay keyboard-operable then too.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      const panel = panelRef.current;
      if (e.key !== 'Tab' || !panel) return;
      const focusables = [
        ...panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ),
      ];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const pickPhase = (code: string) => {
    setSel(code);
    setProc(processFor(code));
  };

  // Switching model can unmount the focused control ("open ↘" is not on the
  // subprocess); keep focus in the dialog by moving it to the title.
  useEffect(() => {
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
      titleRef.current?.focus();
    }
  }, [proc]);

  const model = ctx.models[proc];
  const onOwnProcess = proc === ctx.current.processKey;
  const ownNodeId = ctx.current.nodeId;
  const claimed = useMemo(
    () => (onOwnProcess ? new Set([ownNodeId]) : NOTHING),
    [onOwnProcess, ownNodeId]
  );
  const mine = useMemo(() => (model ? myLaneKeys(model, roles) : NOTHING), [model, roles]);
  const scrollTo =
    onOwnProcess && (!sel || sel === ctx.phase)
      ? ctx.current.nodeId
      : (model?.nodes.find((n) => n.phase === sel)?.id ?? null);
  const myGroups = [
    ...new Set(
      (model?.lanes ?? []).flatMap((l) =>
        (l.candidateGroups ?? []).filter((g) => roles.includes(g))
      )
    ),
  ];

  return (
    <div
      className="cwp-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cwp-ov-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="cwp-ov-panel pbd" ref={panelRef}>
        <header className="cwp-ov-head">
          <div>
            <p className="cwp-eyebrow">
              {dossierRef ?? task.id} · {ctx.current.processKey}
            </p>
            <h2 id="cwp-ov-title">{task.name}</h2>
          </div>
          <button type="button" className="v2-btn v2-btn-ghost" ref={closeRef} onClick={onClose}>
            Sluiten <kbd>Esc</kbd>
          </button>
        </header>
        <div className="cwp-ov-body">
          {ctx.phase && ctx.phaseSet && (
            <PhaseStepper
              phases={stepperPhases(ctx.phaseSet)}
              stepClass={phaseStepClass(ctx.phaseSet, ctx.phase)}
              selected={sel}
              onSelect={pickPhase}
              variant="full"
              stepTitle={phaseStepTitle}
            />
          )}
          <div className="pb-phase-titlebar">
            <h3 ref={titleRef} tabIndex={-1}>
              {sub && (
                <span className="cwp-crumbs">
                  <button
                    type="button"
                    className={proc === top ? 'on' : ''}
                    aria-current={proc === top ? 'true' : undefined}
                    onClick={() => setProc(top)}
                  >
                    Hoofdproces
                  </button>
                  <span aria-hidden="true">›</span>
                  <button
                    type="button"
                    className={proc === sub.key ? 'on' : ''}
                    aria-current={proc === sub.key ? 'true' : undefined}
                    onClick={() => {
                      setProc(sub.key);
                      if (sub.phase) setSel(sub.phase);
                    }}
                  >
                    Deelproces fase{' '}
                    {sub.phase && topSet ? phaseRef(topSet, sub.phase) : (sub.phase ?? '')}
                  </button>
                </span>
              )}
              {model?.processName ?? proc} <span className="rcode">{proc}</span>
            </h3>
            <span className="meta">Processtappen &amp; rollen — procesmodel (live)</span>
          </div>
          <div className="cwp-legend">
            <span>
              <i className="sw done" />
              Afgerond
            </span>
            <span>
              <i className="sw active" />
              Loopt
            </span>
            <span>
              <i className="sw claimed" />
              Jouw taak
            </span>
            <span>
              <i className="sw mine" />
              Jouw rol{myGroups.length > 0 ? ` (${myGroups.join(', ')})` : ''}
            </span>
            <span>
              <i className="sw auto" />
              Automatisch (script / DMN)
            </span>
            <span>
              <i className="sw todo" />
              Nog niet / niet doorlopen
            </span>
          </div>
          {model && (
            <PhaseSwimlane
              density="roomy"
              model={model}
              statusById={ctx.statusByProcess[proc] ?? NO_STATUS}
              claimedNodeIds={claimed}
              claimedLabel="jouw taak"
              myLaneKeys={mine}
              scrollToNodeId={scrollTo}
              onOpenCall={(n) => {
                if (n.calls && ctx.models[n.calls]) {
                  setProc(n.calls);
                  if (n.phase) setSel(n.phase);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
