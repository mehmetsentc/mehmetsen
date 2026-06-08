/**
 * Exact Firestore queries used for the `news` collection.
 * Schema: author, commentCount, createdAt, description, likesCount,
 * savesCount, thumbnail, title, videoUrl, viewsCount
 */

export const NEWS_COLLECTION = 'news'

/** /feed — all news items, newest first */
export const NEWS_FEED_QUERY = {
  collection: NEWS_COLLECTION,
  firestore: `collection('${NEWS_COLLECTION}') → orderBy('createdAt', 'desc') → limit(10)`,
} as const

/** /reels — only documents where videoUrl is set and non-empty */
export const NEWS_REELS_QUERY = {
  collection: NEWS_COLLECTION,
  firestore: `collection('${NEWS_COLLECTION}') → where('videoUrl', '!=', '') → orderBy('videoUrl') → orderBy('createdAt', 'desc') → limit(10)`,
  fallback: `collection('${NEWS_COLLECTION}') → orderBy('createdAt', 'desc') → limit(10) → client filter: videoUrl.trim() !== ''`,
} as const
