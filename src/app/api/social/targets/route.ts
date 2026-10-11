/**
 * GET /api/social/targets?newsId=…&formats=post|story|post,story
 * Accounts the signed-in user may pick for THIS news item, each with
 * selectable / reason / reconnect. No legacy option exists. Every publish
 * route re-checks the same rules server-side.
 */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json } from '@/lib/social/accounts/connect/routeHelpers'
import { manualTargetsForNews } from '@/lib/social/accounts/manualTargets'
import type { PublishFormat } from '@/lib/social/accounts/capabilities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  const url = new URL(request.url)
  const newsId = url.searchParams.get('newsId') ?? ''
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(newsId)) return json({ error: 'invalid_news', code: 'invalid_news' }, 400)
  const formats = [...new Set((url.searchParams.get('formats') ?? 'post').split(','))].filter((f): f is PublishFormat => f === 'post' || f === 'story')
  if (formats.length === 0) return json({ error: 'invalid_format', code: 'invalid_format' }, 400)
  const r = await manualTargetsForNews(auth.actor, newsId, formats, Date.now())
  if (!r.ok) return json({ error: r.code, code: r.code }, r.status)
  return json({ options: r.options })
}
