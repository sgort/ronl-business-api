/**
 * A process key is deployed under several organisations and none of them is
 * the caller's, so there is no basis for choosing which one handles the case
 * (#228). Refused rather than decided by the order Operaton lists the rows in.
 */
export class AmbiguousDeploymentError extends Error {
  constructor(
    readonly processKey: string,
    readonly tenants: string[]
  ) {
    super(
      `Process '${processKey}' is deployed under several organisations (${tenants.join(', ')}), none of them the caller's`
    );
    this.name = 'AmbiguousDeploymentError';
  }
}

/**
 * Extracts a human-readable error message from an unknown caught value.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
