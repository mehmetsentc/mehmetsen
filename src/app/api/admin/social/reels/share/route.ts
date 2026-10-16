/**
 * GET  /api/admin/social/reels/share?newsId=&format=reel|video_story → accounts the
 *      signed-in user may use for this news video (same rules as the Post/Hikâye pickers).
 * POST /api/admin/social/reels/share { newsId, accountId, format? , force? } → build (or
 *      reuse) the news video and publish it to ONE account through the shared ledger
 *      (publishOneSocial mode 'reel' | 'video_story', trigger 'studio'). The client calls
 *      this once per selected account, so each account has its own time budget.
 * POST { newsId, prepare: true } → only build (or reuse) the video + cover first, so the
 *      per-account requests stay well inside the 100 s edge timeout (REELS-5).
 */
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json, readJsonBody } from '@/lib/social/accounts/connect/routeHelpers'
import type { VideoFormat } from '@/lib/social/accounts/capabilities'
import { manualTargetsForNews } from '@/lib/social/accounts/manualTargets'
import { publishOneSocial } from '@/lib/social/publishOneSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const NEWS_RE = /^[A-Za-z0-9_-]{4,128}$/
/** Platforms that take the rendered news video (YouTube: Shorts only — manualTargetCheck refuses video_story). */
const VIDEO_PLATFORMS = new Set<string>(['instagram', 'facebook', 'youtube'])
const fmtOf = (v: unknown): VideoFormat => (v === 'video_story' ? 'video_story' : 'reel')

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  const url = new URL(request.url)
  const newsId = url.searchParams.get('newsId') ?? ''
  if (!NEWS_RE.test(newsId)) return json({ error: 'newsId gerekli' }, 400)
  const r = await manualTargetsForNews(auth.actor, newsId, [fmtOf(url.searchParams.get('format'))], Date.now())
  if (!r.ok) return json({ error: r.code, code: r.code }, r.status)
  return json({
    accounts: r.options
      .filter((o) => VIDEO_PLATFORMS.has(o.platform))
      .map((o) => ({ accountId: o.accountId, platform: o.platform, displayName: o.displayName, username: o.username, selectable: o.selectable, reason: o.reason })),
  })
}

export async function POST(request: Request) {
  const auth = await requireActor(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const newsId = typeof body.newsId === 'string' ? body.newsId.trim() : ''
  const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : ''
  const format = fmtOf(body.format)
  if (!NEWS_RE.test(newsId)) return json({ error: 'newsId gerekli' }, 400)
  const r = await manualTargetsForNews(auth.actor, newsId, [format], Date.now())
  if (!r.ok) return json({ error: r.code, code: r.code }, r.status)
  if (body.prepare === true) {
    if (!r.options.some((o) => o.selectable && VIDEO_PLATFORMS.has(o.platform))) return json({ error: 'Bu haber için kullanılabilir hesap yok', code: 'not_found' }, 404)
    try {
      const { buildReelForNews } = await import('@/lib/reels/reelService')
      const b = await buildReelForNews(newsId, { by: auth.actor.uid })
      return json({ prepared: true, url: b.url, coverUrl: b.coverUrl ?? null, reused: b.reused })
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err), code: 'render_failed' }, 500)
    }
  }
  const target = r.options.find((o) => o.accountId === accountId)
  if (!target || !VIDEO_PLATFORMS.has(target.platform)) return json({ error: 'Bu hesap bu haber için kullanılamaz', code: 'not_found' }, 404)
  if (!target.selectable) return json({ error: target.reason ?? 'Hesap seçilemez', code: target.code }, 409)
  const result = await publishOneSocial(newsId, {
    mode: format,
    targets: { [target.platform]: target.accountId },
    manual: true,
    actorUid: auth.actor.uid,
    force: body.force === true,
    trigger: 'studio',
  })
  return json({ result, platform: target.platform, accountId: target.accountId, format }, result.ok ? 200 : result.skipped ? 409 : 502)
}
