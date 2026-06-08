/** Firestore collection names — shared by client and Admin SDK (no Firebase imports). */
export const Collections = {
  USERS:      'users',
  POSTS:      'posts',
  NEWS:       'news',
  NEWS_DRAFTS: 'newsDrafts',
  NEWS_ARCHIVE: 'newsArchive',
  SOURCE_FINGERPRINTS: 'sourceFingerprints',
  NEWS_QUEUE: 'newsQueue',
  VIDEOS:     'videos',
  COMMENTS:   'comments',
  LIKES:      'likes',
  SAVES:      'saved',
  FOLLOWS:    'follows',
  CATEGORIES: 'categories',
  EVENTS:     'events',
  EVENT_REVIEWS: 'eventReviews',
  REPORTS:         'reports',
  NOTIFICATIONS:   'notifications',
  CONVERSATIONS:   'conversations',
  MESSAGES:        'messages',
} as const

/** Primary collection for the TikTok-style video feed */
export const VIDEO_FEED_COLLECTION = Collections.NEWS
