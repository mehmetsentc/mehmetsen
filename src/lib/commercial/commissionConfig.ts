/**
 * Platform commission config — Phase P10A.
 * Default 1500 bps = 15%. Override via DEFAULT_PLATFORM_COMMISSION_BPS env.
 * Never hard-code magic numbers inside services — import from here.
 */

export const DEFAULT_PLATFORM_COMMISSION_BPS = 1500

export function getDefaultPlatformCommissionBps(): number {
  const raw = process.env.DEFAULT_PLATFORM_COMMISSION_BPS?.trim()
  if (raw == null || raw === '') return DEFAULT_PLATFORM_COMMISSION_BPS
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 10_000) {
    return DEFAULT_PLATFORM_COMMISSION_BPS
  }
  return n
}
