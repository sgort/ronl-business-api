// packages/public-site/src/pages/herkomst/herkomstScroll.ts
/**
 * Smooth-scrolls the element with the given id into view, offset 20px from
 * the top of the viewport. Shared by Herkomst.tsx's background jump-links
 * and HerkomstExplorer's trail-bar scroll-into-view on concept change.
 */
export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const top = window.scrollY + el.getBoundingClientRect().top - 20;
  window.scrollTo({ top, behavior: 'smooth' });
}
