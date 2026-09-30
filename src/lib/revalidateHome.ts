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
export function revalidatePublishedNews(slug?: string | null): void {
  try {
    revalidateTag('news-post')
    const normalized = slug?.trim()
    if (normalized) revalidateTag(`news:${normalized}`)
  } catch {
    /* best-effort */
  }
}

export function revalidateHomeFeedCaches(): void {
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
