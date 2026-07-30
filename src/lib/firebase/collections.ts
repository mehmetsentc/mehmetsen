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

  // ── AI Editorial Newsroom V2 (personas) ───────────────────────────────────
  /** Persistent AI editor identities (private config) */
  AI_EDITORS: 'aiEditors',
  /** Versioned constitution / task prompts — doc id: `${editorId}__${promptType}__v${n}` */
  AI_EDITOR_PROMPTS: 'aiEditorPrompts',
  /** Provider/model catalog (no API secrets) */
  AI_MODEL_REGISTRY: 'aiModelRegistry',
  /** Per-call usage skeleton for cost dashboards */
  AI_USAGE_EVENTS: 'aiUsageEvents',

  // ── Analytics ─────────────────────────────────────────────────────────────
  /** Daily aggregated page-view counters — doc id: YYYY-MM-DD */
  ANALYTICS_DAILY: 'analyticsDaily',
  /** Per-route Core Web Vitals aggregates */
  ANALYTICS_VITALS: 'analyticsVitals',
  /** Privacy-safe individual page-view events (recommended TTL: 90 days). */
  ANALYTICS_EVENTS: 'analyticsEvents',
  /** Pseudonymous browsing sessions. */
  ANALYTICS_SESSIONS: 'analyticsSessions',
  /** One document per visitor/day, used for exact unique visitor counts. */
  ANALYTICS_UNIQUES: 'analyticsUniques',

  /** Site reklam bannerları — slotId ile eşleşir */
  AD_BANNERS: 'adBanners',

  /** İletişim formu gönderileri */
  CONTACT_SUBMISSIONS: 'contactSubmissions',

  /** E-posta bülteni aboneleri — doc id: normalize edilmiş e-posta */
  NEWSLETTER_SUBSCRIBERS: 'newsletterSubscribers',

  /** Oyun skorları / sıralama — doc id: `${gameSlug}__${userId}` */
  GAME_SCORES: 'gameScores',

  // ── NaHaber Skor (minimal Maçkolik) ───────────────────────────────────────
  SPORTS_LEAGUES: 'sportsLeagues',
  SPORTS_MATCHES: 'sportsMatches',
  SPORTS_STANDINGS: 'sportsStandings',
  SPORTS_SEASONS: 'sportsSeasons',
  SPORTS_SYNC_STATE: 'sportsSyncState',

  // ── Integrations ──────────────────────────────────────────────────────────
  /** OAuth integration tokens — doc id: 'gmail_bilgi' etc. */
  INTEGRATIONS: 'integrations',
} as const

/** Primary collection for the TikTok-style video feed */
export const VIDEO_FEED_COLLECTION = Collections.NEWS
