import {
  pgTable,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { users } from './users'
import { publishers } from './publishers'
/** P18.3K: article social rows no longer FK to news — LEGACY_ALLOWED FS-only ids are valid. */

export const userProfiles = pgTable(
  'user_profiles',
  {
    firebaseUid: varchar('firebase_uid', { length: 128 })
      .primaryKey()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    username: varchar('username', { length: 30 }),
    displayName: varchar('display_name', { length: 100 }),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    bio: varchar('bio', { length: 500 }),
    city: varchar('city', { length: 100 }),
    country: varchar('country', { length: 2 }),
    profileVisibility: varchar('profile_visibility', { length: 16 }).default('PUBLIC').notNull(),
    actorType: varchar('actor_type', { length: 16 }).default('HUMAN').notNull(),
    likedVisibility: varchar('liked_visibility', { length: 16 }).default('PRIVATE').notNull(),
    savedVisibility: varchar('saved_visibility', { length: 16 }).default('PRIVATE').notNull(),
    interests: jsonb('interests').$type<string[]>().default([]).notNull(),
    usernameChangedAt: timestamp('username_changed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('user_profiles_username_uidx').on(t.username), index('user_profiles_city_idx').on(t.city)]
)

export const userPublisherFollows = pgTable(
  'user_publisher_follows',
  {
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    publisherId: varchar('publisher_id', { length: 64 })
      .notNull()
      .references(() => publishers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.publisherId], name: 'user_publisher_follows_pk' }),
    index('user_publisher_follows_publisher_idx').on(t.publisherId, t.createdAt),
    index('user_publisher_follows_user_idx').on(t.userId, t.createdAt),
  ]
)

export const articleLikes = pgTable(
  'article_likes',
  {
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    /** Durable social article id: news.id or LEGACY_ALLOWED Firestore doc id. */
    articleId: varchar('article_id', { length: 64 }).notNull(),
    /** Feed-v2 reaction; LIKE preserves prior heart semantics. */
    reaction: varchar('reaction', { length: 24 }).default('LIKE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.articleId], name: 'article_likes_pk' }),
    index('article_likes_article_idx').on(t.articleId, t.createdAt),
    index('article_likes_user_idx').on(t.userId, t.createdAt),
  ]
)

export const savedArticles = pgTable(
  'saved_articles',
  {
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    /** Durable social article id: news.id or LEGACY_ALLOWED Firestore doc id. */
    articleId: varchar('article_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.articleId], name: 'saved_articles_pk' }),
    index('saved_articles_user_idx').on(t.userId, t.createdAt),
  ]
)

export const articleComments = pgTable(
  'article_comments',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    /** Durable social article id: news.id or LEGACY_ALLOWED Firestore doc id. */
    articleId: varchar('article_id', { length: 64 }).notNull(),
    userId: varchar('user_id', { length: 128 })
      .notNull()
      .references(() => users.firebaseUid, { onDelete: 'cascade' }),
    parentId: varchar('parent_id', { length: 64 }),
    content: text('content').notNull(),
    status: varchar('status', { length: 24 }).default('VISIBLE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('article_comments_article_idx').on(t.articleId, t.createdAt),
    index('article_comments_user_idx').on(t.userId, t.createdAt),
    index('article_comments_parent_idx').on(t.parentId),
  ]
)

export const socialEvents = pgTable(
  'social_events',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    eventType: varchar('event_type', { length: 48 }).notNull(),
    userId: varchar('user_id', { length: 128 }),
    targetType: varchar('target_type', { length: 24 }),
    targetId: varchar('target_id', { length: 128 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('social_events_type_idx').on(t.eventType, t.createdAt),
    index('social_events_user_idx').on(t.userId, t.createdAt),
  ]
)
