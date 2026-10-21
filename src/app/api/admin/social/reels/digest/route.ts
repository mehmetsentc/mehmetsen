/**
 * GET  /api/admin/social/reels/digest → recent «Günün Öne Çıkanları» videos.
 * POST /api/admin/social/reels/digest { newsIds[2–7], title?, intro?, transition?, outro?, music?, personaMode?, personaId? }
 *      → builds the multi-story reel (one sentence per story by the AI editor).
 */
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { buildDigest, DIGEST_TITLES, listDigests } from '@/lib/reels/digestService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// REELS-11: a reel from the story's own video (download + decode + encode) needs more than
// 300 s on one vCPU; Vercel Pro + Fluid allows 800 s. Photo reels still finish in ~1–2 min.
export const maxDuration = 800

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  return json({ digests: await listDigests(10).catch(() => []), titles: DIGEST_TITLES })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const b = await readJsonBody(request)
  const s = (v: unknown) => (typeof v === 'string' ? v : null)
  try {
    const digest = await buildDigest({
      newsIds: Array.isArray(b.newsIds) ? b.newsIds.filter((x): x is string => typeof x === 'string') : [],
      title: s(b.title),
      intro: s(b.intro),
      transition: s(b.transition),
      outro: s(b.outro),
      music: s(b.music),
      personaMode: b.personaMode === 'perStyle' ? 'perStyle' : 'single',
      personaId: s(b.personaId),
      actorUid: auth.ctx.uid,
    })
    return json({ digest })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reels] digest failed', message)
    const quota = err instanceof Error && err.name === 'TtsQuotaError'
    return json({ error: message, ...(quota ? { code: 'tts_free_tier_reached' } : {}) }, quota ? 429 : message.includes('haber') ? 400 : 500)
  }
}
