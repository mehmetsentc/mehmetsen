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
  BLOCKS:          'blocks',
  NOTIFICATIONS:   'notifications',
  CONVERSATIONS:   'conversations',
  MESSAGES:        'messages',

  // ── AI Newsroom ────────────────────────────────────────────────────────────
  /** Multi-agent pipeline processing queue */
  AI_QUEUE:       'aiQueue',
  /** AI agent operation logs */
  AI_LOGS:        'aiLogs',
  /** Scheduled / deferred news items */
  SCHEDULED_NEWS: 'scheduledNews',
  /** Fact-check records */
  FACT_CHECKS:    'factChecks',
  /** Duplicate detection records */
  DUPLICATES:     'duplicates',
  /** Social media post tracking */
  SOCIAL_POSTS:   'socialPosts',
  /** Multi-language article translations */
  TRANSLATIONS:   'translations',
  /** RSS feed source registry */
  RSS_FEEDS:      'rssFeeds',
  /** Ingestion source metadata */
  SOURCES:        'sources',

  // ── Analytics ─────────────────────────────────────────────────────────────
  /** Daily aggregated page-view counters — doc id: YYYY-MM-DD */
  ANALYTICS_DAILY: 'analyticsDaily',
  /** Per-route Core Web Vitals aggregates */
  ANALYTICS_VITALS: 'analyticsVitals',
} as const

/** Primary collection for the TikTok-style video feed */
export const VIDEO_FEED_COLLECTION = Collections.NEWS
