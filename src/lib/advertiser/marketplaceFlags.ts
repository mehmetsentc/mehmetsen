/** Advertiser marketplace feature flags — prod default false. */

function flag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

/** Advertiser accounts + studio shell. */
export function isAdvertiserPlatformEnabled(): boolean {
  return flag('ADVERTISER_PLATFORM_ENABLED')
}

/** Public marketplace browse + inventory detail. */
export function isAdMarketplaceEnabled(): boolean {
  return flag('AD_MARKETPLACE_ENABLED')
}

/** Booking request create/submit/approve workflow. */
export function isAdBookingRequestsEnabled(): boolean {
  return flag('AD_BOOKING_REQUESTS_ENABLED')
}

/** Creative upload + submission. */
export function isAdCreativeSubmissionEnabled(): boolean {
  return flag('AD_CREATIVE_SUBMISSION_ENABLED')
}
