/**
 * POST /api/admin/social/story-projects/{id}/images { sceneId? } → background job (202 { job })
 *   Generates the missing AI illustrations (all, or one scene), one by one, against the
 *   monthly budget (STORY_IMAGE_BUDGET_USD). GET ?job=… polls it.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { allowsAiImages, isShortId, missingImages } from '@/lib/story/storyProject'
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
  const body = await readJsonBody(request)
  const p = await getStory(id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  // cost guard: AI drawings only in 1-minute videos; longer ones use the editor's own media
  if (!allowsAiImages(p)) return json({ error: 'Uzun videolarda AI çizimi kullanılmıyor — kendi fotoğraf / videolarınızı ekleyin', code: 'ai_off_long' }, 409)
  const sceneId = isShortId(body.sceneId) ? body.sceneId : undefined
  const todo = missingImages(p).filter((s) => !sceneId || s.id === sceneId)
  if (!todo.length) return json({ job: null, made: 0, note: 'Üretilecek çizim yok' })
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['simg', id, sceneId ?? 'all']),
    kind: 'build',
    newsId: `story_${id}`,
    by: uid,
    run: async () => {
      const { generateImages } = await import('@/lib/story/storyRender')
      const { getStory: reload } = await import('@/lib/story/storyStore')
      const r = await generateImages(id, sceneId)
      await writeSocialAudit({ actorId: uid, action: 'story.images', entityType: 'storyProject', entityId: id, meta: { made: r.made, failed: r.failed, budgetStop: r.budgetStop } })
      return { result: { ...r, project: await reload(id) }, httpStatus: r.failed && !r.made ? 502 : 200 }
    },
  })
  return json({ job }, 202)
}
