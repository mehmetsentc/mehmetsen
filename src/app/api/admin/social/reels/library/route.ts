/**
 * GET /api/admin/social/reels/library?limit= → saved reel videos (newest first):
 * news id, headline, video + cover URL, length, presenter, style, renders (REELS-5),
 * plus (LIBRARY-2) the news item's category and location, and the platform
 * engagement read back from the social posts (all formats, and video posts only).
 *
 * Cost: one batched read of the news docs and one of the engagement docs for the
 * listed videos, only when the tab is opened / refreshed. No scanning.
 * Auth: central social-account manager (same as the studio).
 */
import { json, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { listReels } from '@/lib/reels/reelLibrary'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { categoryLabel } from '@/lib/social/automation/match'
import { provinceOf } from '@/lib/social/automation/types'
import { ENGAGEMENT } from '@/lib/social/engagement/collections'
import { sumMetrics, VIDEO_FORMATS, type EngagementDoc, type EngagementMetrics } from '@/lib/social/engagement/model'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export interface LibraryEngagement {
  totals: EngagementMetrics
  video: EngagementMetrics
  platforms: Array<{ platform: string; accountName: string | null; format: string; permalink: string | null; metrics: EngagementMetrics; state: string; missing: string[] }>
  updatedAt: number | null
}

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const limit = Math.min(120, Math.max(1, Number(new URL(request.url).searchParams.get('limit')) || 60))
  try {
    const items = await listReels(limit)
    const db = getAdminFirestore()
    const ids = items.map((i) => i.newsId)
    const [news, eng] = ids.length
      ? await Promise.all([
          db.getAll(...ids.map((id) => db.collection(Collections.NEWS).doc(id))),
          db.getAll(...ids.map((id) => db.collection(ENGAGEMENT).doc(id))),
        ])
      : [[], []]
    const newsById = new Map(news.map((s) => [s.id, s.exists ? (s.data() as Record<string, unknown>) : null]))
    const engById = new Map(eng.map((s) => [s.id, s.exists ? (s.data() as EngagementDoc) : null]))
    return json({
      items: items.map((it) => {
        const n = newsById.get(it.newsId)
        const e = engById.get(it.newsId)
        const categoryId = str(n?.categoryId)
        const citySlug = provinceOf(str(n?.citySlug) ?? '') || null
        const targets = Object.values(e?.targets ?? {})
        const engagement: LibraryEngagement | null = e
          ? {
              totals: e.totals ?? {},
              video: sumMetrics(targets.filter((t) => VIDEO_FORMATS.has(t.format))),
              platforms: targets.map((t) => ({ platform: t.platform, accountName: t.accountName, format: t.format, permalink: t.permalink, metrics: t.metrics ?? {}, state: t.state, missing: t.missing ?? [] })),
              updatedAt: e.updatedAt ?? null,
            }
          : null
        return {
          ...it,
          categoryId,
          categoryName: categoryId ? categoryLabel(categoryId) : null,
          citySlug,
          cityName: str(n?.cityName) ?? (citySlug ? citySlug : null),
          districtName: str(n?.districtName),
          newsStatus: str(n?.status),
          engagement,
        }
      }),
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err), items: [] }, 500)
  }
}
