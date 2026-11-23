/**
 * GET  /api/admin/social/story-projects — recent «Konu → Video» projects + AI / budget state
 * POST /api/admin/social/story-projects — create { title?, topic, script?, style, seriesLabel?, rights }
 *      or { fromNewsId, style?, … } — prepared from a news item (its text + own photos / video)
 * Central social-account managers only; same-origin for changes.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { createStory, createStoryFromNews, listStories } from '@/lib/story/storyStore'
import { storyAiReady, storyImageUsage } from '@/lib/story/storyAi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const [projects, usage] = await Promise.all([listStories(), storyImageUsage().catch(() => null)])
  return json({ projects, ai: storyAiReady(), usage, uid: auth.ctx.uid })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  // HABERDEN-VIDEO: { fromNewsId, style?, format?, targetMin?, voice?, music?, sfx? }
  const r = body.fromNewsId !== undefined ? await createStoryFromNews(auth.ctx.uid, body.fromNewsId, body, Date.now()) : await createStory(auth.ctx.uid, body, Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code, field: r.field ?? null }, r.status)
  return json({ project: r.value }, 201)
}
