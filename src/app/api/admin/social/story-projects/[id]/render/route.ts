/**
 * POST /api/admin/social/story-projects/{id}/render → background render
 *   1-minute videos: one job (202 { job }).
 *   3 / 5 / 10-minute videos: rendered in steps; every POST starts the next step and the
 *   studio calls again until the video is ready (202 { phase, job }):
 *     prepare — narration for every scene + part plan (one job)
 *     parts   — POST without `part` lists the missing parts; POST { part } renders one.
 *               Each part is its own request (own function), so the studio runs a few
 *               side by side (≈ 45 s of video each).
 *     finish  — join the parts without re-encoding the picture (one job)
 *   Storage holds the progress, so a closed tab resumes where it stopped.
 *   An unchanged project is not rendered twice.
 * GET ?job=… polls a job.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
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
  const body = await readJsonBody(request)
  const p = await getStory(id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  const problem = renderProblem(p)
  if (problem) return json({ error: problem, code: 'not_ready' }, 409)
  const key = renderKeyFor(p)
  if (p.render.status === 'ready' && p.render.key === key && p.render.outputUrl) return json({ project: p, reused: true })
  const uid = auth.ctx.uid
  const R = await import('@/lib/story/storyRender')

  if (!R.usesParts(p)) {
    const job = await startReelJob({
      jobId: reelJobId(['srender', id, key]),
      kind: 'render',
      newsId: `story_${id}`,
      by: uid,
      run: async () => {
        const out = await R.renderAndStore(id)
        await writeSocialAudit({ actorId: uid, action: 'story.render', entityType: 'storyProject', entityId: id, meta: { seconds: out.seconds, reused: out.reused, stored: out.stored, voice: out.voiceEngine, scenes: p.scenes.length } })
        return { result: { ...out, project: await getStory(id) } }
      },
    })
    return json({ job }, 202)
  }

  const st = await R.longRenderState(p)
  if (st.phase === 'ready') return json({ project: p, reused: true })
  const guard = <T,>(fn: () => Promise<T>) => async () => {
    try {
      return { result: await fn() }
    } catch (err) {
      await R.failRender(id, err)
      throw err
    }
  }
  if (st.phase === 'prepare') {
    const job = await startReelJob({
      jobId: reelJobId(['sprep', id, key]),
      kind: 'render',
      newsId: `story_${id}`,
      by: uid,
      run: guard(async () => {
        const plan = await R.prepareLongRender(id)
        return { phase: 'prepare', parts: plan.ranges.length }
      }),
    })
    return json({ phase: 'prepare', job }, 202)
  }
  if (st.phase === 'parts') {
    const k = typeof body.part === 'number' && Number.isInteger(body.part) ? body.part : null
    if (k === null || !st.missing.includes(k)) return json({ phase: 'parts', total: st.total, done: st.total - st.missing.length, missing: st.missing })
    const job = await startReelJob({
      jobId: reelJobId(['spart', id, key, String(k)]),
      kind: 'render',
      newsId: `story_${id}`,
      by: uid,
      run: guard(async () => R.renderLongPart(id, k)),
    })
    return json({ phase: 'parts', total: st.total, done: st.total - st.missing.length, missing: st.missing, job }, 202)
  }
  const job = await startReelJob({
    jobId: reelJobId(['sjoin', id, key]),
    kind: 'render',
    newsId: `story_${id}`,
    by: uid,
    run: async () => {
      try {
        const out = await R.finishLongRender(id)
        await writeSocialAudit({ actorId: uid, action: 'story.render', entityType: 'storyProject', entityId: id, meta: { seconds: out.seconds, stored: out.stored, voice: out.voiceEngine, scenes: p.scenes.length, parts: st.total, format: p.format, targetMin: p.targetMin } })
        return { result: { ...out, project: await getStory(id) } }
      } catch (err) {
        await R.failRender(id, err)
        throw err
      }
    },
  })
  return json({ phase: 'finish', total: st.total, job }, 202)
}
