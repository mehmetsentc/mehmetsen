/**
 * POST /api/admin/social/reels/render { newsId, force?, personaId?, intro?, outro?, music?, voiceText?, cover?, layout?, dryRun? }
 * Builds (or reuses) the NaHaber news reel MP4 for one published article and
 * returns its public Storage URL. Auth: central social-account manager.
 * Kill switch: SOCIAL_REELS_ENABLED=false.
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { buildReelForNews, reelsEnabled } from '@/lib/reels/reelService'
import { reelVoiceConfig } from '@/lib/reels/voice'
import { clampRate, isValidVoiceName } from '@/lib/reels/voiceRules'
import { isReelJobId, readReelJob, reelJobId, startReelJob } from '@/lib/reels/reelJobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// REELS-11: a reel from the story's own video (download + decode + encode) needs more than
// 300 s on one vCPU; Vercel Pro + Fluid allows 800 s. Photo reels still finish in ~1–2 min.
export const maxDuration = 800

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  // REELS-12: poll a background render (?job=…)
  const job = new URL(request.url).searchParams.get('job')
  if (job !== null) {
    if (!isReelJobId(job)) return json({ error: 'job geçersiz' }, 400)
    const j = await readReelJob(job)
    if (!j) return json({ error: 'İş bulunamadı' }, 404)
    return json({ job: { jobId: j.jobId, status: j.status, result: j.result, error: j.error, httpStatus: j.httpStatus } })
  }
  const v = reelVoiceConfig()
  return json({ enabled: reelsEnabled(), voice: v.voice, rate: v.rate, ttsReady: v.ready })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const newsId = typeof body.newsId === 'string' ? body.newsId.trim() : ''
  if (!newsId || !/^[A-Za-z0-9_-]{4,64}$/.test(newsId)) return json({ error: 'newsId gerekli' }, 400)
  const s = (v: unknown) => (typeof v === 'string' ? v : null)
  const buildOpts = {
    force: body.force === true,
    dryRun: body.dryRun === true,
    voice: isValidVoiceName(body.voice) ? body.voice : null,
    rate: body.rate == null ? null : clampRate(body.rate),
    personaId: s(body.personaId),
    intro: s(body.intro),
    outro: s(body.outro),
    music: s(body.music),
    voiceText: s(body.voiceText)?.slice(0, 320) ?? null,
    cover: s(body.cover),
    layout: s(body.layout),
    by: auth.ctx.uid,
  }
  // REELS-12: long renders run in the background (Cloudflare closes requests at 100 s)
  if (body.async === true && body.dryRun !== true) {
    const job = await startReelJob({
      jobId: reelJobId(null),
      kind: 'render',
      newsId,
      by: auth.ctx.uid,
      // same body as the synchronous answer: { result }
      run: async () => ({ result: { result: await buildReelForNews(newsId, buildOpts) } }),
    })
    return json({ job }, 202)
  }
  try {
    const result = await buildReelForNews(newsId, {
      force: body.force === true,
      dryRun: body.dryRun === true,
      voice: isValidVoiceName(body.voice) ? body.voice : null,
      rate: body.rate == null ? null : clampRate(body.rate),
      personaId: s(body.personaId),
      intro: s(body.intro),
      outro: s(body.outro),
      music: s(body.music),
      voiceText: s(body.voiceText)?.slice(0, 320) ?? null,
      cover: s(body.cover),
      layout: s(body.layout),
      by: auth.ctx.uid,
    })
    return json({ result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reels] render failed', newsId, message)
    const status = err instanceof Error && err.name === 'TtsQuotaError' ? 429 : message.includes('not found') ? 404 : 500
    return json({ error: message, ...(status === 429 ? { code: 'tts_free_tier_reached' } : {}) }, status)
  }
}
