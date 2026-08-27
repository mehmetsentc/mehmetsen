/** Central config for self-managed ad serving — no magic numbers in components. */

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

/** Max pre-roll duration (seconds). */
export function prerollMaxDurationSeconds(): number {
  return intEnv('PUBLISHER_AD_PREROLL_MAX_SECONDS', 15)
}

/** Skip button after N seconds. */
export function prerollSkipAfterSeconds(): number {
  return intEnv('PUBLISHER_AD_PREROLL_SKIP_AFTER_SECONDS', 5)
}

/** Same ad max views per session (guest). */
export function prerollSessionFrequencyCap(): number {
  return intEnv('PUBLISHER_AD_PREROLL_SESSION_CAP', 2)
}

/** Visible ratio threshold for impression (0–1). */
export function impressionVisibleRatio(): number {
  const n = Number(process.env.PUBLISHER_AD_IMPRESSION_VISIBLE_RATIO ?? '0.5')
  if (!Number.isFinite(n) || n <= 0 || n > 1) return 0.5
  return n
}

/** Dwell ms before counting impression. */
export function impressionDwellMs(): number {
  return intEnv('PUBLISHER_AD_IMPRESSION_DWELL_MS', 1000)
}

/** Max creative upload bytes (default 20MB). */
export function adCreativeMaxBytes(): number {
  return intEnv('PUBLISHER_AD_CREATIVE_MAX_BYTES', 20 * 1024 * 1024)
}

export const AD_CREATIVE_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
])
