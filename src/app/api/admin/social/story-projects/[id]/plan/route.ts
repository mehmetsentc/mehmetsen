/**
 * POST /api/admin/social/story-projects/{id}/plan → background AI plan (202 { job })
 *   Scenes, highlights, labels and which upload (or AI illustration) each sentence gets.
 *   Replaces the current scene list. GET ?job=… polls it.
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { getStory, setPlan, shortId } from '@/lib/story/storyStore'
import { pollStoryJob } from '@/lib/story/storyJobRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Ctx = { params: Promise<{ id: string }> }

export const GET = (request: Request) => pollStoryJob(request)

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const p = await getStory(id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['splan', id]),
    kind: 'build',
    newsId: `story_${id}`,
    by: uid,
    run: async () => {
      const { planStory } = await import('@/lib/story/storyAi')
      const fresh = (await getStory(id)) ?? p
      const plan = await planStory(fresh, shortId)
      const project = await setPlan(uid, id, plan, Date.now())
      await writeSocialAudit({ actorId: uid, action: 'story.plan', entityType: 'storyProject', entityId: id, meta: { scenes: plan.scenes.length, source: plan.source, assets: fresh.assets.length } })
      return { result: { project, source: plan.source, note: plan.note } }
    },
  })
  return json({ job }, 202)
}
