/**
 * Optional per-operation token/char budgets.
 * Absent or invalid ENV → caller fallback (current production limits).
 */

function readPositiveInt(name: string): number | null {
  const raw = process.env[name]?.trim()
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.floor(n)
}

export function inputCharLimit(envName: string, fallback: number): number {
  return readPositiveInt(envName) ?? fallback
}

export function outputTokenLimit(envName: string, fallback: number): number {
  return readPositiveInt(envName) ?? fallback
}

/** When unset, omit max_tokens (preserve APIs that currently send none). */
export function optionalOutputTokenLimit(envName: string): number | null {
  return readPositiveInt(envName)
}
