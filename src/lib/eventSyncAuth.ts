/**
 * Shared auth helpers for cron/sync API routes (client-safe sync secret only).
 */

export function getSyncSecret(): string | undefined {
  return (
    process.env.EVENTS_SYNC_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    undefined
  )
}

/** Cron secret via Authorization: Bearer only (no query-string leaks). */
export function isSyncSecretAuthorized(request: Request): boolean {
  const secret = getSyncSecret()
  if (!secret) return false

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${secret}`
}
