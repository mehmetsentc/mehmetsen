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
  markedDone: boolean
}

/** Summary returned by the cron endpoint. */
export interface SocialCronResult {
  processed: number
  succeeded: number
  failed: number
  items: SocialCronItemResult[]
}

/** Payload POSTed to /api/social/facebook or /api/social/instagram */
export interface SocialPublishPayload {
  newsId: string
  title: string
  description?: string
  imageUrl?: string
  articleUrl?: string
}
