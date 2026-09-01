import { describe, expect, it } from 'vitest'
import {
  NAHABER_BRAND_RED_HEX,
  PUBLISHER_ACCENT_MIN_BRAND_RED_DISTANCE,
  PUBLISHER_ACCENT_PALETTE,
  distanceFromBrandRed,
  isAllowedPublisherAccent,
} from '@/lib/publisher/accentPalette'

describe('publisher accent palette guardrails', () => {
  it('keeps every curated swatch far enough from NaHaber brand red', () => {
    expect(NAHABER_BRAND_RED_HEX).toBe('#E50914')
    for (const swatch of PUBLISHER_ACCENT_PALETTE) {
      const distance = distanceFromBrandRed(swatch.hex)
      expect(distance).not.toBeNull()
      expect(distance as number).toBeGreaterThanOrEqual(PUBLISHER_ACCENT_MIN_BRAND_RED_DISTANCE)
    }
  })

  it('allows null (clearing the accent)', () => {
    expect(isAllowedPublisherAccent(null)).toBe(true)
    expect(isAllowedPublisherAccent(undefined)).toBe(true)
  })

  it('allows every curated palette entry, case-insensitively', () => {
    for (const swatch of PUBLISHER_ACCENT_PALETTE) {
      expect(isAllowedPublisherAccent(swatch.hex)).toBe(true)
      expect(isAllowedPublisherAccent(swatch.hex.toLowerCase())).toBe(true)
    }
  })

  it('rejects an arbitrary free-hand hex not in the palette', () => {
    expect(isAllowedPublisherAccent('#123456')).toBe(false)
  })

  it('rejects a red lookalike that was never curated', () => {
    expect(isAllowedPublisherAccent('#D8101F')).toBe(false)
  })
})
