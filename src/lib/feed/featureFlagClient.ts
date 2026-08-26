'use client'

/** Client mirror of SMART_FEED_ENABLED. */
export function isSmartFeedEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_SMART_FEED_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

export function isSmartFeedVideoEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_SMART_FEED_VIDEO_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}
