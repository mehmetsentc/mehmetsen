/**
 * REKLAM STÜDYOSU — POST /api/admin/ad-studio/{id}/render → arka planda MP4 (202 { job })
 *                    GET  /api/admin/ad-studio/{id}/render?job=… → iş durumu (yalnız başlatan)
 * KURGU motoru kullanılır; closing: false → NaHaber kapanışı / logosu yoktur.
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { writeSocialAudit } from '@/lib/social/accounts/audit'
import { isReelJobId, readReelJob, reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { adRenderKey, adRenderProblem, compileAd } from '@/lib/adStudio/adModel'
import { getAd, setAdRendered } from '@/lib/adStudio/adStore'

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
  const ad = await getAd(id)
  if (!ad) return json({ error: 'Reklam bulunamadı', code: 'not_found' }, 404)
  const problem = adRenderProblem(ad)
  if (problem) return json({ error: problem, code: 'not_renderable' }, 409)
  const key = adRenderKey(ad)
  if (ad.render.status === 'ready' && ad.render.key === key && ad.render.outputUrl) return json({ render: ad.render, reused: true })
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['ad', id, key]),
    kind: 'render',
    newsId: `ad_${id}`,
    by: uid,
    run: async () => {
      const [{ renderEditProject }, { drawAdOverlay }] = await Promise.all([import('@/lib/edit/editRender'), import('@/lib/adStudio/adText')])
      const { project, overlays } = compileAd(ad)
      try {
        const out = await renderEditProject(project, key, undefined, {
          drawText: async (t, W, H, file, root) => {
            const o = overlays.get(t.id)
            if (!o) throw new Error('Reklam katmanı bulunamadı')
            await drawAdOverlay(o, W, H, file, root)
          },
        })
        const stored = await setAdRendered(id, key, out, Date.now())
        await writeSocialAudit({ actorId: uid, action: 'ads.render', entityType: 'adProject', entityId: id, meta: { seconds: out.seconds, reused: out.reused, stored, look: ad.look, kind: ad.kind, voice: ad.voiceOn ? ad.voiceId : null } })
        return { result: { ...out, stored } }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Reklam videosu üretilemedi'
        await setAdRendered(id, key, { error: message }, Date.now()).catch(() => undefined)
        throw err
      }
    },
  })
  return json({ job }, 202)
}
