/** PUBLISHER_PLATFORM_ENABLED — prod default false. */
export function isPublisherPlatformEnabled(): boolean {
  const v = process.env.PUBLISHER_PLATFORM_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

/** Publisher Studio — prod default false. */
export function isPublisherStudioEnabled(): boolean {
  const v = process.env.PUBLISHER_STUDIO_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

/** Public profile layout composer output — prod default false. */
export function isPublisherProfileComposerEnabled(): boolean {
  const v = process.env.PUBLISHER_PROFILE_COMPOSER_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

export {
  isPublisherContentStudioEnabled,
  isPublisherManualPublishEnabled,
  isPublisherSchedulingEnabled,
} from './contentFlags'
