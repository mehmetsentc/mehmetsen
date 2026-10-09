/**
 * POST /api/admin/social/accounts/connect  { platform, ownership: { citySlug } }
 * Starts the official OAuth flow. Returns the platform authorize URL (the
 * browser navigates there) and sets an HttpOnly binding cookie.
 * The authorize URL carries only app id, redirect URI, scopes and state.
 */
import { applyCookies, json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { startConnection } from '@/lib/social/accounts/connect/flows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const r = await startConnection({ ctx: auth.ctx, platform: body.platform, ownership: body.ownership })
  if (!r.ok) return json({ error: r.code, code: r.code, ...(r.missing ? { missing: r.missing } : {}) }, r.status)
  return applyCookies(json({ authorizeUrl: r.authorizeUrl }), [r.cookie])
}
