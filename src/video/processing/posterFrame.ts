/**
 * Avoid a likely-black first frame. Use an early but usable timestamp.
 */
export function selectPosterTimestampSec(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0.15
  if (durationSec < 0.4) return Math.max(0, durationSec * 0.4)
  if (durationSec <= 2) return Math.min(0.5, durationSec * 0.35)
  if (durationSec <= 8) return Math.min(1.2, durationSec * 0.2)
  return Math.min(3, durationSec * 0.12)
}
