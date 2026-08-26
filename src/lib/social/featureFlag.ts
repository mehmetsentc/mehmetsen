/** SOCIAL_GRAPH_ENABLED — prod default false. Postgres social actions via API. */
export function isSocialGraphEnabled(): boolean {
  const v = process.env.SOCIAL_GRAPH_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

/** USER_PROFILES_ENABLED — prod default false. Postgres user profiles + /u routes. */
export function isUserProfilesEnabled(): boolean {
  const v = process.env.USER_PROFILES_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

/** APPLE_AUTH_ENABLED — prod default false. Requires Firebase Console Apple provider. */
export function isAppleAuthEnabled(): boolean {
  const v = process.env.APPLE_AUTH_ENABLED?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return process.env.NODE_ENV !== 'production'
}

/** EMAIL_AUTH_ENABLED — prod default true (existing email/password flow). */
export function isEmailAuthEnabled(): boolean {
  const v = process.env.EMAIL_AUTH_ENABLED?.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}
