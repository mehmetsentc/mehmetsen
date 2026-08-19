import { sql } from 'drizzle-orm'
import {
  pgTable,
  varchar,
  text,
  integer,
  smallint,
  real,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  date,
  jsonb,
} from 'drizzle-orm/pg-core'

export const crawlerSourceTypeEnum = pgEnum('crawler_source_type', [
  'NATIONAL',
  'LOCAL',
  'INTERNATIONAL',
  'AGENCY',
  'MAGAZINE',
  'SPORT',
  'FINANCE',
  'TECHNOLOGY',
  'OTHER',
])

export const crawlerSourceStatusEnum = pgEnum('crawler_source_status', [
  'ACTIVE',
  'PAUSED',
  'DEGRADED',
  'DISABLED',
])

export const crawlerDiscoveryMethodEnum = pgEnum('crawler_discovery_method', [
  'RSS',
  'ATOM',
  'NEWS_SITEMAP',
  'SITEMAP',
  'LISTING',
  'HYBRID',
])

export const crawlerArticleFetchModeEnum = pgEnum('crawler_article_fetch_mode', [
  'HTTP',
  'BROWSER',
  'AUTO',
])

export const crawlerRobotsPolicyEnum = pgEnum('crawler_robots_policy', [
  'FOLLOW',
  'STRICT',
  'IGNORE',
])

export const crawlerUrlStatusEnum = pgEnum('crawler_url_status', [
  'PENDING_FETCH',
  'FETCHING',
  'FETCHED',
  'EXTRACTED',
  'DUPLICATE',
  'CLUSTER_PENDING',
  'AI_ELIGIBLE',
  'AI_SKIPPED',
  'FAILED',
  'FAILED_404',
  'FAILED_SSRF',
  'LOW_CONFIDENCE',
])

export const crawlerAiEligibilityEnum = pgEnum('crawler_ai_eligibility', [
  'PENDING',
  'ELIGIBLE',
  'SKIPPED',
])

export const crawlerClusterStatusEnum = pgEnum('crawler_cluster_status', [
  'PENDING',
  'CLUSTERED',
  'SKIPPED',
])

export const newsSources = pgTable(
  'news_sources',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    domain: varchar('domain', { length: 255 }).notNull(),
    baseUrl: text('base_url').notNull(),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    countryName: varchar('country_name', { length: 100 }),
    region: varchar('region', { length: 100 }),
    city: varchar('city', { length: 100 }),
    district: varchar('district', { length: 100 }),
    language: varchar('language', { length: 16 }).notNull(),
    timezone: varchar('timezone', { length: 64 }),
    sourceType: crawlerSourceTypeEnum('source_type').default('OTHER').notNull(),
    status: crawlerSourceStatusEnum('status').default('PAUSED').notNull(),
    priority: integer('priority').default(50).notNull(),
    trustTier: smallint('trust_tier').default(3).notNull(),
    discoveryMethod: crawlerDiscoveryMethodEnum('discovery_method')
      .default('RSS')
      .notNull(),
    rssUrls: jsonb('rss_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    sitemapUrls: jsonb('sitemap_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    listingUrls: jsonb('listing_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    crawlIntervalSeconds: integer('crawl_interval_seconds').default(300).notNull(),
    articleFetchMode: crawlerArticleFetchModeEnum('article_fetch_mode')
      .default('AUTO')
      .notNull(),
    requiresJavascript: smallint('requires_javascript').default(0).notNull(),
    robotsPolicy: crawlerRobotsPolicyEnum('robots_policy')
      .default('FOLLOW')
      .notNull(),
    lastDiscoveryAt: timestamp('last_discovery_at', { withTimezone: true }),
    nextDiscoveryAt: timestamp('next_discovery_at', { withTimezone: true }),
    lastSuccessfulDiscoveryAt: timestamp('last_successful_discovery_at', {
      withTimezone: true,
    }),
    lastFeedEtag: varchar('last_feed_etag', { length: 255 }),
    lastFeedModified: varchar('last_feed_modified', { length: 255 }),
    consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
    averageResponseMs: integer('average_response_ms'),
    articlesDiscovered: integer('articles_discovered').default(0).notNull(),
    articlesFetched: integer('articles_fetched').default(0).notNull(),
    extractionSuccessRate: real('extraction_success_rate'),
    geographicScope: varchar('geographic_scope', { length: 16 }).default('NATIONAL').notNull(),
    sourceCategory: varchar('source_category', { length: 32 }).default('GENERAL').notNull(),
    crawlPriority: varchar('crawl_priority', { length: 16 }).default('NORMAL').notNull(),
    qualityTier: varchar('quality_tier', { length: 16 }).default('UNTESTED').notNull(),
    healthScore: integer('health_score').default(50).notNull(),
    freshnessHours: integer('freshness_hours').default(48).notNull(),
    lastPauseReason: text('last_pause_reason'),
    registryKey: varchar('registry_key', { length: 80 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('news_sources_status_next_idx').on(t.status, t.nextDiscoveryAt),
    index('news_sources_domain_idx').on(t.domain),
    index('news_sources_country_idx').on(t.countryCode),
    uniqueIndex('news_sources_registry_key_uidx').on(t.registryKey),
  ]
)

export const discoveredArticleUrls = pgTable(
  'discovered_article_urls',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    sourceId: varchar('source_id', { length: 64 })
      .notNull()
      .references(() => newsSources.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    canonicalUrl: text('canonical_url'),
    urlHash: varchar('url_hash', { length: 64 }).notNull(),
    discoveredAt: timestamp('discovered_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAtHint: timestamp('published_at_hint', { withTimezone: true }),
    status: crawlerUrlStatusEnum('status').default('PENDING_FETCH').notNull(),
    fetchAttempts: integer('fetch_attempts').default(0).notNull(),
    lastFetchAttempt: timestamp('last_fetch_attempt', { withTimezone: true }),
    failureReason: text('failure_reason'),
    etag: varchar('etag', { length: 255 }),
    lastModified: varchar('last_modified', { length: 255 }),
    logicalQueue: varchar('logical_queue', { length: 32 })
      .default('ARTICLE_FETCH_QUEUE')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('discovered_article_urls_hash_uidx').on(t.urlHash),
    index('discovered_article_urls_status_idx').on(t.status),
    index('discovered_article_urls_source_idx').on(t.sourceId),
    index('discovered_article_urls_queue_idx').on(t.logicalQueue, t.status),
  ]
)

export const newsClusters = pgTable(
  'news_clusters',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    representativeArticleId: varchar('representative_article_id', { length: 64 }),
    normalizedTopic: varchar('normalized_topic', { length: 300 }),
    countryCode: varchar('country_code', { length: 2 }),
    city: varchar('city', { length: 100 }),
    category: varchar('category', { length: 80 }),
    articleCount: integer('article_count').default(1).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    eventKey: varchar('event_key', { length: 80 }),
    canonicalTitle: text('canonical_title'),
    language: varchar('language', { length: 16 }),
    region: varchar('region', { length: 100 }),
    district: varchar('district', { length: 100 }),
    categoryHint: varchar('category_hint', { length: 80 }),
    eventStatus: varchar('event_status', { length: 16 }).default('OPEN').notNull(),
    latestArticleAt: timestamp('latest_article_at', { withTimezone: true }),
    sourceCount: integer('source_count').default(1).notNull(),
    uniqueSourceCount: integer('unique_source_count').default(1).notNull(),
    highQualitySourceCount: integer('high_quality_source_count').default(0).notNull(),
    sourceDiversityScore: real('source_diversity_score').default(0).notNull(),
    importanceScore: integer('importance_score').default(0).notNull(),
    globalImportance: integer('global_importance').default(0).notNull(),
    nationalImportance: integer('national_importance').default(0).notNull(),
    localImportance: integer('local_importance').default(0).notNull(),
    freshnessScore: real('freshness_score').default(0).notNull(),
    clusterConfidence: real('cluster_confidence').default(0).notNull(),
    aiEligibility: varchar('ai_eligibility', { length: 24 }).default('WATCHING').notNull(),
    aiEligibilityReason: text('ai_eligibility_reason'),
    importanceBreakdown: jsonb('importance_breakdown').$type<Record<string, number>>(),
    signatureTokens: jsonb('signature_tokens').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    hasMaterialUpdate: smallint('has_material_update').default(0).notNull(),
    materialUpdateReason: text('material_update_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('news_clusters_country_idx').on(t.countryCode),
    index('news_clusters_last_seen_idx').on(t.lastSeenAt),
    index('news_clusters_event_key_idx').on(t.eventKey),
    index('news_clusters_eligibility_idx').on(t.aiEligibility),
    index('news_clusters_language_idx').on(t.language),
  ]
)

export const rawArticles = pgTable(
  'raw_articles',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    sourceId: varchar('source_id', { length: 64 })
      .notNull()
      .references(() => newsSources.id, { onDelete: 'cascade' }),
    discoveredUrlId: varchar('discovered_url_id', { length: 64 }).references(
      () => discoveredArticleUrls.id,
      { onDelete: 'set null' }
    ),
    clusterId: varchar('cluster_id', { length: 64 }).references(() => newsClusters.id, {
      onDelete: 'set null',
    }),
    originalUrl: text('original_url').notNull(),
    normalizedUrl: text('normalized_url'),
    canonicalUrl: text('canonical_url'),
    urlHash: varchar('url_hash', { length: 64 }),
    title: text('title'),
    description: text('description'),
    articleBodyText: text('article_body_text'),
    articleBodyHtml: text('article_body_html'),
    author: varchar('author', { length: 300 }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    modifiedAt: timestamp('modified_at', { withTimezone: true }),
    language: varchar('language', { length: 16 }),
    countryCode: varchar('country_code', { length: 2 }),
    region: varchar('region', { length: 100 }),
    city: varchar('city', { length: 100 }),
    district: varchar('district', { length: 100 }),
    mainImageUrl: text('main_image_url'),
    imageUrls: jsonb('image_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    videoUrls: jsonb('video_urls')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    mediaStatus: varchar('media_status', { length: 16 }).default('PENDING').notNull(),
    mediaExtractedAt: timestamp('media_extracted_at', { withTimezone: true }),
    primaryImageMethod: varchar('primary_image_method', { length: 40 }),
    imageCandidateCount: integer('image_candidate_count'),
    imageRejectedCount: integer('image_rejected_count'),
    wordCount: integer('word_count'),
    charCount: integer('char_count'),
    paragraphCount: integer('paragraph_count'),
    contentHash: varchar('content_hash', { length: 64 }),
    titleHash: varchar('title_hash', { length: 64 }),
    simhash: varchar('simhash', { length: 16 }),
    extractionMethod: varchar('extraction_method', { length: 40 }),
    extractionConfidence: real('extraction_confidence'),
    httpStatus: integer('http_status'),
    fetchDurationMs: integer('fetch_duration_ms'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    aiEligibility: crawlerAiEligibilityEnum('ai_eligibility').default('PENDING').notNull(),
    aiSkipReason: varchar('ai_skip_reason', { length: 80 }),
    clusterStatus: crawlerClusterStatusEnum('cluster_status').default('PENDING').notNull(),
    isExactDuplicate: smallint('is_exact_duplicate').default(0).notNull(),
    duplicateOfId: varchar('duplicate_of_id', { length: 64 }),
    qualityStatus: varchar('quality_status', { length: 24 }).default('EXTRACTED').notNull(),
    boilerplateRatio: real('boilerplate_ratio'),
    linkDensity: real('link_density'),
    editorialStatus: varchar('editorial_status', { length: 16 }).default('NEW').notNull(),
    editorialNewsId: varchar('editorial_news_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('raw_articles_source_idx').on(t.sourceId),
    index('raw_articles_content_hash_idx').on(t.contentHash),
    index('raw_articles_title_hash_idx').on(t.titleHash),
    index('raw_articles_canonical_idx').on(t.canonicalUrl),
    index('raw_articles_ai_idx').on(t.aiEligibility),
    index('raw_articles_cluster_status_idx').on(t.clusterStatus),
    index('raw_articles_cluster_idx').on(t.clusterId),
    index('raw_articles_media_status_idx').on(t.mediaStatus),
    index('raw_articles_fetched_at_idx').on(t.fetchedAt),
    index('raw_articles_source_fetched_idx').on(t.sourceId, t.fetchedAt),
    index('raw_articles_editorial_idx').on(t.editorialStatus),
  ]
)

export const crawlerArticleMedia = pgTable(
  'crawler_article_media',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    articleId: varchar('article_id', { length: 64 })
      .notNull()
      .references(() => rawArticles.id, { onDelete: 'cascade' }),
    mediaType: varchar('media_type', { length: 16 }).default('image').notNull(),
    sourceUrl: text('source_url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    width: integer('width'),
    height: integer('height'),
    altText: text('alt_text'),
    caption: text('caption'),
    credit: text('credit'),
    mimeType: varchar('mime_type', { length: 80 }),
    discoveryMethod: varchar('discovery_method', { length: 40 }).notNull(),
    score: real('score').default(0).notNull(),
    isPrimary: smallint('is_primary').default(0).notNull(),
    status: varchar('status', { length: 16 }).default('ACCEPTED').notNull(),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('crawler_article_media_article_url_uidx').on(t.articleId, t.normalizedUrl),
    index('crawler_article_media_article_idx').on(t.articleId),
    index('crawler_article_media_primary_idx').on(t.articleId, t.isPrimary),
  ]
)

export const clusterMemberships = pgTable(
  'cluster_memberships',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    clusterId: varchar('cluster_id', { length: 64 })
      .notNull()
      .references(() => newsClusters.id, { onDelete: 'cascade' }),
    articleId: varchar('article_id', { length: 64 })
      .notNull()
      .references(() => rawArticles.id, { onDelete: 'cascade' }),
    sourceId: varchar('source_id', { length: 64 })
      .notNull()
      .references(() => newsSources.id, { onDelete: 'cascade' }),
    similarityScore: real('similarity_score').default(1).notNull(),
    matchBand: varchar('match_band', { length: 16 }).default('LOW').notNull(),
    matchExplanation: jsonb('match_explanation').$type<Record<string, number>>(),
    isCanonical: smallint('is_canonical').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('cluster_memberships_article_uidx').on(t.articleId),
    index('cluster_memberships_cluster_idx').on(t.clusterId),
  ]
)

export const aiProcessingCache = pgTable(
  'ai_processing_cache',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    promptVersion: varchar('prompt_version', { length: 80 }).notNull(),
    model: varchar('model', { length: 80 }).notNull(),
    resultId: varchar('result_id', { length: 64 }),
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('ai_processing_cache_key_uidx').on(
      t.contentHash,
      t.promptVersion,
      t.model
    ),
  ]
)

export const crawlerMetricsDaily = pgTable(
  'crawler_metrics_daily',
  {
    day: date('day').notNull(),
    metric: varchar('metric', { length: 64 }).notNull(),
    value: integer('value').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('crawler_metrics_daily_pk').on(t.day, t.metric)]
)
