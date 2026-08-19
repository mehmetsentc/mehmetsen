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
    editorialDecision: varchar('editorial_decision', { length: 24 }).default('NONE').notNull(),
    editorialDecisionReason: text('editorial_decision_reason'),
    editorialDecisionNote: text('editorial_decision_note'),
    editorialDecidedAt: timestamp('editorial_decided_at', { withTimezone: true }),
    editorialDecidedBy: varchar('editorial_decided_by', { length: 128 }),
    editorialPriority: varchar('editorial_priority', { length: 16 }).default('NORMAL').notNull(),
    approvalSource: varchar('approval_source', { length: 16 }),
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
    index('news_clusters_editorial_decision_idx').on(t.editorialDecision),
    index('news_clusters_editorial_priority_idx').on(t.editorialPriority),
    index('news_clusters_first_seen_idx').on(t.firstSeenAt),
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
    editorialStatus: varchar('editorial_status', { length: 24 }).default('NEW').notNull(),
    editorialNewsId: varchar('editorial_news_id', { length: 64 }),
    rejectionReason: varchar('rejection_reason', { length: 40 }),
    rejectionNote: text('rejection_note'),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: varchar('rejected_by', { length: 128 }),
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
    qualityScore: real('quality_score'),
    contentHash: varchar('content_hash', { length: 64 }),
    perceptualHash: varchar('perceptual_hash', { length: 32 }),
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

/** Phase 4A — AI dispatch jobs. Event-based, not per raw_article. */
export const crawlerAiJobs = pgTable(
  'crawler_ai_jobs',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    clusterId: varchar('cluster_id', { length: 64 })
      .notNull()
      .references(() => newsClusters.id, { onDelete: 'cascade' }),
    eventKey: varchar('event_key', { length: 80 }),
    status: varchar('status', { length: 24 }).default('PENDING').notNull(),
    dispatchType: varchar('dispatch_type', { length: 24 }).default('INITIAL').notNull(),
    priority: integer('priority').default(0).notNull(),
    eligibilityStatus: varchar('eligibility_status', { length: 24 }),
    estimatedInputTokens: integer('estimated_input_tokens'),
    estimatedOutputTokens: integer('estimated_output_tokens'),
    estimatedTotalTokens: integer('estimated_total_tokens'),
    estimatedCostUsd: real('estimated_cost_usd'),
    actualInputTokens: integer('actual_input_tokens'),
    actualOutputTokens: integer('actual_output_tokens'),
    actualCostUsd: real('actual_cost_usd'),
    model: varchar('model', { length: 80 }),
    provider: varchar('provider', { length: 40 }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(2).notNull(),
    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    blockedReason: varchar('blocked_reason', { length: 64 }),
    failureReason: text('failure_reason'),
    editorialNewsId: varchar('editorial_news_id', { length: 64 }),
    outputTarget: varchar('output_target', { length: 32 }).default('EDITORIAL_DRAFT').notNull(),
    selectedSourceCount: integer('selected_source_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('crawler_ai_jobs_status_idx').on(t.status),
    index('crawler_ai_jobs_cluster_idx').on(t.clusterId),
    index('crawler_ai_jobs_created_idx').on(t.createdAt),
    index('crawler_ai_jobs_priority_idx').on(t.priority),
    uniqueIndex('crawler_ai_jobs_cluster_initial_uidx').on(t.clusterId).where(sql`${t.dispatchType} = 'INITIAL'`),
  ]
)

export const crawlerAiCostLedger = pgTable(
  'crawler_ai_cost_ledger',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    provider: varchar('provider', { length: 40 }).notNull(),
    model: varchar('model', { length: 80 }),
    lane: varchar('lane', { length: 32 }).notNull(),
    jobId: varchar('job_id', { length: 64 }),
    clusterId: varchar('cluster_id', { length: 64 }),
    requestType: varchar('request_type', { length: 40 }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    estimatedCostUsd: real('estimated_cost_usd'),
    actualCostUsd: real('actual_cost_usd'),
    status: varchar('status', { length: 24 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('crawler_ai_cost_ledger_lane_ts_idx').on(t.lane, t.timestamp),
    index('crawler_ai_cost_ledger_job_idx').on(t.jobId),
    index('crawler_ai_cost_ledger_cluster_idx').on(t.clusterId),
  ]
)

export const crawlerAiBudgetWindows = pgTable(
  'crawler_ai_budget_windows',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    lane: varchar('lane', { length: 32 }).notNull(),
    periodType: varchar('period_type', { length: 16 }).notNull(),
    periodKey: varchar('period_key', { length: 32 }).notNull(),
    reservedUsd: real('reserved_usd').default(0).notNull(),
    spentUsd: real('spent_usd').default(0).notNull(),
    requestCount: integer('request_count').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('crawler_ai_budget_windows_uidx').on(t.lane, t.periodType, t.periodKey),
    index('crawler_ai_budget_windows_period_idx').on(t.periodType, t.periodKey),
  ]
)

export const crawlerAiCircuit = pgTable(
  'crawler_ai_circuit',
  {
    provider: varchar('provider', { length: 40 }).primaryKey(),
    state: varchar('state', { length: 16 }).default('CLOSED').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    reason: varchar('reason', { length: 80 }),
    consecutive429: integer('consecutive_429').default(0).notNull(),
    consecutive5xx: integer('consecutive_5xx').default(0).notNull(),
    lastStatus: integer('last_status'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  }
)

export const crawlerAiDispatchShadow = pgTable(
  'crawler_ai_dispatch_shadow',
  {
    clusterId: varchar('cluster_id', { length: 64 }).primaryKey(),
    eventKey: varchar('event_key', { length: 80 }),
    canonicalTitle: text('canonical_title'),
    eligibility: varchar('eligibility', { length: 24 }),
    wouldDispatch: smallint('would_dispatch').default(0).notNull(),
    blockedReason: varchar('blocked_reason', { length: 64 }),
    dispatchType: varchar('dispatch_type', { length: 24 }).default('INITIAL').notNull(),
    estimatedInputTokens: integer('estimated_input_tokens'),
    estimatedOutputTokens: integer('estimated_output_tokens'),
    estimatedTotalTokens: integer('estimated_total_tokens'),
    estimatedCostUsd: real('estimated_cost_usd'),
    estimatedPipelineTokens: integer('estimated_pipeline_tokens'),
    estimatedPipelineCostUsd: real('estimated_pipeline_cost_usd'),
    selectedSourceCount: integer('selected_source_count').default(0).notNull(),
    selectedSourceNames: jsonb('selected_source_names').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    importanceScore: integer('importance_score').default(0).notNull(),
    localImportance: integer('local_importance').default(0).notNull(),
    nationalImportance: integer('national_importance').default(0).notNull(),
    globalImportance: integer('global_importance').default(0).notNull(),
    geographicScope: varchar('geographic_scope', { length: 16 }),
    isLocalProtected: smallint('is_local_protected').default(0).notNull(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('crawler_ai_dispatch_shadow_would_idx').on(t.wouldDispatch),
    index('crawler_ai_dispatch_shadow_eval_idx').on(t.evaluatedAt),
    index('crawler_ai_dispatch_shadow_reason_idx').on(t.blockedReason),
  ]
)

/** Phase 4A.1 — human editorial bulk/triage audit (additive). */
export const crawlerEditorialAudit = pgTable(
  'crawler_editorial_audit',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    actorId: varchar('actor_id', { length: 128 }).notNull(),
    actorEmail: varchar('actor_email', { length: 255 }),
    actorRole: varchar('actor_role', { length: 32 }).notNull(),
    action: varchar('action', { length: 40 }).notNull(),
    entityType: varchar('entity_type', { length: 24 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }),
    affectedCount: integer('affected_count').default(0).notNull(),
    skippedCount: integer('skipped_count').default(0).notNull(),
    failedCount: integer('failed_count').default(0).notNull(),
    reason: varchar('reason', { length: 80 }),
    note: text('note'),
    previousState: varchar('previous_state', { length: 40 }),
    newState: varchar('new_state', { length: 40 }),
    editorialPriority: varchar('editorial_priority', { length: 16 }),
    selectionMode: varchar('selection_mode', { length: 24 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('crawler_editorial_audit_created_idx').on(t.createdAt),
    index('crawler_editorial_audit_actor_idx').on(t.actorId),
    index('crawler_editorial_audit_entity_idx').on(t.entityType, t.entityId),
  ]
)
