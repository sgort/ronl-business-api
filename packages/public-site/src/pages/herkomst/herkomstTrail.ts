// packages/public-site/src/pages/herkomst/herkomstTrail.ts
/**
 * Pure drill-down trail logic for HerkomstExplorer, split into its own
 * module (rather than exported alongside the component) so the file only
 * exports a component — Vite's react-refresh plugin only fast-refreshes
 * files that exclusively export components.
 */

export function nextTrail(trail: string[], id: string): string[] {
  return trail[trail.length - 1] === id ? trail : [...trail, id];
}
