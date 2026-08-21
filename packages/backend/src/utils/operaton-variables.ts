import { OperatonVariable } from '@ronl/shared';

/**
 * Infer Operaton's variable type tag from a plain JavaScript value.
 *
 * Operaton's REST API takes variables as `{ value, type }` envelopes, so every
 * route that accepts a JSON body of plain values has to tag them on the way in.
 * This lived as four byte-identical private copies (process, task, decision and
 * m2m routes) before being extracted here.
 *
 * The `default` arm is unreachable from an HTTP request — JSON.parse only ever
 * yields boolean, number, string, object or null, and undefined is caught by the
 * guard above it — but bigint, symbol and function all land there for a direct
 * caller, so it is a real fallback rather than dead code.
 */
export function inferType(value: unknown): OperatonVariable['type'] {
  if (value === null || value === undefined) return 'Null';

  switch (typeof value) {
    case 'boolean':
      return 'Boolean';
    case 'number':
      return Number.isInteger(value) ? 'Integer' : 'Double';
    case 'string':
      return 'String';
    case 'object':
      return 'Json';
    default:
      return 'String';
  }
}
