/**
 * REELS-1 — Google TTS free-tier guard (pure rules).
 * Google bills per character with a monthly free tier per voice type (Oct 2026
 * price list): Standard 4M, WaveNet 4M, Neural2 1M, Chirp 3 HD 1M, Studio 1M.
 * We stop at a safety margin below the free tier and never go over it without
 * an explicit admin approval for that month.
 */
export type TtsTier = 'standard' | 'wavenet' | 'neural2' | 'chirp' | 'studio'

export const TTS_FREE_CHARS: Record<TtsTier, number> = {
  standard: 4_000_000,
  wavenet: 4_000_000,
  neural2: 1_000_000,
  chirp: 1_000_000,
  studio: 1_000_000,
}

/** Default safety margin: stop at 95% of the free tier. */
export const TTS_SAFETY_RATIO = 0.95

export function tierForVoice(voice: string): TtsTier {
  const v = voice.toLowerCase()
  if (v.includes('chirp')) return 'chirp'
  if (v.includes('wavenet')) return 'wavenet'
  if (v.includes('neural2')) return 'neural2'
  if (v.includes('studio')) return 'studio'
  if (v.includes('standard')) return 'standard'
  // Unknown voice names are treated as the strictest (1M) tier.
  return 'chirp'
}

export function safeCap(tier: TtsTier, ratio = TTS_SAFETY_RATIO): number {
  const r = Number.isFinite(ratio) && ratio > 0 && ratio <= 1 ? ratio : TTS_SAFETY_RATIO
  return Math.floor(TTS_FREE_CHARS[tier] * r)
}

/** Billed characters (Unicode code points, spaces included). */
export function billedChars(text: string): number {
  return [...text].length
}

/** Google's free tier resets monthly; we key usage by UTC calendar month. */
export function usageMonth(d = new Date()): string {
  return d.toISOString().slice(0, 7)
}

export type QuotaDecision =
  | { ok: true; afterUse: number; overFree: boolean }
  | { ok: false; reason: 'free_tier_reached'; used: number; cap: number }

export function decideQuota(input: { used: number; request: number; cap: number; overageApproved: boolean }): QuotaDecision {
  const afterUse = input.used + input.request
  if (afterUse <= input.cap) return { ok: true, afterUse, overFree: false }
  if (input.overageApproved) return { ok: true, afterUse, overFree: true }
  return { ok: false, reason: 'free_tier_reached', used: input.used, cap: input.cap }
}
