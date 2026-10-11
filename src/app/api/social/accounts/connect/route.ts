/**
 * POST /api/social/accounts/connect { platform, ownership: { kind: 'user' | 'publisher' | 'province' | 'central', publisherId?, citySlug? } }
 * Starts the platform's own OAuth screen. Ownership is built from the user's
 * rights (a normal user can only connect a personal account). No passwords or
 * tokens are ever entered in NaHaber.
 */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { applyCookies, json, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import { startConnection } from '@/lib/social/accounts/connect/flows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const r = await startConnection({ actor: auth.actor, platform: body.platform, ownership: body.ownership })
  if (!r.ok) return json({ error: r.code, code: r.code, ...(r.missing ? { missing: r.missing } : {}) }, r.status)
  return applyCookies(json({ authorizeUrl: r.authorizeUrl }), [r.cookie])
}
