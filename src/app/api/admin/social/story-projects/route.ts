/**
 * GET  /api/admin/social/story-projects — recent «Konu → Video» projects + AI / budget state
 * POST /api/admin/social/story-projects — create { title?, topic, script?, style, seriesLabel?, rights }
 * Central social-account managers only; same-origin for changes.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { createStory, listStories } from '@/lib/story/storyStore'
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
  const r = await createStory(auth.ctx.uid, await readJsonBody(request), Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code, field: r.field ?? null }, r.status)
  return json({ project: r.value }, 201)
}
