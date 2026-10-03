import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Ana sayfa / feed veri önbelleğini temizle.
 * `revalidatePath` tek başına `unstable_cache` etiketlerini düşürmez —
 * featured / pool için `revalidateTag('home-feed')` şart.
 */
/**
 * Drop the article data cache after publish, edit, or unpublish.
 * `news-post` covers list caches; `news:{slug}` covers that article's slug cache.
 * Callers still revalidatePath so the ISR page shell updates too.
 */
/**
 * FinOps 3 Oct: the crawler/newsroom pipeline auto-publishes in bursts, and each
 * publish dropped every list cache (news-post, home-feed, …), so Firestore re-read
 * the same lists over and over. Pipeline callers pass `throttleBroadMs`: the
 * article's own tag always drops, broad tags at most once per window. Every broad
 * cache has its own revalidate (≤10 min), so lists stay fresh without the storm.
 * Admin/manual publishes call without throttle and keep instant invalidation.
 */
const lastBroadBust: Record<string, number> = {}

function broadAllowed(kind: string, throttleMs?: number): boolean {
  if (!throttleMs) return true
  const now = Date.now()
  if (now - (lastBroadBust[kind] ?? 0) < throttleMs) return false
  lastBroadBust[kind] = now
  return true
}

export function revalidatePublishedNews(
  slug?: string | null,
  opts?: { throttleBroadMs?: number }
): void {
  try {
    if (broadAllowed('news-post', opts?.throttleBroadMs)) revalidateTag('news-post')
    const normalized = slug?.trim()
    if (normalized) revalidateTag(`news:${normalized}`)
  } catch {
    /* best-effort */
  }
}

export function revalidateHomeFeedCaches(opts?: { throttleBroadMs?: number }): void {
  if (!broadAllowed('home-feed', opts?.throttleBroadMs)) return
  try {
    revalidateTag('home-feed')
    revalidateTag('feed-slider')
    revalidateTag('feed-timeline')
    revalidateTag('breaking-news')
    // City tenant featured rails share CMS Öne Çıkan pins.
    revalidateTag('city-news')
    revalidateTag('category-presence')
    revalidateTag('category-feed')
    revalidateTag('site-settings')
  } catch {
    /* best-effort */
  }
  try {
    revalidatePath('/feed')
    revalidatePath('/')
    revalidatePath('/(main)/feed', 'page')
  } catch {
    /* best-effort */
  }
}
