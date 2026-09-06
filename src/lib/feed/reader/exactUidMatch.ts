/**
 * Exact opaque Firebase UID equality — no normalization.
 * Shared by server identity debug and unit tests (no UID constants here).
 */
export function exactUidMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return Boolean(a && b && a === b)
}
