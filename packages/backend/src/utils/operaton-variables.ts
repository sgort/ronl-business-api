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

/**
 * Wrap a plain JavaScript value in Operaton's `{ value, type }` envelope.
 *
 * A `Json` variable's value is serialised to a string: Operaton refuses any
 * other value for that type ("Must provide 'null' or String value for value of
 * SerializableValue type 'Json'"). Sending the object itself is what made a
 * form-js dynamic list, which submits an array of row objects, fail to save.
 */
export function toOperatonVariable(value: unknown): OperatonVariable {
  const type = inferType(value);
  return { value: type === 'Json' ? JSON.stringify(value) : value, type };
}

/**
 * The value of a Json variable read without deserialising: its JSON text,
 * parsed. Null stays null. Text that is not valid JSON is returned as it is
 * and reported through onInvalid, so one bad value does not fail a read of
 * every other variable. A value that is not text is returned unchanged.
 */
export function fromJsonVariableText(text: unknown, onInvalid?: (error: unknown) => void): unknown {
  if (text === null || text === undefined) return null;
  if (typeof text !== 'string') return text;
  try {
    return JSON.parse(text);
  } catch (error) {
    onInvalid?.(error);
    return text;
  }
}
