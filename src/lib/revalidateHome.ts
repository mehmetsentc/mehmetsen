import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * Ana sayfa / feed veri önbelleğini temizle.
 * `revalidatePath` tek başına `unstable_cache` etiketlerini düşürmez —
 * featured / pool için `revalidateTag('home-feed')` şart.
 */
export function revalidateHomeFeedCaches(): void {
  try {
    revalidateTag('home-feed')
    revalidateTag('feed-slider')
    revalidateTag('feed-timeline')
    revalidateTag('breaking-news')
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
