/** Client-safe feature flag reads (NEXT_PUBLIC_* mirrors). */

export function isSocialGraphEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_SOCIAL_GRAPH_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

export function isUserProfilesEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_USER_PROFILES_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

/**
 * Apple Sign-In is fully implemented (native Capacitor SIWA flow + Firebase
 * OAuthProvider web flow, see src/lib/appleAuth.ts) and already renders
 * unconditionally on Register in Production. Default to enabled — same as
 * the other three flags in this file — so LOGIN and REGISTER expose it
 * consistently. NEXT_PUBLIC_APPLE_AUTH_ENABLED remains a kill switch: set it
 * to "false" to hide the button everywhere without a redeploy.
 */
export function isAppleAuthEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

export function isEmailAuthEnabledClient(): boolean {
  const v = process.env.NEXT_PUBLIC_EMAIL_AUTH_ENABLED?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}
