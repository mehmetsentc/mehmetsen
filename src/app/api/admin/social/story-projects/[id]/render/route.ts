/**
 * POST /api/admin/social/story-projects/{id}/render → background render (202 { job })
 *   Narration + scenes + captions → one MP4. An unchanged project is not rendered twice.
 * GET ?job=… polls it.
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { renderKeyFor, renderProblem } from '@/lib/story/storyProject'
import { getStory } from '@/lib/story/storyStore'
import { pollStoryJob } from '@/lib/story/storyJobRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

type Ctx = { params: Promise<{ id: string }> }

export const GET = (request: Request) => pollStoryJob(request)

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const p = await getStory(id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  const problem = renderProblem(p)
  if (problem) return json({ error: problem, code: 'not_ready' }, 409)
  const key = renderKeyFor(p)
  if (p.render.status === 'ready' && p.render.key === key && p.render.outputUrl) return json({ project: p, reused: true })
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['srender', id, key]),
    kind: 'render',
    newsId: `story_${id}`,
    by: uid,
    run: async () => {
      const { renderAndStore } = await import('@/lib/story/storyRender')
      const out = await renderAndStore(id)
      await writeSocialAudit({ actorId: uid, action: 'story.render', entityType: 'storyProject', entityId: id, meta: { seconds: out.seconds, reused: out.reused, stored: out.stored, voice: out.voiceEngine, scenes: p.scenes.length } })
      return { result: { ...out, project: await getStory(id) } }
    },
  })
  return json({ job }, 202)
}
