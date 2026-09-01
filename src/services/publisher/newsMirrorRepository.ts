import 'server-only'

import { eq } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'

export interface NewsMirrorPayload {
  id: string
  slug: string
  title: string
  summary: string | null
  description: string | null
  content: string | null
  htmlContent: string | null
  categoryId: string | null
  cityName: string | null
  citySlug: string | null
  districtName: string | null
  districtSlug: string | null
  /**
   * Authoritative canonical author.
   * - string: mirror this UID
   * - null: intentionally clear / write null
   * - undefined: on conflict update, do NOT touch existing author_id
   */
  authorId?: string | null
  authorDisplayName?: string
  source: string | null
  sourceUrl: string | null
  thumbnailUrl: string | null
  coverImageUrl: string | null
  videoUrl: string | null
  tags: string[] | null
  isBreaking: boolean
  seoTitle: string | null
  seoDescription: string | null
  publishedAt: Date
  createdAt?: Date
}

/** Insert values for Postgres `news` mirror (authorId defaults to null when omitted). */
export function buildNewsMirrorInsertValues(
  payload: NewsMirrorPayload,
  now: Date = new Date()
): Record<string, unknown> {
  return {
    id: payload.id,
    legacyFirestoreId: payload.id,
    slug: payload.slug,
    title: payload.title,
    summary: payload.summary?.slice(0, 500) || null,
    description: payload.description?.slice(0, 5000) || null,
    content: payload.content || null,
    htmlContent: payload.htmlContent,
    status: 'published',
    categoryId: payload.categoryId,
    cityName: payload.cityName,
    citySlug: payload.citySlug,
    districtName: payload.districtName,
    districtSlug: payload.districtSlug,
    authorId: payload.authorId === undefined ? null : payload.authorId,
    authorDisplayName: payload.authorDisplayName ?? null,
    source: payload.source,
    sourceUrl: payload.sourceUrl,
    thumbnailUrl: payload.thumbnailUrl,
    coverImageUrl: payload.coverImageUrl,
    videoUrl: payload.videoUrl,
    tags: payload.tags,
    isAiGenerated: false,
    isBreaking: payload.isBreaking,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    publishedAt: payload.publishedAt,
    createdAt: payload.createdAt || now,
    updatedAt: now,
  }
}

/**
 * Conflict-update fields for mirror upsert.
 * Omitting authorId (undefined) preserves the existing DB author_id.
 */
export function buildNewsMirrorConflictSet(
  payload: NewsMirrorPayload,
  now: Date = new Date()
): Record<string, unknown> {
  const set: Record<string, unknown> = {
    slug: payload.slug,
    title: payload.title,
    summary: payload.summary?.slice(0, 500) || null,
    description: payload.description?.slice(0, 5000) || null,
    content: payload.content || null,
    htmlContent: payload.htmlContent,
    status: 'published',
    categoryId: payload.categoryId,
    cityName: payload.cityName,
    citySlug: payload.citySlug,
    districtName: payload.districtName,
    districtSlug: payload.districtSlug,
    source: payload.source,
    sourceUrl: payload.sourceUrl,
    thumbnailUrl: payload.thumbnailUrl,
    coverImageUrl: payload.coverImageUrl,
    videoUrl: payload.videoUrl,
    tags: payload.tags,
    isBreaking: payload.isBreaking,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    publishedAt: payload.publishedAt,
    legacyFirestoreId: payload.id,
    updatedAt: now,
  }

  if (payload.authorId !== undefined) {
    set.authorId = payload.authorId
  }
  if (payload.authorDisplayName !== undefined) {
    set.authorDisplayName = payload.authorDisplayName
  }

  return set
}

/**
 * Central Postgres `news` writer for publisher publish bridge.
 * Idempotent upsert by primary key; sets legacy_firestore_id = id.
 */
export class NewsMirrorRepository {
  async ensurePublishedNewsMirror(payload: NewsMirrorPayload): Promise<{ id: string; created: boolean }> {
    if (!hasDatabaseUrl()) {
      throw new Error('DATABASE_UNAVAILABLE')
    }
    const pg = getDb()
    const existing = await pg.select({ id: news.id }).from(news).where(eq(news.id, payload.id)).limit(1)
    const created = existing.length === 0
    const now = new Date()

    await pg
      .insert(news)
      .values(buildNewsMirrorInsertValues(payload, now) as typeof news.$inferInsert)
      .onConflictDoUpdate({
        target: news.id,
        set: buildNewsMirrorConflictSet(payload, now) as Partial<typeof news.$inferInsert>,
      })

    return { id: payload.id, created }
  }
}

export const newsMirrorRepository = new NewsMirrorRepository()
