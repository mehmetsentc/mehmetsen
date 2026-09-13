import { sql } from 'drizzle-orm'
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

export type VideoLibraryRendition = {
  height: number
  storageKey: string
  mimeType?: string
  fileSizeBytes?: number
}

export const videoLibraryItems = pgTable(
  'video_library_items',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    platform: varchar('platform', { length: 32 }).notNull(),
    platformVideoId: varchar('platform_video_id', { length: 128 }),
    originalUrl: text('original_url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),

    sourceProfileId: varchar('source_profile_id', { length: 128 }),
    sourceUsername: varchar('source_username', { length: 200 }),
    sourceName: varchar('source_name', { length: 300 }),
    sourceUrl: text('source_url'),

    title: text('title').default('').notNull(),
    description: text('description'),

    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    aspectRatio: varchar('aspect_ratio', { length: 32 }),

    thumbnailUrl: text('thumbnail_url'),
    posterStorageKey: varchar('poster_storage_key', { length: 500 }),
    originalStorageKey: varchar('original_storage_key', { length: 500 }),
    playbackStorageKey: varchar('playback_storage_key', { length: 500 }),
    streamManifestKey: varchar('stream_manifest_key', { length: 500 }),
    renditions: jsonb('renditions').$type<VideoLibraryRendition[]>().default([]).notNull(),

    mimeType: varchar('mime_type', { length: 100 }),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
    playbackMimeType: varchar('playback_mime_type', { length: 100 }),
    playbackFileSizeBytes: bigint('playback_file_size_bytes', { mode: 'number' }),
    videoCodec: varchar('video_codec', { length: 64 }),
    audioCodec: varchar('audio_codec', { length: 64 }),
    fps: real('fps'),

    publishedAt: timestamp('published_at', { withTimezone: true }),
    importedAt: timestamp('imported_at', { withTimezone: true }),
    publishedNewsId: varchar('published_news_id', { length: 64 }),

    status: varchar('status', { length: 32 }).default('INSPECTED').notNull(),
    rightsStatus: varchar('rights_status', { length: 32 }).default('UNKNOWN').notNull(),
    contentHash: varchar('content_hash', { length: 128 }),
    tags: text('tags').array(),
    importErrorCode: varchar('import_error_code', { length: 64 }),
    importErrorMessage: varchar('import_error_message', { length: 300 }),
    lastImportJobId: varchar('last_import_job_id', { length: 64 }),
    processErrorCode: varchar('process_error_code', { length: 64 }),
    processErrorMessage: varchar('process_error_message', { length: 300 }),
    lastProcessJobId: varchar('last_process_job_id', { length: 64 }),

    createdBy: varchar('created_by', { length: 128 }),
    updatedBy: varchar('updated_by', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('vli_normalized_url_uidx').on(t.normalizedUrl),
    uniqueIndex('vli_platform_video_uidx')
      .on(t.platform, t.platformVideoId)
      .where(sql`${t.platformVideoId} is not null`),
    uniqueIndex('vli_content_hash_uidx')
      .on(t.contentHash)
      .where(sql`${t.contentHash} is not null`),
    index('vli_status_imported_idx').on(t.status, t.importedAt),
    index('vli_platform_idx').on(t.platform),
    index('vli_rights_idx').on(t.rightsStatus),
    index('vli_created_idx').on(t.createdAt),
    uniqueIndex('vli_published_news_uidx')
      .on(t.publishedNewsId)
      .where(sql`${t.publishedNewsId} is not null`),
  ]
)

export const videoLibraryCollections = pgTable(
  'video_library_collections',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 200 }).notNull(),
    description: text('description'),
    createdBy: varchar('created_by', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('vlc_slug_uidx').on(t.slug)]
)

export const videoLibraryCollectionItems = pgTable(
  'video_library_collection_items',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    collectionId: varchar('collection_id', { length: 64 })
      .notNull()
      .references(() => videoLibraryCollections.id, { onDelete: 'cascade' }),
    itemId: varchar('item_id', { length: 64 })
      .notNull()
      .references(() => videoLibraryItems.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('vlci_collection_item_uidx').on(t.collectionId, t.itemId),
    index('vlci_item_idx').on(t.itemId),
  ]
)

/** Architecture-ready import/transcode jobs. V1A does not enqueue workers. */
export const videoLibraryJobs = pgTable(
  'video_library_jobs',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    itemId: varchar('item_id', { length: 64 })
      .notNull()
      .references(() => videoLibraryItems.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 32 }).notNull(),
    status: varchar('status', { length: 32 }).default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    lastError: text('last_error'),
    errorCode: varchar('error_code', { length: 64 }),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimedBy: varchar('claimed_by', { length: 128 }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('vlj_status_created_idx').on(t.status, t.createdAt),
    index('vlj_item_kind_idx').on(t.itemId, t.kind),
    uniqueIndex('vlj_one_active_download_uidx')
      .on(t.itemId, t.kind)
      .where(sql`${t.status} in ('QUEUED','RUNNING','PENDING')`),
  ]
)
