/** GET /api/social/me — what the signed-in user may connect / manage (no secrets). */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json } from '@/lib/social/accounts/connect/routeHelpers'
import { allConfigStatuses } from '@/lib/social/accounts/connect/flows'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  const a = auth.actor
  const cfg = allConfigStatuses()
  return json({
    central: a.central,
    provinces: a.provinces,
    staff: a.isStaff,
    publishers: [...new Set([...a.publisherManage, ...a.publisherPublish])].map((id) => ({
      id,
      name: a.publisherNames?.[id] ?? id,
      canManage: a.publisherManage.includes(id),
    })),
    // Platform readiness only (env NAMES are not exposed to non-admins).
    platforms: Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, { ready: v.ready }])),
  })
}
