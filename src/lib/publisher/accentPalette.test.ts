import { describe, expect, it } from 'vitest'
import {
  NAHABER_BRAND_RED_HEX,
  PUBLISHER_ACCENT_MIN_BRAND_RED_DISTANCE,
  PUBLISHER_ACCENT_PALETTE,
  accentColorCssVarValue,
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

describe('accentColorCssVarValue', () => {
  it('converts a curated palette hex into a space-separated RGB triplet', () => {
    // #2563EB -> R=37 G=99 B=235
    expect(accentColorCssVarValue('#2563EB')).toBe('37 99 235')
  })

  it('is case-insensitive on the hex digits', () => {
    expect(accentColorCssVarValue('#2563eb')).toBe('37 99 235')
  })

  it('works without a leading #', () => {
    expect(accentColorCssVarValue('2563EB')).toBe('37 99 235')
  })

  it('returns null for null/undefined so callers fall back to the default brand color', () => {
    expect(accentColorCssVarValue(null)).toBeNull()
    expect(accentColorCssVarValue(undefined)).toBeNull()
  })

  it('returns null for malformed hex input rather than throwing', () => {
    expect(accentColorCssVarValue('not-a-color')).toBeNull()
    expect(accentColorCssVarValue('#12')).toBeNull()
    expect(accentColorCssVarValue('')).toBeNull()
  })

  it('produces a valid triplet for every curated palette entry', () => {
    for (const swatch of PUBLISHER_ACCENT_PALETTE) {
      const triplet = accentColorCssVarValue(swatch.hex)
      expect(triplet).not.toBeNull()
      expect(triplet as string).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/)
    }
  })
})
