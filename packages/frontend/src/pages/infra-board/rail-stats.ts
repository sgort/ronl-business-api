/**
 * Rail stats — pure derivations for the app shell's per-mode rail
 * (Mijn dag / Portfolio / Beheer). InfraBoardDashboard.tsx calls the live
 * data hooks and builds the mock+live project list; these functions take
 * the results as plain arguments and do no fetching of their own — the
 * same "components independently source their own live data" pattern
 * FaseladderOverview.tsx and PhaseDetail.tsx already use.
 * See docs/superpowers/specs/2026-08-10-rip-beheer-rail-stats-panel-design.md.
 */
import type { Task } from '@ronl/shared';
import { groupTasksByHorizon } from '../../services/infra.api';
import { MIJN_PROJECT_NRS, getMockTodos, type PortfolioProject } from './infra-board.data';
import {
  RIP_PHASES,
  RIP_STAGES,
  getPhaseDeployStatus,
  type RipPhase,
  type RipStage,
} from './rip-phases.catalog';
import { HEALTH, type HealthKey } from './rip-model';
import type { AnnotatedPhaseCounts } from './rip-phase-counts';

export interface RailStat {
  label: string;
  value: number;
  dotColor?: string;
}

/** "Taken vandaag" / "Urgent / te laat" / "Mijn projecten" for the Mijn dag rail. */
export function mijnDagRailStats(
  liveTasks: Task[] | null,
  mockTodos: ReturnType<typeof getMockTodos>,
  allProjects: PortfolioProject[]
): RailStat[] {
  const liveVandaag = liveTasks ? groupTasksByHorizon(liveTasks).vandaag : [];
  const takenVandaag = liveVandaag.length + mockTodos.vandaag.length;
  const urgent =
    liveVandaag.filter((t) => t.prio === 'overdue').length +
    mockTodos.vandaag.filter((t) => t.prio === 'overdue').length +
    allProjects.filter((p) => p.health === 'rood').length;
  return [
    { label: 'Taken vandaag', value: takenVandaag },
    { label: 'Urgent / te laat', value: urgent, dotColor: '#b0103c' },
    { label: 'Mijn projecten', value: MIJN_PROJECT_NRS.length },
  ];
}

/** Phase counts grouped by stage, in RIP_STAGES order — not navigable, display only. */
export function portfolioRailStageGroups(
  projects: PortfolioProject[]
): { stage: RipStage; phases: { phase: RipPhase; count: number }[] }[] {
  return RIP_STAGES.map((stage) => ({
    stage,
    phases: RIP_PHASES.filter((p) => p.stage === stage.code).map((phase) => ({
      phase,
      count: projects.filter((p) => p.ripPhaseCode === phase.code).length,
    })),
  }));
}

/** "Wacht op start" — projects waiting for their current phase to begin. */
export function portfolioRailTransitions(projects: PortfolioProject[]): RailStat[] {
  return [
    {
      label: 'Wacht op start',
      value: projects.filter((p) => p.ripPhaseState === 'wachtend').length,
      dotColor: '#7a5af0',
    },
  ];
}

/** Gezondheid breakdown — groen/geel/rood, reusing rip-model's HEALTH vocabulary. */
export function portfolioRailHealth(projects: PortfolioProject[]): RailStat[] {
  const order: HealthKey[] = ['groen', 'geel', 'rood'];
  return order.map((key) => ({
    label: HEALTH[key].label,
    value: projects.filter((p) => p.health === key).length,
    dotColor: HEALTH[key].color,
  }));
}

/** "RIP-faseladder · N in uitvoering" — same sum as FaseladderOverview.tsx's
 *  "Fasen in uitvoering" KPI, shown in the Beheer rail header instead. */
export function beheerRailSubtitle(combined: Record<string, AnnotatedPhaseCounts>): string {
  const total = RIP_PHASES.reduce((sum, p) => sum + (combined[p.code]?.wip ?? 0), 0);
  return `RIP-faseladder · ${total} in uitvoering`;
}

export interface BeheerPhaseRailItem {
  phase: RipPhase;
  /** WIP badge. */
  count: number;
  /** Dims the item — true unless getPhaseDeployStatus resolves to 'gedeployed'. */
  muted: boolean;
}

/** Beheer's phase nav items, grouped by stage — same shape as
 *  portfolioRailStageGroups but carrying WIP badges and
 *  deploy-muted state instead of project counts. Reference:
 *  pb-shell.reference.jsx:82-103. */
export function beheerRailPhaseGroups(
  combined: Record<string, AnnotatedPhaseCounts>,
  deployedKeys: ReadonlySet<string>
): { stage: RipStage; phases: BeheerPhaseRailItem[] }[] {
  return RIP_STAGES.map((stage) => ({
    stage,
    phases: RIP_PHASES.filter((p) => p.stage === stage.code).map((phase) => {
      const counts = combined[phase.code];
      return {
        phase,
        count: counts?.wip ?? 0,
        muted: getPhaseDeployStatus(phase, deployedKeys) !== 'gedeployed',
      };
    }),
  }));
}
