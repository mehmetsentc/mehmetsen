/**
 * REKLAM STÜDYOSU — GET /api/admin/ad-studio (son 50 reklam) · POST /api/admin/ad-studio (yeni reklam)
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { createAd, listAds } from '@/lib/adStudio/adStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ ads: await listAds() })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const r = await createAd(auth.ctx.uid, body, Date.now())
  if (!r.ok) return json({ error: r.error, code: r.code }, r.status)
  return json({ ad: r.value }, 201)
}
