/**
 * LİSTE STÜDYOSU — paylaşım:
 *   GET  /api/admin/list-studio/{id}/share?format=reel|video_story → bağlı (eklenmiş) hesaplar + neden seçilemez
 *   POST /api/admin/list-studio/{id}/share { accountId, format }   → üretilmiş liste videosu TEK hesaba, ortak paylaşım
 *        kaydı (ledger) üzerinden arka planda (anahtar list_<liste>_<render>); aynı video aynı hesaba iki kez gitmez.
 *   GET  ?job=…                                                    → iş durumu (yalnız başlatan)
 * Yalnız sosyal hesap yöneticileri. Kullanıcı «Paylaş»a basmadan hiçbir şey gönderilmez.
 * NaHaber haber bağlantısı / NaHaber etiketi eklenmez (bağımsız sayfa içeriği).
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { actorFromCms } from '@/lib/social/accounts/actor'
import { supportsReel, supportsVideoStory } from '@/lib/social/accounts/capabilities'
import { listManualTargetAccounts } from '@/lib/social/accounts/manualTargets'
import { publishToTarget } from '@/lib/social/accounts/targetedPublish'
import type { FacebookPublishTarget, InstagramPublishTarget, ThreadsPublishTarget, YouTubePublishTarget } from '@/lib/social/accounts/targetTypes'
import { publishFacebookReel, publishFacebookVideoStory, publishInstagramReel, publishInstagramVideoStory, publishThreadsVideo } from '@/lib/social/reelAdapters'
import { publishYouTubeShort } from '@/lib/social/youtubeShorts'
import { isReelJobId, readReelJob, reelJobId, startReelJob } from '@/lib/reels/reelJobs'
import { LIST_TYPE_INFO, SHARE_PLATFORMS, modeOf, captionFor, listRenderKey, listShareProblem, listTags, youtubeIsLong, type ListProject, type ShareFormat, type SharePlatform } from '@/lib/listStudio/listModel'
import { getList, listAudit } from '@/lib/listStudio/listStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

type Ctx = { params: Promise<{ id: string }> }
const fmtOf = (v: unknown): ShareFormat => (v === 'video_story' ? 'video_story' : 'reel')
const PLATFORMS = new Set<string>(SHARE_PLATFORMS)

async function accountsFor(ctx: Parameters<typeof actorFromCms>[1] & { uid: string }, l: ListProject, format: ShareFormat) {
  const list = await listManualTargetAccounts(actorFromCms(ctx.uid, ctx))
  const key = listRenderKey(l)
  return list
    .filter((a) => PLATFORMS.has(a.platform) && a.status === 'active' && a.connectionMethod !== 'legacy' && (format === 'reel' ? supportsReel(a) : supportsVideoStory(a)))
    .map((a) => {
      const platform = a.platform as SharePlatform
      const problem = listShareProblem(l, platform, format, key)
      return { accountId: a.id, platform, displayName: a.displayName, username: a.username ?? null, selectable: !problem, reason: problem }
    })
}

export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const url = new URL(request.url)
  const job = url.searchParams.get('job')
  if (job !== null) {
    if (!isReelJobId(job)) return json({ error: 'job geçersiz' }, 400)
    const j = await readReelJob(job)
    if (!j || j.by !== auth.ctx.uid) return json({ error: 'İş bulunamadı' }, 404)
    return json({ job: { jobId: j.jobId, status: j.status, result: j.result, error: j.error, httpStatus: j.httpStatus } })
  }
  const l = await getList((await params).id)
  if (!l) return json({ error: 'Liste bulunamadı', code: 'not_found' }, 404)
  return json({ accounts: await accountsFor(auth.ctx, l, fmtOf(url.searchParams.get('format'))) })
}

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const format = fmtOf(body.format)
  const l = await getList((await params).id)
  if (!l) return json({ error: 'Liste bulunamadı', code: 'not_found' }, 404)
  const acc = (await accountsFor(auth.ctx, l, format)).find((a) => a.accountId === body.accountId)
  if (!acc) return json({ error: 'Bu hesap bu biçim için kullanılamaz', code: 'account_unavailable' }, 409)
  if (!acc.selectable) return json({ error: acc.reason, code: 'not_allowed' }, 409)

  const renderKey = l.render.key ?? ''
  const key = `list_${l.id}_${renderKey.slice(0, 12)}`.slice(0, 128)
  const caption = captionFor(l)
  const input = { newsId: key, videoUrl: l.render.outputUrl!, caption, coverUrl: l.render.coverUrl }
  const long = youtubeIsLong(l)
  const urun = modeOf(l.listType) === 'urun'
  const ytTitle = `${l.introTitle || LIST_TYPE_INFO[l.listType].title}${urun ? '' : ` | Top ${l.items.length}`}${l.introSubtitle ? ` · ${l.introSubtitle}` : ''}`.slice(0, 95)
  const cat = LIST_TYPE_INFO[l.listType].category
  const ytCategory = cat === 'teknoloji' ? '28' : cat === 'sinema' ? '24' : '10'
  const uid = auth.ctx.uid
  const job = await startReelJob({
    jobId: reelJobId(['lshare', l.id, renderKey, acc.accountId, format]),
    kind: 'share',
    newsId: key,
    by: uid,
    run: async () => {
      const res = await publishToTarget({
        newsId: key,
        platform: acc.platform,
        format,
        mode: format,
        accountId: acc.accountId,
        force: false,
        actorUid: uid,
        trigger: 'studio_list',
        publish: (t) => {
          if (acc.platform === 'youtube') return publishYouTubeShort({ newsId: key, videoUrl: input.videoUrl, title: ytTitle, description: long ? caption : `${caption}\n\n#Shorts`, tags: listTags(l), long, categoryId: ytCategory }, t as YouTubePublishTarget)
          if (acc.platform === 'threads') return publishThreadsVideo(input, t as ThreadsPublishTarget)
          if (format === 'video_story') return acc.platform === 'instagram' ? publishInstagramVideoStory(input, t as InstagramPublishTarget) : publishFacebookVideoStory(input, t as FacebookPublishTarget)
          return acc.platform === 'instagram' ? publishInstagramReel(input, t as InstagramPublishTarget) : publishFacebookReel(input, t as FacebookPublishTarget)
        },
      })
      await listAudit(uid, 'lists.share', l, { platform: acc.platform, accountId: acc.accountId, format, success: res.success, ledger: res.ledgerStatus, code: res.code })
      return { result: { result: res, platform: acc.platform, accountId: acc.accountId, format }, httpStatus: res.success ? 200 : 502 }
    },
  })
  return json({ job }, 202)
}
