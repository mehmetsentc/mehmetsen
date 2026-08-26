/** Client-safe feature flag reads (NEXT_PUBLIC_* mirrors). */

export function isSocialGraphEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_SOCIAL_GRAPH_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

export function isUserProfilesEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_USER_PROFILES_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

export function isAppleAuthEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

export function isEmailAuthEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_EMAIL_AUTH_ENABLED?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}
