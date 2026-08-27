/** Publisher Content Studio feature flags — prod default false. */

export function isPublisherContentStudioEnabled(): boolean {
  const v = process.env.PUBLISHER_CONTENT_STUDIO_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

export function isPublisherManualPublishEnabled(): boolean {
  const v = process.env.PUBLISHER_MANUAL_PUBLISH_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

export function isPublisherSchedulingEnabled(): boolean {
  const v = process.env.PUBLISHER_SCHEDULING_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}
