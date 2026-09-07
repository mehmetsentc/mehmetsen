'use client'

/** Client mirror of SMART_FEED_ENABLED. */
export function isSmartFeedEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_SMART_FEED_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

export function isSmartFeedVideoEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_SMART_FEED_VIDEO_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

/**
 * GLOBAL_NAV_V2 — default ON.
 * Removes global bottom MobileNav; header + side drawer are the authority.
 * Kill-switch: NEXT_PUBLIC_GLOBAL_NAV_V2=0
 */
export function isGlobalNavV2EnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_GLOBAL_NAV_V2?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  if (v === '1' || v === 'true' || v === 'yes') return true
  return true
}
