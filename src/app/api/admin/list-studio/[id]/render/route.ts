/**
 * LİSTE STÜDYOSU — video üretimi parça parça:
 *   POST { segment: 'intro' | 'i_<sıra>' | 'outro' } → o parçayı üretir (202 { job }); hazırsa { reused }
 *   POST { concat: true }                           → hazır parçaları tek MP4'te birleştirir (202 { job })
 *   POST { whole: true }                            → ETKİNLİK: tek parça video, bölümler arası geçişli (≤ 150 sn)
 *   POST { cards: true }                            → ETKİNLİK: kart şablonundan JPEG kareler
 *   GET  ?job=…                                     → iş durumu (yalnız başlatan)
 * KURGU motoru kullanılır; closing: false → NaHaber kapanışı / logosu yoktur.
 * Şimdilik Vercel'de çalışır (Railway reel worker yeni sürümle dağıtılınca `remote` eklenebilir).
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { isReelJobId, readReelJob, reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { runReelJobHandler } from '@/lib/reels/reelJobHandlers'
import { cardsKey, cardsProblem, listRenderKey, listRenderProblem, segmentIds, segmentKey, segmentsToRender, wholeEligible, wholeRenderKey, type SegmentId } from '@/lib/listStudio/listModel'
import { getList } from '@/lib/listStudio/listStore'

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
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const l = await getList(id)
  if (!l) return json({ error: 'Liste bulunamadı', code: 'not_found' }, 404)
  const uid = auth.ctx.uid
  if (body.cards === true) {
    const cp = cardsProblem(l)
    if (cp) return json({ error: cp, code: 'not_renderable' }, 409)
    const key = cardsKey(l)
    if (l.cards.status === 'ready' && l.cards.key === key && l.cards.urls.length) return json({ cards: l.cards, reused: true })
    const job = await startReelJob({ jobId: reelJobId(['lcards', id, key]), kind: 'render', newsId: `list_${id}`, by: uid, run: () => runReelJobHandler('list.cards', { id, key, uid }) })
    return json({ job }, 202)
  }
  const problem = listRenderProblem(l)
  if (problem) return json({ error: problem, code: 'not_renderable' }, 409)
  if (body.whole === true) {
    if (!wholeEligible(l)) return json({ error: 'Tek parça video en fazla 150 sn; parça parça üretin', code: 'too_long' }, 409)
    const key = wholeRenderKey(l)
    if (l.render.status === 'ready' && l.render.key === key && l.render.outputUrl) return json({ render: l.render, reused: true })
    const job = await startReelJob({ jobId: reelJobId(['lwhole', id, key]), kind: 'render', newsId: `list_${id}`, by: uid, run: () => runReelJobHandler('list.whole', { id, key, uid }) })
    return json({ job }, 202)
  }
  if (body.concat === true) {
    const key = listRenderKey(l)
    if (l.render.status === 'ready' && l.render.key === key && l.render.outputUrl) return json({ render: l.render, reused: true })
    const missing = segmentsToRender(l)
    if (missing.length) return json({ error: `${missing.length} parça henüz üretilmedi`, code: 'segments_missing', missing }, 409)
    const job = await startReelJob({ jobId: reelJobId(['list', id, key]), kind: 'render', newsId: `list_${id}`, by: uid, run: () => runReelJobHandler('list.concat', { id, key, uid }) })
    return json({ job }, 202)
  }
  const seg = body.segment as SegmentId
  if (typeof seg !== 'string' || !segmentIds(l).includes(seg)) return json({ error: 'Parça geçersiz', code: 'invalid' }, 400)
  const key = segmentKey(l, seg)
  if (l.segments[seg]?.key === key) return json({ segment: l.segments[seg], reused: true })
  const job = await startReelJob({ jobId: reelJobId(['lseg', id, seg, key]), kind: 'render', newsId: `list_${id}`, by: uid, run: () => runReelJobHandler('list.segment', { id, seg, key, uid }) })
  return json({ job }, 202)
}
