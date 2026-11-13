/**
 * TIKTOK-1 — TikTok post dialog API (manual, editor-approved posts only).
 *
 * GET  ?newsId=                          → TikTok accounts the user may post this story to (+ hasVideo)
 * GET  ?newsId=&accountId=&info=1        → LIVE creator info + default caption (fetched on every dialog open)
 * GET  ?accountId=&publishId=            → TikTok processing status of a post
 * GET  ?job=                             → poll a «Video oluştur» build job (only its starter)
 * POST { newsId, prepare: true }         → «Video oluştur»: build (or reuse) the story reel in the background
 * POST { newsId, accountId, settings, force? } → ONE post through the shared ledger
 *
 * Settings are the editor's explicit choices (privacy without default, interaction
 * toggles, commercial disclosure, consent) and are re-validated server-side against
 * fresh creator info. No token, upload URL or TikTok message is ever returned.
 */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import { isReelJobId, readReelJob } from '@/lib/reels/reelJobs'
import {
  parseTikTokSettings,
  publishTikTokForNews,
  tiktokAccountsFor,
  tiktokCreatorInfoFor,
  tiktokDefaultTitle,
  tiktokPostStatusFor,
  tiktokPrepareVideo,
} from '@/lib/social/tiktokService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// download + upload + a short (~20 s) status poll; the dialog polls the rest
// (Cloudflare closes plain requests at 100 s).
// «Video oluştur» renders in the background (after()) like the reels route.
export const maxDuration = 800

const NEWS_RE = /^[A-Za-z0-9_-]{4,128}$/

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  const url = new URL(request.url)
  const newsId = url.searchParams.get('newsId') ?? ''
  const accountId = url.searchParams.get('accountId') ?? ''
  const publishId = url.searchParams.get('publishId')
  const job = url.searchParams.get('job')

  if (job !== null) {
    if (!isReelJobId(job)) return json({ error: 'job geçersiz' }, 400)
    const j = await readReelJob(job)
    if (!j || j.by !== auth.actor.uid) return json({ error: 'İş bulunamadı' }, 404)
    return json({ job: { jobId: j.jobId, status: j.status, result: j.result, error: j.error, httpStatus: j.httpStatus } })
  }

  if (publishId !== null) {
    const r = await tiktokPostStatusFor(auth.actor, accountId, publishId)
    return r.ok ? json(r) : json({ error: r.error, code: r.code }, r.status)
  }
  if (!NEWS_RE.test(newsId)) return json({ error: 'newsId gerekli' }, 400)
  if (url.searchParams.get('info') === '1') {
    const [info, title] = await Promise.all([tiktokCreatorInfoFor(auth.actor, accountId), tiktokDefaultTitle(newsId, accountId)])
    return info.ok ? json({ info: info.info, defaultTitle: title }) : json({ error: info.error, code: info.code }, info.status)
  }
  const r = await tiktokAccountsFor(auth.actor, newsId)
  return r.ok ? json({ accounts: r.accounts, hasVideo: r.hasVideo, video: r.video }) : json({ error: r.code, code: r.code }, r.status)
}

export async function POST(request: Request) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const newsId = typeof body.newsId === 'string' ? body.newsId.trim() : ''
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
  if (!NEWS_RE.test(newsId)) return json({ error: 'newsId gerekli' }, 400)
  if (body.prepare === true) {
    const p = await tiktokPrepareVideo(auth.actor, newsId)
    return p.ok ? json({ job: p.job }, 202) : json({ error: p.error, code: p.code }, p.status)
  }
  const settings = parseTikTokSettings(body.settings)
  if (!settings) return json({ error: 'TikTok paylaşım ayarları eksik', code: 'invalid_settings' }, 400)
  const result = await publishTikTokForNews(auth.actor, { newsId, accountId, settings, force: body.force === true })
  return json({ result, ...(result.success ? {} : { error: result.error }) }, result.success ? 200 : result.ledgerStatus === 'not_claimed' ? 409 : 502)
}
