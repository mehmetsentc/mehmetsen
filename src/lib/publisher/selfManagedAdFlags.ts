/** Publisher self-managed ads flags — prod default false. */

function flag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

export function isPublisherSelfManagedAdsEnabled(): boolean {
  return flag('PUBLISHER_SELF_MANAGED_ADS_ENABLED')
}

export function isPublisherAdServingEnabled(): boolean {
  return flag('PUBLISHER_AD_SERVING_ENABLED')
}

export function isPublisherVideoPrerollEnabled(): boolean {
  return flag('PUBLISHER_VIDEO_PREROLL_ENABLED')
}

export function isPublisherAdAnalyticsEnabled(): boolean {
  return flag('PUBLISHER_AD_ANALYTICS_ENABLED')
}
