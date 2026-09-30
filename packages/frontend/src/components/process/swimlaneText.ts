/**
 * A sequence-flow label as a caseworker can read it. The parser falls back to
 * the flow's condition expression when the flow has no name, so labels arrive
 * as `${completenessResult.isComplete == false}`. This keeps the meaning and
 * drops the syntax: the braces go, a property path shrinks to its last name,
 * and the operators become words or symbols. A plain name passes unchanged.
 * The full expression stays available as the label's tooltip.
 */
export function edgeLabelText(label: string): string {
  const expr = /^[$#]\{([\s\S]*)\}$/.exec(label.trim());
  if (!expr) return label;
  return expr[1]
    .replace(/[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+/g, (path) => path.slice(path.lastIndexOf('.') + 1))
    .replace(/\s*!=\s*/g, ' ≠ ')
    .replace(/\s*==\s*/g, ' = ')
    .replace(/\s*&&\s*/g, ' en ')
    .replace(/\s*\|\|\s*/g, ' of ')
    .replace(/\s+/g, ' ')
    .trim();
}
