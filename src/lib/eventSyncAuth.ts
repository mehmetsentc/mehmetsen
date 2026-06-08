/**
 * Shared auth helpers for the event sync API (cron secret + admin bootstrap UIDs).
 */

export function getSyncSecret(): string | undefined {
  return (
    process.env.EVENTS_SYNC_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    undefined
  )
}

export function getBootstrapAdminUids(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_UIDS?.trim()
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export function isSyncSecretAuthorized(request: Request): boolean {
  const secret = getSyncSecret()
  if (!secret) return false

  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${secret}`) return true

  if (request.headers.get('x-cron-secret') === secret) return true

  const url = new URL(request.url)
  if (url.searchParams.get('secret') === secret) return true

  return false
}
