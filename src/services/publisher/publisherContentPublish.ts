import 'server-only'

import { getAdminFirestore, Collections } from '@/lib/firebase/admin'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'
import { resolveStablePublishSlug, contentBodyPlainText } from '@/lib/publisher/contentDomain'
import type { PublisherContentItem } from '@/types/publisherContent'
import type { PublisherRecord } from '@/types/publisher'

export interface PublishCanonicalResult {
  newsId: string
  slug: string
  alreadyPublished: boolean
}

/**
 * Write publisher content to the live news surface (Firestore) and mirror into Postgres `news`
 * when DATABASE_URL is available. Does NOT create raw_articles.
 */
export async function publishContentToCanonicalNews(input: {
  item: PublisherContentItem
  publisher: PublisherRecord
  actorUserId: string
  actorDisplayName?: string | null
  /** Prefer existing publishedNewsId for idempotency. */
  preferredNewsId?: string | null
}): Promise<PublishCanonicalResult> {
  const { item, publisher, actorUserId } = input
  if (item.publishedNewsId) {
    return {
      newsId: item.publishedNewsId,
      slug: item.seoSlug || item.publishedNewsId,
      alreadyPublished: true,
    }
  }

  const db = getAdminFirestore()
  const newsRef = input.preferredNewsId
    ? db.collection(Collections.NEWS).doc(input.preferredNewsId)
    : db.collection(Collections.NEWS).doc()
  const newsId = newsRef.id
  const slug = resolveStablePublishSlug(item, newsId)
  const now = Date.now()
  const bodyText =
    contentBodyPlainText(item) ||
    articleBlocksToPlainText(item.bodyBlocks) ||
    item.summary ||
    item.spot ||
    ''

  const payload = {
    title: item.title.trim(),
    slug,
    description: bodyText,
    content: bodyText,
    summary: item.summary?.trim() || item.spot?.trim() || '',
    spot: item.spot?.trim() || '',
    bodyBlocks: item.bodyBlocks ?? [],
    htmlContent: item.bodyHtml ?? '',
    author: input.actorDisplayName?.trim() || publisher.displayName,
    authorId: actorUserId,
    authorDisplayName: input.actorDisplayName?.trim() || publisher.displayName,
    thumbnail: item.heroImageUrl ?? '',
    coverImageUrl: item.heroImageUrl ?? '',
    imageUrl: item.heroImageUrl ?? '',
    videoUrl: item.videoUrl ?? '',
    category: item.categoryId ?? '',
    categoryId: item.categoryId ?? '',
    city: item.cityName ?? '',
    citySlug: item.citySlug ?? '',
    district: item.districtName ?? '',
    districtSlug: item.districtSlug ?? '',
    tags: item.tags ?? [],
    type: 'news',
    postType: 'news',
    status: 'published',
    visibility: 'public',
    isBreaking: Boolean(item.isBreaking),
    seoTitle: item.seoTitle ?? '',
    seoDescription: item.seoDescription ?? '',
    source: publisher.displayName,
    sourceLabel: publisher.displayName,
    sourceUrl: item.sourceUrl ?? '',
    publisherId: publisher.id,
    publisherSlug: publisher.slug,
    publisherName: publisher.displayName,
    clusterId: item.crawlerClusterId ?? null,
    ingestionSourceId: item.originalSourceId ?? null,
    contentStudioId: item.id,
    isAiGenerated: false,
    authorIsAI: false,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    viewsCount: 0,
    likesCount: 0,
    commentCount: 0,
    savesCount: 0,
    sharesCount: 0,
  }

  await newsRef.set(payload, { merge: true })

  if (hasDatabaseUrl()) {
    try {
      const pg = getDb()
      await pg
        .insert(news)
        .values({
          id: newsId,
          legacyFirestoreId: newsId,
          slug,
          title: item.title.trim(),
          summary: (item.summary ?? item.spot ?? '').slice(0, 500) || null,
          description: bodyText.slice(0, 5000) || null,
          content: bodyText || null,
          htmlContent: item.bodyHtml,
          status: 'published',
          categoryId: item.categoryId,
          cityName: item.cityName,
          citySlug: item.citySlug,
          districtName: item.districtName,
          districtSlug: item.districtSlug,
          authorId: actorUserId,
          authorDisplayName: input.actorDisplayName?.trim() || publisher.displayName,
          source: publisher.displayName,
          sourceUrl: item.sourceUrl,
          thumbnailUrl: item.heroImageUrl,
          coverImageUrl: item.heroImageUrl,
          videoUrl: item.videoUrl,
          tags: item.tags,
          isAiGenerated: false,
          isBreaking: Boolean(item.isBreaking),
          seoTitle: item.seoTitle,
          seoDescription: item.seoDescription,
          publishedAt: new Date(now),
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        .onConflictDoUpdate({
          target: news.id,
          set: {
            slug,
            title: item.title.trim(),
            status: 'published',
            publishedAt: new Date(now),
            updatedAt: new Date(now),
            legacyFirestoreId: newsId,
          },
        })
    } catch (err) {
      console.warn(
        '[publisherContent] postgres news mirror failed',
        err instanceof Error ? err.message : err
      )
    }
  }

  return { newsId, slug, alreadyPublished: false }
}
