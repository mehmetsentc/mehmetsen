/**
 * VIDEO-RANK-1 — /video order (pure).
 *
 * The /video page used to read only Firestore `hasVideo` news (old ANKA
 * YouTube clips) and re-sort them by engagement, so the reels NaHaber renders
 * itself never surfaced. It now takes every video Feed V2 can play and lets
 * the Feed V2 ranker order them; these helpers keep that order honest:
 * every video appears exactly once and nothing the ranker skips is lost.
 */

export type RankableVideoRow = {
  articleId: string
  video: string | null
  publishedAt: Date
  category: string | null
  citySlug?: string | null
}

/** Sekme filtresi: "Sana Özel" hepsi; "Yerel" il haberleri; diğerleri kategori (+ alt kategoriler). */
export function isVideoTabMatch(
  row: Pick<RankableVideoRow, 'category' | 'citySlug'>,
  category: string | null,
  categoryIds: string[] | null
): boolean {
  if (!category) return true
  const cat = (row.category ?? '').trim().toLowerCase()
  const inCategory = Boolean(cat) && (categoryIds ?? [category]).includes(cat)
  if (category === 'yerel-haber') return inCategory || Boolean(row.citySlug?.trim())
  return inCategory
}

function videoKey(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

/** Aynı haber ya da aynı video dosyası bir kez; yeni olan kalır. */
export function dedupeVideoPool<T extends RankableVideoRow>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  const ids = new Set<string>()
  const videos = new Set<string>()
  const out: T[] = []
  for (const row of sorted) {
    if (!row.video || ids.has(row.articleId)) continue
    const key = videoKey(row.video)
    if (videos.has(key)) continue
    ids.add(row.articleId)
    videos.add(key)
    out.push(row)
  }
  return out
}

/**
 * Ranked ids first (as the ranker returned them), then every pool item the
 * ranker left out, newest first. A ranker failure degrades to newest first.
 */
export async function buildVideoFeedOrder<T extends RankableVideoRow>(
  pool: T[],
  rank: (rows: T[]) => Promise<{ ranked: Array<{ articleId: string }>; rankingVersion: string }>
): Promise<{ ids: string[]; rankingVersion: string }> {
  const rows = dedupeVideoPool(pool)
  if (!rows.length) return { ids: [], rankingVersion: 'empty' }
  const inPool = new Set(rows.map((r) => r.articleId))
  let ranked: Array<{ articleId: string }> = []
  let rankingVersion = 'recency_fallback'
  try {
    const res = await rank(rows)
    ranked = res.ranked
    rankingVersion = res.rankingVersion
  } catch (err) {
    console.warn('[video-feed] ranking failed, newest first:', err)
  }
  const ids: string[] = []
  const used = new Set<string>()
  for (const r of ranked) {
    if (!inPool.has(r.articleId) || used.has(r.articleId)) continue
    used.add(r.articleId)
    ids.push(r.articleId)
  }
  for (const r of rows) {
    if (used.has(r.articleId)) continue
    used.add(r.articleId)
    ids.push(r.articleId)
  }
  return { ids, rankingVersion }
}
