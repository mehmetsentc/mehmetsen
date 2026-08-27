import 'server-only'

import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  publisherContentAudit,
  publisherContentItems,
  publisherContentRevisions,
} from '@/db/schema/publisherContent'
import { publisherSources } from '@/db/schema/publishers'
import { newsClusters, rawArticles } from '@/db/schema/crawler'
import { newPublisherId } from '@/lib/publisher/id'
import { normalizeContentBlocks, snapshotContent } from '@/lib/publisher/contentDomain'
import type {
  PublisherContentAuditEvent,
  PublisherContentAuditRow,
  PublisherContentItem,
  PublisherContentRevision,
  PublisherContentStatus,
  PublisherSourceArticleItem,
} from '@/types/publisherContent'
import {
  getPublisherPublicationMaxAttempts,
  getPublisherPublicationStaleLeaseMs,
} from '@/lib/publisher/contentStudioConfig'

function mapItem(row: typeof publisherContentItems.$inferSelect): PublisherContentItem {
  return {
    id: row.id,
    publisherId: row.publisherId,
    status: row.status as PublisherContentStatus,
    sourceMode: row.sourceMode as PublisherContentItem['sourceMode'],
    title: row.title ?? '',
    spot: row.spot,
    summary: row.summary,
    bodyBlocks: normalizeContentBlocks(row.bodyBlocks),
    bodyHtml: row.bodyHtml,
    categoryId: row.categoryId,
    citySlug: row.citySlug,
    districtSlug: row.districtSlug,
    cityName: row.cityName,
    districtName: row.districtName,
    heroImageUrl: row.heroImageUrl,
    videoUrl: row.videoUrl,
    mediaMeta: (row.mediaMeta as PublisherContentItem['mediaMeta']) ?? null,
    tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : [],
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    seoSlug: row.seoSlug,
    isBreaking: Boolean(row.isBreaking),
    rightsStatus: row.rightsStatus as PublisherContentItem['rightsStatus'],
    rightsBasis: row.rightsBasis as PublisherContentItem['rightsBasis'],
    sourceUrl: row.sourceUrl,
    originalSourceId: row.originalSourceId,
    crawlerRawArticleId: row.crawlerRawArticleId,
    crawlerClusterId: row.crawlerClusterId,
    publishedNewsId: row.publishedNewsId,
    publishedAt: row.publishedAt,
    scheduledAt: row.scheduledAt,
    scheduleTimezone: row.scheduleTimezone,
    scheduleClaimedAt: row.scheduleClaimedAt,
    scheduleClaimedBy: row.scheduleClaimedBy,
    scheduleClaimExpiresAt: row.scheduleClaimExpiresAt,
    publicationStatus: (row.publicationStatus ?? 'NONE') as PublisherContentItem['publicationStatus'],
    firestoreStatus: (row.firestoreStatus ?? 'NONE') as PublisherContentItem['firestoreStatus'],
    postgresStatus: (row.postgresStatus ?? 'NONE') as PublisherContentItem['postgresStatus'],
    publicationAttempts: row.publicationAttempts ?? 0,
    publicationLastError: row.publicationLastError ?? null,
    publicationClaimedAt: row.publicationClaimedAt ?? null,
    publicationClaimedBy: row.publicationClaimedBy ?? null,
    reviewNote: row.reviewNote,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    approvedBy: row.approvedBy,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PublisherContentRepository {
  private db() {
    if (!hasDatabaseUrl()) throw new Error('DATABASE_UNAVAILABLE')
    return getDb()
  }

  async findById(id: string): Promise<PublisherContentItem | null> {
    const rows = await this.db()
      .select()
      .from(publisherContentItems)
      .where(eq(publisherContentItems.id, id))
      .limit(1)
    return rows[0] ? mapItem(rows[0]) : null
  }

  async listByPublisher(input: {
    publisherId: string
    status?: PublisherContentStatus | PublisherContentStatus[] | null
    limit?: number
    cursorUpdatedAt?: Date | null
    q?: string | null
    authorId?: string | null
    categoryId?: string | null
    sourceMode?: string | null
  }): Promise<PublisherContentItem[]> {
    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100)
    const statuses = input.status
      ? Array.isArray(input.status)
        ? input.status
        : [input.status]
      : null

    const conds = [eq(publisherContentItems.publisherId, input.publisherId)]
    if (statuses?.length) {
      conds.push(inArray(publisherContentItems.status, statuses))
    }
    if (input.cursorUpdatedAt) {
      conds.push(lt(publisherContentItems.updatedAt, input.cursorUpdatedAt))
    }
    if (input.authorId) {
      conds.push(eq(publisherContentItems.createdBy, input.authorId))
    }
    if (input.categoryId) {
      conds.push(eq(publisherContentItems.categoryId, input.categoryId))
    }
    if (input.sourceMode) {
      conds.push(eq(publisherContentItems.sourceMode, input.sourceMode))
    }
    const q = input.q?.trim()
    if (q) {
      conds.push(sql`${publisherContentItems.title} ILIKE ${'%' + q.replace(/[%_]/g, '\\$&') + '%'}`)
    }

    const rows = await this.db()
      .select()
      .from(publisherContentItems)
      .where(and(...conds))
      .orderBy(desc(publisherContentItems.updatedAt))
      .limit(limit)
    return rows.map(mapItem)
  }

  async findByCrawlerRawArticle(
    publisherId: string,
    crawlerRawArticleId: string
  ): Promise<PublisherContentItem | null> {
    const rows = await this.db()
      .select()
      .from(publisherContentItems)
      .where(
        and(
          eq(publisherContentItems.publisherId, publisherId),
          eq(publisherContentItems.crawlerRawArticleId, crawlerRawArticleId)
        )
      )
      .orderBy(desc(publisherContentItems.createdAt))
      .limit(1)
    return rows[0] ? mapItem(rows[0]) : null
  }

  async listRevisions(contentId: string, limit = 40): Promise<PublisherContentRevision[]> {
    const rows = await this.db()
      .select()
      .from(publisherContentRevisions)
      .where(eq(publisherContentRevisions.contentId, contentId))
      .orderBy(desc(publisherContentRevisions.revisionNumber))
      .limit(Math.min(Math.max(limit, 1), 100))
    return rows.map((r) => ({
      id: r.id,
      contentId: r.contentId,
      revisionNumber: r.revisionNumber,
      status: r.status as PublisherContentStatus,
      snapshot: r.snapshot,
      changeKind: r.changeKind,
      note: r.note,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }))
  }

  async findRevision(contentId: string, revisionId: string): Promise<PublisherContentRevision | null> {
    const rows = await this.db()
      .select()
      .from(publisherContentRevisions)
      .where(
        and(
          eq(publisherContentRevisions.id, revisionId),
          eq(publisherContentRevisions.contentId, contentId)
        )
      )
      .limit(1)
    const r = rows[0]
    if (!r) return null
    return {
      id: r.id,
      contentId: r.contentId,
      revisionNumber: r.revisionNumber,
      status: r.status as PublisherContentStatus,
      snapshot: r.snapshot,
      changeKind: r.changeKind,
      note: r.note,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }
  }

  async insert(item: PublisherContentItem): Promise<PublisherContentItem> {
    await this.db().insert(publisherContentItems).values({
      id: item.id,
      publisherId: item.publisherId,
      status: item.status,
      sourceMode: item.sourceMode,
      title: item.title,
      spot: item.spot,
      summary: item.summary,
      bodyBlocks: item.bodyBlocks,
      bodyHtml: item.bodyHtml,
      categoryId: item.categoryId,
      citySlug: item.citySlug,
      districtSlug: item.districtSlug,
      cityName: item.cityName,
      districtName: item.districtName,
      heroImageUrl: item.heroImageUrl,
      videoUrl: item.videoUrl,
      mediaMeta: (item.mediaMeta ?? null) as Record<string, unknown> | null,
      tags: item.tags,
      seoTitle: item.seoTitle,
      seoDescription: item.seoDescription,
      seoSlug: item.seoSlug,
      isBreaking: item.isBreaking,
      rightsStatus: item.rightsStatus,
      rightsBasis: item.rightsBasis,
      sourceUrl: item.sourceUrl,
      originalSourceId: item.originalSourceId,
      crawlerRawArticleId: item.crawlerRawArticleId,
      crawlerClusterId: item.crawlerClusterId,
      publishedNewsId: item.publishedNewsId,
      publishedAt: item.publishedAt,
      scheduledAt: item.scheduledAt,
      scheduleTimezone: item.scheduleTimezone,
      scheduleClaimedAt: item.scheduleClaimedAt,
      scheduleClaimedBy: item.scheduleClaimedBy,
      scheduleClaimExpiresAt: item.scheduleClaimExpiresAt,
      publicationStatus: item.publicationStatus,
      firestoreStatus: item.firestoreStatus,
      postgresStatus: item.postgresStatus,
      publicationAttempts: item.publicationAttempts,
      publicationLastError: item.publicationLastError,
      publicationClaimedAt: item.publicationClaimedAt,
      publicationClaimedBy: item.publicationClaimedBy,
      reviewNote: item.reviewNote,
      createdBy: item.createdBy,
      updatedBy: item.updatedBy,
      approvedBy: item.approvedBy,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })
    return item
  }

  async updateOptimistic(
    id: string,
    publisherId: string,
    expected: { version?: number | null; updatedAt?: Date | null },
    patch: Partial<PublisherContentItem>
  ): Promise<PublisherContentItem | null> {
    const conds = [
      eq(publisherContentItems.id, id),
      eq(publisherContentItems.publisherId, publisherId),
    ]
    if (expected.version != null) {
      conds.push(eq(publisherContentItems.version, expected.version))
    }
    if (expected.updatedAt) {
      conds.push(eq(publisherContentItems.updatedAt, expected.updatedAt))
    }

    const now = new Date()
    const rows = await this.db()
      .update(publisherContentItems)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.spot !== undefined ? { spot: patch.spot } : {}),
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        ...(patch.bodyBlocks !== undefined ? { bodyBlocks: patch.bodyBlocks } : {}),
        ...(patch.bodyHtml !== undefined ? { bodyHtml: patch.bodyHtml } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.citySlug !== undefined ? { citySlug: patch.citySlug } : {}),
        ...(patch.districtSlug !== undefined ? { districtSlug: patch.districtSlug } : {}),
        ...(patch.cityName !== undefined ? { cityName: patch.cityName } : {}),
        ...(patch.districtName !== undefined ? { districtName: patch.districtName } : {}),
        ...(patch.heroImageUrl !== undefined ? { heroImageUrl: patch.heroImageUrl } : {}),
        ...(patch.videoUrl !== undefined ? { videoUrl: patch.videoUrl } : {}),
        ...(patch.mediaMeta !== undefined
          ? { mediaMeta: (patch.mediaMeta ?? null) as Record<string, unknown> | null }
          : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.seoTitle !== undefined ? { seoTitle: patch.seoTitle } : {}),
        ...(patch.seoDescription !== undefined ? { seoDescription: patch.seoDescription } : {}),
        ...(patch.seoSlug !== undefined ? { seoSlug: patch.seoSlug } : {}),
        ...(patch.isBreaking !== undefined ? { isBreaking: patch.isBreaking } : {}),
        ...(patch.rightsStatus !== undefined ? { rightsStatus: patch.rightsStatus } : {}),
        ...(patch.rightsBasis !== undefined ? { rightsBasis: patch.rightsBasis } : {}),
        ...(patch.sourceUrl !== undefined ? { sourceUrl: patch.sourceUrl } : {}),
        ...(patch.originalSourceId !== undefined ? { originalSourceId: patch.originalSourceId } : {}),
        ...(patch.crawlerRawArticleId !== undefined
          ? { crawlerRawArticleId: patch.crawlerRawArticleId }
          : {}),
        ...(patch.crawlerClusterId !== undefined ? { crawlerClusterId: patch.crawlerClusterId } : {}),
        ...(patch.publishedNewsId !== undefined ? { publishedNewsId: patch.publishedNewsId } : {}),
        ...(patch.publishedAt !== undefined ? { publishedAt: patch.publishedAt } : {}),
        ...(patch.scheduledAt !== undefined ? { scheduledAt: patch.scheduledAt } : {}),
        ...(patch.scheduleTimezone !== undefined ? { scheduleTimezone: patch.scheduleTimezone } : {}),
        ...(patch.scheduleClaimedAt !== undefined ? { scheduleClaimedAt: patch.scheduleClaimedAt } : {}),
        ...(patch.scheduleClaimedBy !== undefined ? { scheduleClaimedBy: patch.scheduleClaimedBy } : {}),
        ...(patch.scheduleClaimExpiresAt !== undefined
          ? { scheduleClaimExpiresAt: patch.scheduleClaimExpiresAt }
          : {}),
        ...(patch.publicationStatus !== undefined
          ? { publicationStatus: patch.publicationStatus }
          : {}),
        ...(patch.firestoreStatus !== undefined ? { firestoreStatus: patch.firestoreStatus } : {}),
        ...(patch.postgresStatus !== undefined ? { postgresStatus: patch.postgresStatus } : {}),
        ...(patch.publicationAttempts !== undefined
          ? { publicationAttempts: patch.publicationAttempts }
          : {}),
        ...(patch.publicationLastError !== undefined
          ? { publicationLastError: patch.publicationLastError }
          : {}),
        ...(patch.publicationClaimedAt !== undefined
          ? { publicationClaimedAt: patch.publicationClaimedAt }
          : {}),
        ...(patch.publicationClaimedBy !== undefined
          ? { publicationClaimedBy: patch.publicationClaimedBy }
          : {}),
        ...(patch.reviewNote !== undefined ? { reviewNote: patch.reviewNote } : {}),
        ...(patch.updatedBy !== undefined ? { updatedBy: patch.updatedBy } : {}),
        ...(patch.approvedBy !== undefined ? { approvedBy: patch.approvedBy } : {}),
        version: sql`${publisherContentItems.version} + 1`,
        updatedAt: now,
      })
      .where(and(...conds))
      .returning()

    return rows[0] ? mapItem(rows[0]) : null
  }

  /**
   * Atomic publish claim: only one concurrent publish succeeds when published_news_id is null
   * OR when healing a PARTIAL with the same newsId.
   */
  async claimPublishSlot(
    id: string,
    publisherId: string,
    newsId: string,
    actorUserId: string,
    publishedAt: Date,
    extra?: Partial<PublisherContentItem>
  ): Promise<PublisherContentItem | null> {
    const rows = await this.db()
      .update(publisherContentItems)
      .set({
        status: 'PUBLISHED',
        publishedNewsId: newsId,
        publishedAt,
        scheduledAt: null,
        scheduleClaimedAt: null,
        scheduleClaimedBy: null,
        scheduleClaimExpiresAt: null,
        publicationStatus: extra?.publicationStatus ?? 'PUBLISHED',
        firestoreStatus: extra?.firestoreStatus ?? 'OK',
        postgresStatus: extra?.postgresStatus ?? 'OK',
        publicationLastError: extra?.publicationLastError ?? null,
        publicationClaimedAt: extra?.publicationClaimedAt ?? null,
        publicationClaimedBy: extra?.publicationClaimedBy ?? null,
        updatedBy: actorUserId,
        ...(extra?.seoSlug !== undefined ? { seoSlug: extra.seoSlug } : {}),
        ...(extra?.isBreaking !== undefined ? { isBreaking: extra.isBreaking } : {}),
        version: sql`${publisherContentItems.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(publisherContentItems.id, id),
          eq(publisherContentItems.publisherId, publisherId),
          or(
            isNull(publisherContentItems.publishedNewsId),
            eq(publisherContentItems.publishedNewsId, newsId)
          ),
          inArray(publisherContentItems.status, [
            'APPROVED',
            'SCHEDULED',
            'IN_REVIEW',
            'DRAFT',
            'CHANGES_REQUESTED',
            'PUBLISHED',
          ])
        )
      )
      .returning()
    return rows[0] ? mapItem(rows[0]) : null
  }

  async listPartialPublications(limit = 10): Promise<PublisherContentItem[]> {
    const maxAttempts = getPublisherPublicationMaxAttempts()
    const staleMs = getPublisherPublicationStaleLeaseMs()
    const staleBefore = new Date(Date.now() - staleMs)

    const rows = await this.db()
      .select()
      .from(publisherContentItems)
      .where(
        and(
          lte(publisherContentItems.publicationAttempts, maxAttempts),
          or(
            inArray(publisherContentItems.publicationStatus, ['PARTIAL', 'FAILED']),
            and(
              eq(publisherContentItems.publicationStatus, 'PUBLISHING'),
              or(
                isNull(publisherContentItems.publicationClaimedAt),
                lte(publisherContentItems.publicationClaimedAt, staleBefore)
              )
            )
          )
        )
      )
      .orderBy(desc(publisherContentItems.updatedAt))
      .limit(Math.min(Math.max(limit, 1), 50))
    return rows.map(mapItem)
  }

  async insertRevision(input: {
    contentId: string
    revisionNumber: number
    status: PublisherContentStatus
    snapshot: Record<string, unknown>
    changeKind: string
    note?: string | null
    createdBy?: string | null
  }): Promise<PublisherContentRevision> {
    const row: PublisherContentRevision = {
      id: newPublisherId('prev'),
      contentId: input.contentId,
      revisionNumber: input.revisionNumber,
      status: input.status,
      snapshot: input.snapshot,
      changeKind: input.changeKind,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: new Date(),
    }
    await this.db().insert(publisherContentRevisions).values(row)
    return row
  }

  async nextRevisionNumber(contentId: string): Promise<number> {
    const rows = await this.db()
      .select({
        max: sql<number>`coalesce(max(${publisherContentRevisions.revisionNumber}), 0)`,
      })
      .from(publisherContentRevisions)
      .where(eq(publisherContentRevisions.contentId, contentId))
    return Number(rows[0]?.max ?? 0) + 1
  }

  async insertAudit(input: {
    contentId: string
    publisherId: string
    eventType: PublisherContentAuditEvent | string
    actorUserId?: string | null
    payload?: Record<string, unknown> | null
  }): Promise<PublisherContentAuditRow> {
    const row: PublisherContentAuditRow = {
      id: newPublisherId('paud'),
      contentId: input.contentId,
      publisherId: input.publisherId,
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      payload: input.payload ?? null,
      createdAt: new Date(),
    }
    await this.db().insert(publisherContentAudit).values(row)
    return row
  }

  async listAudit(contentId: string, limit = 50): Promise<PublisherContentAuditRow[]> {
    const rows = await this.db()
      .select()
      .from(publisherContentAudit)
      .where(eq(publisherContentAudit.contentId, contentId))
      .orderBy(desc(publisherContentAudit.createdAt))
      .limit(limit)
    return rows.map((r) => ({
      id: r.id,
      contentId: r.contentId,
      publisherId: r.publisherId,
      eventType: r.eventType,
      actorUserId: r.actorUserId,
      payload: r.payload,
      createdAt: r.createdAt,
    }))
  }

  async listSourceArticles(input: {
    publisherId: string
    limit?: number
  }): Promise<PublisherSourceArticleItem[]> {
    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100)
    const rows = await this.db()
      .select({
        rawArticleId: rawArticles.id,
        sourceId: rawArticles.sourceId,
        title: rawArticles.title,
        url: rawArticles.originalUrl,
        summary: rawArticles.description,
        publishedAt: rawArticles.publishedAt,
        clusterId: rawArticles.clusterId,
        clusterSlug: newsClusters.seoSlug,
        relationshipType: publisherSources.relationshipType,
      })
      .from(publisherSources)
      .innerJoin(rawArticles, eq(rawArticles.sourceId, publisherSources.sourceId))
      .leftJoin(newsClusters, eq(newsClusters.id, rawArticles.clusterId))
      .where(eq(publisherSources.publisherId, input.publisherId))
      .orderBy(desc(rawArticles.publishedAt), desc(rawArticles.createdAt))
      .limit(limit)

    return rows.map((r) => ({
      rawArticleId: r.rawArticleId,
      sourceId: r.sourceId,
      title: (r.title ?? '').trim() || 'Başlıksız',
      url: r.url,
      summary: r.summary,
      publishedAt: r.publishedAt,
      clusterId: r.clusterId,
      clusterSlug: r.clusterSlug,
      relationshipType: r.relationshipType,
    }))
  }

  async findRawArticleForPublisher(
    publisherId: string,
    rawArticleId: string
  ): Promise<{
    id: string
    sourceId: string
    title: string | null
    url: string | null
    summary: string | null
    contentText: string | null
    clusterId: string | null
    mainImageUrl: string | null
  } | null> {
    const rows = await this.db()
      .select({
        id: rawArticles.id,
        sourceId: rawArticles.sourceId,
        title: rawArticles.title,
        url: rawArticles.originalUrl,
        summary: rawArticles.description,
        contentText: rawArticles.articleBodyText,
        clusterId: rawArticles.clusterId,
        mainImageUrl: rawArticles.mainImageUrl,
      })
      .from(rawArticles)
      .innerJoin(publisherSources, eq(publisherSources.sourceId, rawArticles.sourceId))
      .where(
        and(eq(publisherSources.publisherId, publisherId), eq(rawArticles.id, rawArticleId))
      )
      .limit(1)
    return rows[0] ?? null
  }

  /**
   * Atomic schedule claim with stale recovery:
   * claim when unclaimed OR claim expired.
   */
  async claimNextScheduled(
    workerId: string,
    now: Date,
    leaseMs: number
  ): Promise<PublisherContentItem | null> {
    const expires = new Date(now.getTime() + leaseMs)
    const candidate = await this.db()
      .select({ id: publisherContentItems.id })
      .from(publisherContentItems)
      .where(
        and(
          eq(publisherContentItems.status, 'SCHEDULED'),
          lte(publisherContentItems.scheduledAt, now),
          or(
            isNull(publisherContentItems.scheduleClaimedBy),
            lte(publisherContentItems.scheduleClaimExpiresAt, now)
          )
        )
      )
      .orderBy(publisherContentItems.scheduledAt)
      .limit(1)

    const id = candidate[0]?.id
    if (!id) return null

    const rows = await this.db()
      .update(publisherContentItems)
      .set({
        scheduleClaimedAt: now,
        scheduleClaimedBy: workerId,
        scheduleClaimExpiresAt: expires,
        updatedAt: now,
      })
      .where(
        and(
          eq(publisherContentItems.id, id),
          eq(publisherContentItems.status, 'SCHEDULED'),
          lte(publisherContentItems.scheduledAt, now),
          or(
            isNull(publisherContentItems.scheduleClaimedBy),
            lte(publisherContentItems.scheduleClaimExpiresAt, now)
          )
        )
      )
      .returning()

    return rows[0] ? mapItem(rows[0]) : null
  }

  async createRevisionFromItem(
    item: PublisherContentItem,
    changeKind: string,
    note?: string | null,
    actorUserId?: string | null
  ): Promise<PublisherContentRevision> {
    const revisionNumber = await this.nextRevisionNumber(item.id)
    return this.insertRevision({
      contentId: item.id,
      revisionNumber,
      status: item.status,
      snapshot: snapshotContent(item),
      changeKind,
      note,
      createdBy: actorUserId,
    })
  }
}

export const publisherContentRepository = new PublisherContentRepository()
