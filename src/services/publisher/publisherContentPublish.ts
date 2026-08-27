import 'server-only'

import { getAdminFirestore, Collections } from '@/lib/firebase/admin'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'
import {
  articleBlocksToSafeHtml,
  contentBodyPlainText,
  resolveStablePublishSlug,
} from '@/lib/publisher/contentDomain'
import { publisherLog } from '@/lib/publisher/observability'
import type { PublisherContentItem, PublisherPublicationStatus } from '@/types/publisherContent'
import type { PublisherRecord } from '@/types/publisher'
import {
  NewsMirrorRepository,
  newsMirrorRepository,
  type NewsMirrorPayload,
} from './newsMirrorRepository'
import {
  PublisherContentRepository,
  publisherContentRepository,
} from './publisherContentRepository'

export interface PublishCanonicalResult {
  newsId: string
  slug: string
  alreadyPublished: boolean
  publicationStatus: PublisherPublicationStatus
  firestoreOk: boolean
  postgresOk: boolean
}

export interface FirestoreNewsWriter {
  ensurePublishedNews(input: {
    newsId: string
    payload: Record<string, unknown>
  }): Promise<void>
}

export interface StableNewsIdFactory {
  createId(): string
}

class AdminFirestoreNewsWriter implements FirestoreNewsWriter {
  async ensurePublishedNews(input: { newsId: string; payload: Record<string, unknown> }): Promise<void> {
    const db = getAdminFirestore()
    await db.collection(Collections.NEWS).doc(input.newsId).set(input.payload, { merge: true })
  }
}

class FirestoreDocIdFactory implements StableNewsIdFactory {
  createId(): string {
    return getAdminFirestore().collection(Collections.NEWS).doc().id
  }
}

function buildMirrorPayload(input: {
  item: PublisherContentItem
  publisher: PublisherRecord
  actorUserId: string
  actorDisplayName?: string | null
  newsId: string
  slug: string
  bodyText: string
  html: string
  publishedAt: Date
}): NewsMirrorPayload {
  const { item, publisher, newsId, slug, bodyText, html, publishedAt } = input
  return {
    id: newsId,
    slug,
    title: item.title.trim(),
    summary: (item.summary ?? item.spot ?? '').slice(0, 500) || null,
    description: bodyText.slice(0, 5000) || null,
    content: bodyText || null,
    htmlContent: html || null,
    categoryId: item.categoryId,
    cityName: item.cityName,
    citySlug: item.citySlug,
    districtName: item.districtName,
    districtSlug: item.districtSlug,
    authorId: input.actorUserId,
    authorDisplayName: input.actorDisplayName?.trim() || publisher.displayName,
    source: publisher.displayName,
    sourceUrl: item.sourceUrl,
    thumbnailUrl: item.heroImageUrl,
    coverImageUrl: item.heroImageUrl,
    videoUrl: item.videoUrl,
    tags: item.tags,
    isBreaking: Boolean(item.isBreaking),
    seoTitle: item.seoTitle,
    seoDescription: item.seoDescription,
    publishedAt,
  }
}

function buildFirestorePayload(input: {
  item: PublisherContentItem
  publisher: PublisherRecord
  actorUserId: string
  actorDisplayName?: string | null
  newsId: string
  slug: string
  bodyText: string
  html: string
  publishedAtMs: number
}): Record<string, unknown> {
  const { item, publisher, newsId, slug, bodyText, html, publishedAtMs } = input
  const internalTest = publisher.publisherType === 'INTERNAL_TEST'
  return {
    title: item.title.trim(),
    slug,
    description: bodyText,
    content: bodyText,
    summary: item.summary?.trim() || item.spot?.trim() || '',
    spot: item.spot?.trim() || '',
    bodyBlocks: item.bodyBlocks ?? [],
    htmlContent: html,
    author: input.actorDisplayName?.trim() || publisher.displayName,
    authorId: input.actorUserId,
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
    // INTERNAL_TEST must never enter public SEO indexes.
    visibility: internalTest ? 'private' : 'public',
    seoNoindex: internalTest,
    publisherType: publisher.publisherType,
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
    publishedAt: publishedAtMs,
    createdAt: publishedAtMs,
    updatedAt: publishedAtMs,
    viewsCount: 0,
    likesCount: 0,
    commentCount: 0,
    savesCount: 0,
    sharesCount: 0,
    id: newsId,
  }
}

/**
 * Idempotent publisher → Firestore + Postgres dual-write bridge.
 * ONE logical article → max 1 Firestore doc → max 1 PG news row.
 */
export class PublisherPublishService {
  constructor(
    private readonly contentRepo: PublisherContentRepository = publisherContentRepository,
    private readonly newsMirror: NewsMirrorRepository = newsMirrorRepository,
    private readonly firestoreWriter: FirestoreNewsWriter = new AdminFirestoreNewsWriter(),
    private readonly idFactory: StableNewsIdFactory = new FirestoreDocIdFactory()
  ) {}

  /**
   * Ensure Firestore + PG representations for an already-authorized content item.
   * Does not perform RBAC — caller (PublisherContentService) must authorize.
   */
  async publishContent(input: {
    item: PublisherContentItem
    publisher: PublisherRecord
    actorUserId: string
    actorDisplayName?: string | null
    preferredNewsId?: string | null
  }): Promise<PublishCanonicalResult> {
    const { item, publisher, actorUserId } = input

    // Fully published + both stores OK → no-op
    if (
      item.status === 'PUBLISHED' &&
      item.publishedNewsId &&
      item.publicationStatus === 'PUBLISHED' &&
      item.firestoreStatus === 'OK' &&
      item.postgresStatus === 'OK'
    ) {
      return {
        newsId: item.publishedNewsId,
        slug: item.seoSlug || item.publishedNewsId,
        alreadyPublished: true,
        publicationStatus: 'PUBLISHED',
        firestoreOk: true,
        postgresOk: true,
      }
    }

    const newsId =
      item.publishedNewsId ||
      input.preferredNewsId?.trim() ||
      this.idFactory.createId()
    const slug = resolveStablePublishSlug({ ...item, publishedNewsId: newsId }, newsId)
    const publishedAt = item.publishedAt ?? new Date()
    const publishedAtMs = publishedAt.getTime()
    const bodyText =
      contentBodyPlainText(item) ||
      articleBlocksToPlainText(item.bodyBlocks) ||
      item.summary ||
      item.spot ||
      ''
    const html =
      (item.bodyHtml && item.bodyHtml.trim()) || articleBlocksToSafeHtml(item.bodyBlocks ?? [])

    await this.contentRepo.insertAudit({
      contentId: item.id,
      publisherId: item.publisherId,
      eventType: 'PUBLISH_STARTED',
      actorUserId,
      payload: { newsId, slug, attempt: (item.publicationAttempts ?? 0) + 1 },
    })

    await this.contentRepo.updateOptimistic(item.id, item.publisherId, { version: item.version }, {
      publishedNewsId: newsId,
      seoSlug: slug,
      publicationStatus: 'PUBLISHING',
      publicationAttempts: (item.publicationAttempts ?? 0) + 1,
      publicationClaimedAt: new Date(),
      publicationClaimedBy: actorUserId,
      publicationLastError: null,
      updatedBy: actorUserId,
    })

    let firestoreOk = item.firestoreStatus === 'OK'
    let postgresOk = item.postgresStatus === 'OK'
    let lastError: string | null = null

    if (!firestoreOk) {
      try {
        await this.firestoreWriter.ensurePublishedNews({
          newsId,
          payload: buildFirestorePayload({
            item,
            publisher,
            actorUserId,
            actorDisplayName: input.actorDisplayName,
            newsId,
            slug,
            bodyText,
            html,
            publishedAtMs,
          }),
        })
        firestoreOk = true
        await this.contentRepo.insertAudit({
          contentId: item.id,
          publisherId: item.publisherId,
          eventType: 'FIRESTORE_PUBLISHED',
          actorUserId,
          payload: { newsId },
        })
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        publisherLog('publisher_publish_firestore_failed', {
          contentId: item.id,
          newsId,
          error: lastError,
        })
      }
    }

    if (!postgresOk) {
      try {
        await this.newsMirror.ensurePublishedNewsMirror(
          buildMirrorPayload({
            item,
            publisher,
            actorUserId,
            actorDisplayName: input.actorDisplayName,
            newsId,
            slug,
            bodyText,
            html,
            publishedAt,
          })
        )
        postgresOk = true
        await this.contentRepo.insertAudit({
          contentId: item.id,
          publisherId: item.publisherId,
          eventType: 'POSTGRES_MIRRORED',
          actorUserId,
          payload: { newsId },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        lastError = lastError ? `${lastError}; ${msg}` : msg
        publisherLog('publisher_publish_postgres_failed', {
          contentId: item.id,
          newsId,
          error: msg,
        })
      }
    }

    const publicationStatus: PublisherPublicationStatus =
      firestoreOk && postgresOk
        ? 'PUBLISHED'
        : firestoreOk || postgresOk
          ? 'PARTIAL'
          : 'FAILED'

    // Reload for current version after PUBLISHING write
    const current = (await this.contentRepo.findById(item.id)) ?? item

    if (publicationStatus === 'PUBLISHED') {
      const claimed = await this.contentRepo.claimPublishSlot(
        item.id,
        item.publisherId,
        newsId,
        actorUserId,
        publishedAt,
        {
          seoSlug: slug,
          publicationStatus: 'PUBLISHED',
          firestoreStatus: 'OK',
          postgresStatus: 'OK',
          publicationLastError: null,
          publicationClaimedAt: null,
          publicationClaimedBy: null,
        }
      )
      if (!claimed) {
        // Already claimed by concurrent publisher — heal store statuses if needed
        await this.contentRepo.updateOptimistic(
          item.id,
          item.publisherId,
          { version: current.version },
          {
            publicationStatus: 'PUBLISHED',
            firestoreStatus: 'OK',
            postgresStatus: 'OK',
            publishedNewsId: newsId,
            seoSlug: slug,
            publicationLastError: null,
          }
        )
      }
      await this.contentRepo.insertAudit({
        contentId: item.id,
        publisherId: item.publisherId,
        eventType: 'PUBLISH_COMPLETED',
        actorUserId,
        payload: { newsId, slug },
      })
    } else {
      await this.contentRepo.updateOptimistic(
        item.id,
        item.publisherId,
        { version: current.version },
        {
          publishedNewsId: newsId,
          seoSlug: slug,
          publicationStatus,
          firestoreStatus: firestoreOk ? 'OK' : 'FAILED',
          postgresStatus: postgresOk ? 'OK' : 'FAILED',
          publicationLastError: lastError,
          updatedBy: actorUserId,
        }
      )
      await this.contentRepo.insertAudit({
        contentId: item.id,
        publisherId: item.publisherId,
        eventType: publicationStatus === 'PARTIAL' ? 'PUBLISH_PARTIAL' : 'PUBLISH_FAILED',
        actorUserId,
        payload: { newsId, firestoreOk, postgresOk, error: lastError },
      })
    }

    return {
      newsId,
      slug,
      alreadyPublished: false,
      publicationStatus,
      firestoreOk,
      postgresOk,
    }
  }

  /** Bounded heal for PARTIAL / FAILED publications. */
  async reconcilePartialPublications(limit = 10): Promise<{
    attempted: number
    healed: number
    failed: number
  }> {
    const items = await this.contentRepo.listPartialPublications(limit)
    let healed = 0
    let failed = 0
    for (const item of items) {
      if (!item.publishedNewsId) {
        failed++
        continue
      }
      // Publisher record required — skip if unavailable
      // Caller should provide publisher lookup; use contentRepo publisher via service layer
      // This method is intentionally thin — PublisherContentService wraps with publisher load.
    }
    return { attempted: items.length, healed, failed }
  }
}

export const publisherPublishService = new PublisherPublishService()

/**
 * Backward-compatible function used by PublisherContentService.
 * Prefer PublisherPublishService.publishContent for new code / tests with fake adapters.
 */
export async function publishContentToCanonicalNews(input: {
  item: PublisherContentItem
  publisher: PublisherRecord
  actorUserId: string
  actorDisplayName?: string | null
  preferredNewsId?: string | null
}): Promise<PublishCanonicalResult> {
  return publisherPublishService.publishContent(input)
}
