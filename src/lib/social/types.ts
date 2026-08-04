/**
 * Shared types for the Facebook + Instagram auto-publish pipeline.
 */

/** A news document from Firestore that is eligible for social publishing. */
export interface SocialNewsItem {
  id: string
  title: string
  description?: string
  imageUrl?: string
  url?: string
  source?: string
  category?: string
  createdAt?: number
  /** Set to true after both platforms publish successfully. */
  socialPublished?: boolean
  socialPublishedAt?: number
  /** Individual platform results written on success. */
  facebookPostId?: string
  instagramMediaId?: string
}

/** Result returned by each platform publisher. */
export interface SocialPublishResult {
  success: boolean
  platformId?: string  // Facebook post ID or Instagram media ID
  error?: string
}

/** Combined result from the cron runner for one news item. */
export interface SocialCronItemResult {
  newsId: string
  title: string
  facebook: SocialPublishResult
  instagram: SocialPublishResult
  twitter?: SocialPublishResult
  markedDone: boolean
}

/** Summary returned by the cron endpoint. */
export interface SocialCronResult {
  processed: number
  succeeded: number
  failed: number
  items: SocialCronItemResult[]
  /** Story pipeline (güncel + öne çıkan) özeti */
  stories?: {
    processed: number
    succeeded: number
    failed: number
    items?: Array<{ newsId: string; title: string; ok: boolean; error?: string }>
  }
}

/** Payload POSTed to /api/social/facebook or /api/social/instagram */
export interface SocialPublishPayload {
  newsId: string
  /** Post: tam haber manşeti. Story: kısa AI headline (sadece log/görsel bağlamı). */
  title: string
  /** Post özet gövdesi (AI caption) — URL/hashtag içermez; publisher ekler. */
  description?: string
  /**
   * Tek görsel / carousel slide 1 (markalı OG).
   * Carousel yoksa tek post bu URL ile yayınlanır.
   */
  imageUrl?: string
  /**
   * 2+ görsel varsa carousel: [slide1 branded OG, ...orijinal görseller].
   * Instagram limiti 10; Facebook multi-photo aynı listeyi kullanır.
   * Yoksa veya 1 eleman → tek görsel akışı.
   */
  imageUrls?: string[]
  articleUrl?: string
  /** Post hashtag listesi; yoksa publisher varsayılan kullanır. */
  hashtags?: string[]
}
