/** SMART_FEED_ENABLED — prod default false. Fullscreen smart feed at /feed-v2. */
export function isSmartFeedEnabled(): boolean {
  const v = process.env.SMART_FEED_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

/** SMART_FEED_TELEMETRY_ENABLED — prod default false. */
export function isSmartFeedTelemetryEnabled(): boolean {
  const v = process.env.SMART_FEED_TELEMETRY_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return false
}

/** SMART_FEED_VIDEO_ENABLED — prod default false. Autoplay video on active card. */
export function isSmartFeedVideoEnabled(): boolean {
  const v = process.env.SMART_FEED_VIDEO_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

/** SMART_FEED_RANKING_V1_ENABLED — prod default false. P5 scoring pipeline. */
export function isSmartFeedRankingV1Enabled(): boolean {
  const v = process.env.SMART_FEED_RANKING_V1_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return false
}
