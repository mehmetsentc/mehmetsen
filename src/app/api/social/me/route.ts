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
  const publicAccess = new Set((process.env.SOCIAL_PUBLIC_ACCESS ?? '').split(',').map((x) => x.trim()).filter(Boolean))
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
    // publicAccess: Meta genel erişim onayı (App Review / Advanced Access) — yalnız
    // onay doğrulandıktan sonra SOCIAL_PUBLIC_ACCESS="instagram,facebook,threads" ile açılır.
    platforms: Object.fromEntries(
      Object.entries(cfg).map(([k, v]) => [k, { ready: v.ready, publicAccess: publicAccess.has(k) ? 'approved' : 'pending', ...(a.central ? { appId: v.appId ?? null } : {}) }]),
    ),
  })
}
