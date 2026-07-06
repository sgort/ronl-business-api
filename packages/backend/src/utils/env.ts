/**
 * Pure environment-variable parsers.
 *
 * Kept separate from config.ts so they can be imported (and unit-tested) without
 * triggering config.ts's import-time side effects (dotenv loading + validateConfig).
 */

export function parseEnvArray(value: string | undefined, defaultValue: string[]): string[] {
  if (!value) return defaultValue;
  return value.split(',').map((s) => s.trim());
}

export function parseEnvInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function parseEnvBool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}
