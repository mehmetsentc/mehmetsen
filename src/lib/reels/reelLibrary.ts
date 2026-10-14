import 'server-only'

/**
 * REELS-5 — saved reel videos.
 *  • reelVideos/{newsId}: one record per story (url, cover, seconds, persona, …),
 *    overwritten on re-render (history count kept in `renders`).
 *  • reelVideos/_index: a single small doc { items: { [newsId]: { u, c, s, t } } }
 *    (newest 300) so the smart feed can attach reel videos with one cached read.
 *  • news/{id}: reelVideoUrl / reelCoverUrl / reelUpdatedAt (videoUrl is never
 *    touched — it drives VideoObject SEO and social eligibility).
 */
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const REEL_VIDEOS = 'reelVideos'
const INDEX_DOC = '_index'
const INDEX_MAX = 300

export type ReelRecordInput = {
  newsId: string
  slug: string | null
  headline: string
  url: string
  coverUrl: string | null
  seconds: number | null
  persona: string | null
  style: string | null
  media: string | null
  by: string | null
}

export type ReelRecord = ReelRecordInput & { createdAt: string | null; updatedAt: string | null; renders: number }

type IndexEntry = { u: string; c?: string | null; s?: string | null; t: number }

export async function recordReel(r: ReelRecordInput): Promise<void> {
  const db = getAdminFirestore()
  const ref = db.collection(REEL_VIDEOS).doc(r.newsId)
  const idxRef = db.collection(REEL_VIDEOS).doc(INDEX_DOC)
  await db.runTransaction(async (tx) => {
    const [cur, idx] = await Promise.all([tx.get(ref), tx.get(idxRef)])
    const items = ((idx.exists ? idx.get('items') : null) ?? {}) as Record<string, IndexEntry>
    items[r.newsId] = { u: r.url, c: r.coverUrl, s: r.slug, t: Date.now() }
    const keep = Object.entries(items).sort((x, y) => y[1].t - x[1].t).slice(0, INDEX_MAX)
    tx.set(ref, {
      ...r,
      updatedAt: FieldValue.serverTimestamp(),
      ...(cur.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      renders: FieldValue.increment(1),
    }, { merge: true })
    tx.set(idxRef, { items: Object.fromEntries(keep), updatedAt: FieldValue.serverTimestamp() })
  })
  await db.collection(Collections.NEWS).doc(r.newsId).set(
    { reelVideoUrl: r.url, reelCoverUrl: r.coverUrl, reelUpdatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}

function iso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null
}

export async function listReels(limit = 60): Promise<ReelRecord[]> {
  const snap = await getAdminFirestore().collection(REEL_VIDEOS).orderBy('updatedAt', 'desc').limit(Math.min(200, limit + 1)).get()
  return snap.docs
    .filter((d) => d.id !== INDEX_DOC)
    .slice(0, limit)
    .map((d) => {
      const x = d.data() as Record<string, unknown>
      return {
        newsId: d.id,
        slug: (x.slug as string) ?? null,
        headline: (x.headline as string) ?? '',
        url: (x.url as string) ?? '',
        coverUrl: (x.coverUrl as string) ?? null,
        seconds: typeof x.seconds === 'number' ? x.seconds : null,
        persona: (x.persona as string) ?? null,
        style: (x.style as string) ?? null,
        media: (x.media as string) ?? null,
        by: (x.by as string) ?? null,
        createdAt: iso(x.createdAt),
        updatedAt: iso(x.updatedAt),
        renders: typeof x.renders === 'number' ? x.renders : 1,
      }
    })
}

// ---- smart feed: id / slug → reel video, one Firestore read per 5 minutes per instance
const TTL_MS = 5 * 60 * 1000
let cache: { at: number; map: Map<string, string> } | null = null
let inflight: Promise<Map<string, string>> | null = null

export async function loadReelVideoIndex(): Promise<Map<string, string>> {
  if ((process.env.FEED_REEL_VIDEOS ?? 'on').toLowerCase() === 'off') return new Map()
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const snap = await getAdminFirestore().collection(REEL_VIDEOS).doc(INDEX_DOC).get()
      const items = ((snap.exists ? snap.get('items') : null) ?? {}) as Record<string, IndexEntry>
      const map = new Map<string, string>()
      for (const [id, e] of Object.entries(items)) {
        if (!e?.u) continue
        map.set(id, e.u)
        if (e.s) map.set(`slug:${e.s}`, e.u)
      }
      cache = { at: Date.now(), map }
      return map
    } catch {
      cache = { at: Date.now(), map: cache?.map ?? new Map() }
      return cache.map
    } finally {
      inflight = null
    }
  })()
  return inflight
}

/** Fill `video` from the reel index for feed rows that have none (pure given the map). */
export function attachReelVideoRows<T extends { articleId: string; slug?: string | null; video: string | null }>(rows: T[], map: Map<string, string>): T[] {
  if (!map.size) return rows
  return rows.map((r) => {
    if (r.video) return r
    const u = map.get(r.articleId) ?? (r.slug ? map.get(`slug:${r.slug}`) : undefined)
    return u ? { ...r, video: u } : r
  })
}
