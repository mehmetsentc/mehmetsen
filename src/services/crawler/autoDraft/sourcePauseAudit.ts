/**
 * Phase 4F.3.1 — derived pause reason for CMS display (no bulk DB rewrite).
 */

export const UNKNOWN_LEGACY_PAUSE_REASON = 'UNKNOWN_LEGACY' as const

/**
 * Display reason for a paused/degraded source.
 * Never invents operational facts — UNKNOWN_LEGACY when evidence is insufficient.
 */
export function derivedSourcePauseReason(input: {
  status: string
  lastPauseReason: string | null | undefined
}): string | null {
  const raw = input.lastPauseReason?.trim()
  if (raw) return raw
  if (input.status === 'PAUSED' || input.status === 'DEGRADED') {
    return UNKNOWN_LEGACY_PAUSE_REASON
  }
  return null
}

/** Reason string required when transitioning into PAUSED. */
export function requirePauseReason(reason: string | null | undefined): string {
  const r = reason?.trim()
  if (!r) {
    throw new Error('PAUSE_REASON_REQUIRED')
  }
  return r
}
