import {
  pgTable,
  varchar,
  text,
  integer,
  smallint,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import { news } from './news'

export const storageProviderEnum = pgEnum('storage_provider', [
  'firebase',
  'r2',
  'external',
])

export const mediaTypeEnum = pgEnum('media_type', [
  'image',
  'video',
  'audio',
])

export const media = pgTable(
  'media',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    newsId: varchar('news_id', { length: 64 }).references(() => news.id, {
      onDelete: 'set null',
    }),
    type: mediaTypeEnum('type').notNull(),
    storageProvider: storageProviderEnum('storage_provider')
      .default('firebase')
      .notNull(),
    storageKey: varchar('storage_key', { length: 500 }),
    publicUrl: text('public_url').notNull(),
    alt: varchar('alt', { length: 300 }),
    caption: text('caption'),
    credit: varchar('credit', { length: 200 }),
    width: integer('width'),
    height: integer('height'),
    sizeBytes: integer('size_bytes'),
    sortOrder: smallint('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('media_news_idx').on(t.newsId),
    index('media_provider_idx').on(t.storageProvider),
  ]
)
