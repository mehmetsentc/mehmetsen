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
  authorId: string
  authorDisplayName: string
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
      .values({
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
        authorId: payload.authorId,
        authorDisplayName: payload.authorDisplayName,
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
        createdAt: payload.publishedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: news.id,
        set: {
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
          authorDisplayName: payload.authorDisplayName,
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
        },
      })

    return { id: payload.id, created }
  }
}

export const newsMirrorRepository = new NewsMirrorRepository()
