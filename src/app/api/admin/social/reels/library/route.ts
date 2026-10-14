/**
 * GET /api/admin/social/reels/library?limit= → saved reel videos (newest first):
 * news id, headline, video + cover URL, length, presenter, style, renders (REELS-5).
 * Auth: central social-account manager (same as the studio).
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { listReels } from '@/lib/reels/reelLibrary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const limit = Math.min(120, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 60))
  try {
    return json({ items: await listReels(limit) })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err), items: [] }, 500)
  }
}
