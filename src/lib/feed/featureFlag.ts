/** SMART_FEED_ENABLED — prod default true. Fullscreen smart feed at /feed-v2. */
export function isSmartFeedEnabled(): boolean {
  const v = process.env.SMART_FEED_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

/** SMART_FEED_TELEMETRY_ENABLED — prod default true. */
export function isSmartFeedTelemetryEnabled(): boolean {
  const v = process.env.SMART_FEED_TELEMETRY_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

/** SMART_FEED_VIDEO_ENABLED — prod default true. Autoplay video on active card. */
export function isSmartFeedVideoEnabled(): boolean {
  const v = process.env.SMART_FEED_VIDEO_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

/** SMART_FEED_RANKING_V1_ENABLED — prod default true. P5 scoring pipeline. */
export function isSmartFeedRankingV1Enabled(): boolean {
  const v = process.env.SMART_FEED_RANKING_V1_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

/** COLD_START_V2_ENABLED — prod default true. P6 cold-start feed mix. */
export function isColdStartV2Enabled(): boolean {
  const v = process.env.COLD_START_V2_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}
