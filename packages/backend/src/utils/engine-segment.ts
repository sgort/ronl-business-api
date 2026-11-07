/**
 * One value placed in an Operaton URL path (#415).
 *
 * The backend calls the engine as an operaton-admin account, and Express has
 * already decoded route parameters, so a caller's "x/../../process-instance?"
 * would otherwise reach a different engine endpoint with admin rights. Every
 * interpolated path value goes through here: encodeURIComponent, with ":" left
 * readable for definition IDs (key:version:uuid), and the segments "." and ".."
 * (which encodeURIComponent leaves alone) refused outright.
 */
export function engineSegment(value: string): string {
  if (value === '' || value === '.' || value === '..') {
    throw new Error(`Invalid Operaton path segment: ${JSON.stringify(value)}`);
  }
  return encodeURIComponent(value).replace(/%3A/gi, ':');
}
