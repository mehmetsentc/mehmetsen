/**
 * LP6 Publisher Themes — curated accent-color palette.
 *
 * Publishers may only choose an accent color from this fixed, pre-approved
 * list — never a free hex picker. See
 * NaHaber_LivingPaper_LP6_PublisherThemes_v1.md §6: "Accent colors are
 * chosen from a curated, pre-approved palette ... not a free hex picker —
 * the same discipline DEFAULT_CATEGORIES already applies to category
 * colors." Every entry below has already been checked for sufficient
 * distance from NaHaber's own brand red so a publisher accent can never be
 * mistaken for house editorial content (checked in
 * accentPalette.test.ts, not left to trust).
 */

export interface PublisherAccentSwatch {
  hex: string
  label: string
}

export const PUBLISHER_ACCENT_PALETTE: PublisherAccentSwatch[] = [
  { hex: '#2563EB', label: 'Lacivert Mavi' },
  { hex: '#0891B2', label: 'Turkuaz' },
  { hex: '#059669', label: 'Zümrüt Yeşil' },
  { hex: '#65A30D', label: 'Zeytin Yeşili' },
  { hex: '#CA8A04', label: 'Hardal Sarısı' },
  { hex: '#D97706', label: 'Kehribar' },
  { hex: '#7C3AED', label: 'Mor' },
  { hex: '#C026D3', label: 'Eflatun' },
  { hex: '#DB2777', label: 'Pembe' },
  { hex: '#475569', label: 'Antrasit Gri' },
]

const PUBLISHER_ACCENT_HEX_SET = new Set(PUBLISHER_ACCENT_PALETTE.map((s) => s.hex.toUpperCase()))

/** NaHaber's own brand red — src/styles/tokens/colors.css --brand-500 (#E50914). */
export const NAHABER_BRAND_RED_HEX = '#E50914'

/** Minimum Euclidean RGB distance a publisher accent must keep from brand red. */
export const PUBLISHER_ACCENT_MIN_BRAND_RED_DISTANCE = 90

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Simple Euclidean RGB distance — sufficient for a small curated palette, not a full ΔE model. */
export function rgbDistance(hexA: string, hexB: string): number | null {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return null
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

export function distanceFromBrandRed(hex: string): number | null {
  return rgbDistance(hex, NAHABER_BRAND_RED_HEX)
}

/**
 * Authoritative guardrail — call this server-side before ever persisting a
 * publisher's accentColorHex. `null` (clearing the accent, falling back to
 * NaHaber's neutral default) is always allowed; any other value must be an
 * exact member of PUBLISHER_ACCENT_PALETTE.
 */
export function isAllowedPublisherAccent(hex: string | null | undefined): boolean {
  if (hex === null || hex === undefined) return true
  return PUBLISHER_ACCENT_HEX_SET.has(hex.trim().toUpperCase())
}
