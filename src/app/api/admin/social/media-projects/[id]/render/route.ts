/**
 * POST /api/admin/social/media-projects/{id}/render { clipId } → background render job (202)
 * GET  /api/admin/social/media-projects/{id}/render?job=…    → job state (only its starter)
 * An unchanged clip is never rendered twice (same render key → same file).
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { isReelJobId, readReelJob, reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { clipRenderKey, isClipId, mediaLedgerKey, sourceLabelFor } from '@/lib/media/mediaProject'
import { getProject, setClipRendered } from '@/lib/media/mediaStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const job = new URL(request.url).searchParams.get('job')
  if (!isReelJobId(job)) return json({ error: 'job geçersiz' }, 400)
  const j = await readReelJob(job)
  if (!j || j.by !== auth.ctx.uid) return json({ error: 'İş bulunamadı' }, 404)
  return json({ job: { jobId: j.jobId, status: j.status, result: j.result, error: j.error, httpStatus: j.httpStatus } })
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const { id } = await params
  const body = await readJsonBody(request)
  const p = await getProject(id)
  if (!p) return json({ error: 'Proje bulunamadı', code: 'not_found' }, 404)
  const clip = isClipId(body.clipId) ? p.clips.find((c) => c.id === body.clipId) : undefined
  if (!clip) return json({ error: 'Bölüm bulunamadı', code: 'clip_not_found' }, 404)
  const label = sourceLabelFor(p.rights)
  const renderKey = clipRenderKey(p.videoItemId, clip, label)
  if (clip.status === 'ready' && clip.renderKey === renderKey && clip.outputUrl) return json({ clip, reused: true })
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['media', id, clip.id, renderKey]),
    kind: 'render',
    newsId: mediaLedgerKey(id, clip.id),
    by: uid,
    run: async () => {
      const { renderClip } = await import('@/lib/media/mediaRender')
      try {
        const out = await renderClip({ projectId: id, clipId: clip.id, renderKey, videoItemId: p.videoItemId, startMs: clip.startMs, endMs: clip.endMs, title: clip.title, sourceLabel: label, options: clip.options })
        const stored = await setClipRendered(id, clip.id, renderKey, out, Date.now())
        await writeSocialAudit({ actorId: uid, action: 'media.clip.render', entityType: 'mediaProject', entityId: id, meta: { clipId: clip.id, seconds: out.seconds, reused: out.reused, stored } })
        return { result: { ...out, stored } }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Video üretilemedi'
        await setClipRendered(id, clip.id, renderKey, { error: message }, Date.now()).catch(() => undefined)
        throw err
      }
    },
  })
  return json({ job }, 202)
}
