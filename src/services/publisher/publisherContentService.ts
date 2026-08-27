import 'server-only'

import { textToArticleBlocks } from '@/lib/articleBlocks'
import { newPublisherId } from '@/lib/publisher/id'
import { publisherLog } from '@/lib/publisher/observability'
import {
  isPublisherContentStudioEnabled,
  isPublisherManualPublishEnabled,
  isPublisherSchedulingEnabled,
} from '@/lib/publisher/contentFlags'
import {
  applyDraftPatch,
  canRolePublishContent,
  canRoleReviewContent,
  canRoleSetBreaking,
  canUserEditContent,
  draftSlugCandidate,
} from '@/lib/publisher/contentDomain'
import { roleHasPermission } from '@/lib/publisher/authorization'
import type { PublisherMemberRecord, PublisherRecord } from '@/types/publisher'
import type {
  PublisherContentDraftInput,
  PublisherContentItem,
  PublisherContentStatus,
} from '@/types/publisherContent'
import { PublisherStudioAuthError, requirePublisherMember } from './publisherLayoutService'
import { PublisherRepository, publisherRepository } from './publisherRepository'
import {
  PublisherContentRepository,
  publisherContentRepository,
} from './publisherContentRepository'
import { publishContentToCanonicalNews } from './publisherContentPublish'

export class PublisherContentError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'DISABLED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'INVALID_STATE'
      | 'FLAG_OFF' = 'INVALID_STATE'
  ) {
    super(message)
    this.name = 'PublisherContentError'
  }
}

function emptyItem(
  publisherId: string,
  userId: string,
  partial?: Partial<PublisherContentItem>
): PublisherContentItem {
  const now = new Date()
  return {
    id: newPublisherId('pcnt'),
    publisherId,
    status: 'DRAFT',
    sourceMode: 'MANUAL',
    title: '',
    spot: null,
    summary: null,
    bodyBlocks: [],
    bodyHtml: null,
    categoryId: null,
    citySlug: null,
    districtSlug: null,
    cityName: null,
    districtName: null,
    heroImageUrl: null,
    videoUrl: null,
    tags: [],
    seoTitle: null,
    seoDescription: null,
    seoSlug: null,
    isBreaking: false,
    rightsStatus: 'UNKNOWN',
    rightsBasis: 'PUBLISHER_ORIGINAL',
    sourceUrl: null,
    originalSourceId: null,
    crawlerRawArticleId: null,
    crawlerClusterId: null,
    publishedNewsId: null,
    publishedAt: null,
    scheduledAt: null,
    scheduleTimezone: 'Europe/Istanbul',
    scheduleClaimedAt: null,
    scheduleClaimedBy: null,
    scheduleClaimExpiresAt: null,
    reviewNote: null,
    createdBy: userId,
    updatedBy: userId,
    approvedBy: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export class PublisherContentService {
  constructor(
    private readonly contentRepo: PublisherContentRepository = publisherContentRepository,
    private readonly publisherRepo: PublisherRepository = publisherRepository,
    private readonly publishFn: typeof publishContentToCanonicalNews = publishContentToCanonicalNews
  ) {}

  private assertStudio() {
    if (!isPublisherContentStudioEnabled()) {
      throw new PublisherContentError('CONTENT_STUDIO_DISABLED', 'DISABLED')
    }
  }

  private async loadPublisher(publisherId: string): Promise<PublisherRecord> {
    const pub = await this.publisherRepo.findById(publisherId)
    if (!pub) throw new PublisherContentError('PUBLISHER_NOT_FOUND', 'NOT_FOUND')
    return pub
  }

  async list(
    publisherId: string,
    userId: string,
    status?: PublisherContentStatus | 'ALL' | null
  ): Promise<PublisherContentItem[]> {
    this.assertStudio()
    await requirePublisherMember(publisherId, userId, 'content:read', this.publisherRepo)
    const statuses =
      !status || status === 'ALL'
        ? null
        : status === 'IN_REVIEW'
          ? (['IN_REVIEW', 'CHANGES_REQUESTED'] as PublisherContentStatus[])
          : ([status] as PublisherContentStatus[])
    return this.contentRepo.listByPublisher({ publisherId, status: statuses, limit: 80 })
  }

  async get(publisherId: string, contentId: string, userId: string): Promise<PublisherContentItem> {
    this.assertStudio()
    await requirePublisherMember(publisherId, userId, 'content:read', this.publisherRepo)
    const item = await this.contentRepo.findById(contentId)
    if (!item || item.publisherId !== publisherId) {
      throw new PublisherContentError('CONTENT_NOT_FOUND', 'NOT_FOUND')
    }
    return item
  }

  async createDraft(publisherId: string, userId: string): Promise<PublisherContentItem> {
    this.assertStudio()
    const member = await requirePublisherMember(publisherId, userId, 'content:write', this.publisherRepo)
    if (!roleHasPermission(member.role, 'content:write')) {
      throw new PublisherStudioAuthError('INSUFFICIENT_PERMISSION', 'FORBIDDEN')
    }
    const item = emptyItem(publisherId, userId, {
      title: 'Yeni Haber',
      seoSlug: draftSlugCandidate('yeni-haber'),
      rightsBasis: 'PUBLISHER_ORIGINAL',
      rightsStatus: 'CLEARED',
    })
    await this.contentRepo.insert(item)
    await this.contentRepo.createRevisionFromItem(item, 'CREATE', null, userId)
    await this.contentRepo.insertAudit({
      contentId: item.id,
      publisherId,
      eventType: 'CONTENT_CREATED',
      actorUserId: userId,
    })
    publisherLog('publisher_content_created', { publisherId, contentId: item.id, userId })
    return item
  }

  async saveDraft(
    publisherId: string,
    contentId: string,
    userId: string,
    patch: PublisherContentDraftInput,
    opts?: { meaningful?: boolean }
  ): Promise<PublisherContentItem> {
    this.assertStudio()
    const member = await requirePublisherMember(publisherId, userId, 'content:write', this.publisherRepo)
    const current = await this.contentRepo.findById(contentId)
    if (!current || current.publisherId !== publisherId) {
      throw new PublisherContentError('CONTENT_NOT_FOUND', 'NOT_FOUND')
    }
    if (!canUserEditContent(member.role, current, userId)) {
      throw new PublisherContentError('CANNOT_EDIT', 'FORBIDDEN')
    }

    if (patch.isBreaking !== undefined && patch.isBreaking !== current.isBreaking) {
      if (!canRoleSetBreaking(member.role) || !roleHasPermission(member.role, 'content:breaking')) {
        throw new PublisherContentError('BREAKING_FORBIDDEN', 'FORBIDDEN')
      }
    }

    const expectedVersion = patch.expectedVersion ?? current.version
    const expectedUpdatedAt = patch.expectedUpdatedAt ? new Date(patch.expectedUpdatedAt) : null
    const fields = applyDraftPatch(current, patch)
    if (patch.isBreaking !== undefined) fields.isBreaking = patch.isBreaking

    const updated = await this.contentRepo.updateOptimistic(
      contentId,
      publisherId,
      { version: expectedVersion, updatedAt: expectedUpdatedAt },
      { ...fields, updatedBy: userId }
    )
    if (!updated) throw new PublisherContentError('VERSION_CONFLICT', 'CONFLICT')

    if (opts?.meaningful !== false) {
      await this.contentRepo.createRevisionFromItem(updated, 'SAVE', null, userId)
    }
    await this.contentRepo.insertAudit({
      contentId,
      publisherId,
      eventType: 'CONTENT_SAVED',
      actorUserId: userId,
      payload: { version: updated.version },
    })
    if (patch.isBreaking !== undefined && patch.isBreaking !== current.isBreaking) {
      await this.contentRepo.insertAudit({
        contentId,
        publisherId,
        eventType: patch.isBreaking ? 'CONTENT_BREAKING_SET' : 'CONTENT_BREAKING_CLEARED',
        actorUserId: userId,
      })
    }
    return updated
  }

  async submitForReview(
    publisherId: string,
    contentId: string,
    userId: string
  ): Promise<PublisherContentItem> {
    this.assertStudio()
    const member = await requirePublisherMember(publisherId, userId, 'content:submit', this.publisherRepo)
    const current = await this.contentRepo.findById(contentId)
    if (!current || current.publisherId !== publisherId) {
      throw new PublisherContentError('CONTENT_NOT_FOUND', 'NOT_FOUND')
    }
    if (!canUserEditContent(member.role, current, userId) && current.createdBy !== userId) {
      throw new PublisherContentError('CANNOT_SUBMIT', 'FORBIDDEN')
    }
    if (current.status !== 'DRAFT' && current.status !== 'CHANGES_REQUESTED') {
      throw new PublisherContentError('INVALID_STATUS', 'INVALID_STATE')
    }
    if (!current.title.trim()) throw new PublisherContentError('TITLE_REQUIRED', 'INVALID_STATE')

    const updated = await this.contentRepo.updateOptimistic(
      contentId,
      publisherId,
      { version: current.version },
      { status: 'IN_REVIEW', reviewNote: null, updatedBy: userId }
    )
    if (!updated) throw new PublisherContentError('VERSION_CONFLICT', 'CONFLICT')
    await this.contentRepo.createRevisionFromItem(updated, 'SUBMIT', null, userId)
    await this.contentRepo.insertAudit({
      contentId,
      publisherId,
      eventType: 'CONTENT_SUBMITTED',
      actorUserId: userId,
    })
    return updated
  }

  async requestChanges(
    publisherId: string,
    contentId: string,
    userId: string,
    reviewNote: string
  ): Promise<PublisherContentItem> {
    this.assertStudio()
    const member = await requirePublisherMember(publisherId, userId, 'content:review', this.publisherRepo)
    if (!canRoleReviewContent(member.role)) {
      throw new PublisherContentError('CANNOT_REVIEW', 'FORBIDDEN')
    }
    const current = await this.contentRepo.findById(contentId)
    if (!current || current.publisherId !== publisherId) {
      throw new PublisherContentError('CONTENT_NOT_FOUND', 'NOT_FOUND')
    }
    if (current.status !== 'IN_REVIEW') {
      throw new PublisherContentError('INVALID_STATUS', 'INVALID_STATE')
    }
    const note = reviewNote.trim()
    if (!note) throw new PublisherContentError('REVIEW_NOTE_REQUIRED', 'INVALID_STATE')

    const updated = await this.contentRepo.updateOptimistic(
      contentId,
      publisherId,
      { version: current.version },
      { status: 'CHANGES_REQUESTED', reviewNote: note, updatedBy: userId }
    )
    if (!updated) throw new PublisherContentError('VERSION_CONFLICT', 'CONFLICT')
    await this.contentRepo.createRevisionFromItem(updated, 'CHANGES_REQUESTED', note, userId)
    await this.contentRepo.insertAudit({
      contentId,
      publisherId,
      eventType: 'CONTENT_CHANGES_REQUESTED',
      actorUserId: userId,
      payload: { reviewNote: note },
    })
    return updated
  }

  async approve(
    publisherId: string,
    contentId: string,
    userId: string
  ): Promise<PublisherContentItem> {
    this.assertStudio()
    const member = await requirePublisherMember(publisherId, userId, 'content:review', this.publisherRepo)
    if (!canRoleReviewContent(member.role)) {
      throw new PublisherContentError('CANNOT_REVIEW', 'FORBIDDEN')
    }
    const current = await this.contentRepo.findById(contentId)
    if (!current || current.publisherId !== publisherId) {
      throw new PublisherContentError('CONTENT_NOT_FOUND', 'NOT_FOUND')
    }
    if (current.status !== 'IN_REVIEW') {
      throw new PublisherContentError('INVALID_STATUS', 'INVALID_STATE')
    }
    const updated = await this.contentRepo.updateOptimistic(
      contentId,
      publisherId,
      { version: current.version },
      { status: 'APPROVED', approvedBy: userId, reviewNote: null, updatedBy: userId }
    )
    if (!updated) throw new PublisherContentError('VERSION_CONFLICT', 'CONFLICT')
    await this.contentRepo.createRevisionFromItem(updated, 'APPROVE', null, userId)
    await this.contentRepo.insertAudit({
      contentId,
      publisherId,
      eventType: 'CONTENT_APPROVED',
      actorUserId: userId,
    })
    return updated
  }

  async publishNow(
    publisherId: string,
    contentId: string,
    userId: string,
    opts?: { fast?: boolean; displayName?: string | null }
  ): Promise<PublisherContentItem> {
    this.assertStudio()
    if (!isPublisherManualPublishEnabled()) {
      throw new PublisherContentError('MANUAL_PUBLISH_DISABLED', 'FLAG_OFF')
    }
    const member = await requirePublisherMember(publisherId, userId, 'content:publish', this.publisherRepo)
    if (!canRolePublishContent(member.role)) {
      throw new PublisherContentError('CANNOT_PUBLISH', 'FORBIDDEN')
    }
    const publisher = await this.loadPublisher(publisherId)
    const current = await this.contentRepo.findById(contentId)
    if (!current || current.publisherId !== publisherId) {
      throw new PublisherContentError('CONTENT_NOT_FOUND', 'NOT_FOUND')
    }

    // Idempotent: already published
    if (current.status === 'PUBLISHED' && current.publishedNewsId) {
      return current
    }

    const allowed =
      current.status === 'APPROVED' ||
      current.status === 'SCHEDULED' ||
      (opts?.fast &&
        (current.status === 'DRAFT' ||
          current.status === 'IN_REVIEW' ||
          current.status === 'CHANGES_REQUESTED'))
    if (!allowed) throw new PublisherContentError('INVALID_STATUS', 'INVALID_STATE')
    if (!current.title.trim()) throw new PublisherContentError('TITLE_REQUIRED', 'INVALID_STATE')

    const publishedAt = new Date()
    const preferredId = current.publishedNewsId
    const published = await this.publishFn({
      item: current,
      publisher,
      actorUserId: userId,
      actorDisplayName: opts?.displayName ?? publisher.displayName,
      preferredNewsId: preferredId,
    })

    if (published.alreadyPublished && current.publishedNewsId) {
      return current
    }

    const claimed = await this.contentRepo.claimPublishSlot(
      contentId,
      publisherId,
      published.newsId,
      userId,
      publishedAt,
      { seoSlug: published.slug }
    )

    // Race: another request won — return winner state
    if (!claimed) {
      const again = await this.contentRepo.findById(contentId)
      if (again?.publishedNewsId) return again
      throw new PublisherContentError('PUBLISH_RACE', 'CONFLICT')
    }

    await this.contentRepo.createRevisionFromItem(claimed, 'PUBLISH', null, userId)
    await this.contentRepo.insertAudit({
      contentId,
      publisherId,
      eventType: opts?.fast ? 'CONTENT_FAST_PUBLISHED' : 'CONTENT_PUBLISHED',
      actorUserId: userId,
      payload: { newsId: published.newsId, slug: published.slug },
    })
    publisherLog('publisher_content_published', {
      publisherId,
      contentId,
      newsId: published.newsId,
      userId,
      fast: Boolean(opts?.fast),
    })
    return claimed
  }

  async schedule(
    publisherId: string,
    contentId: string,
    userId: string,
    scheduledAtIso: string,
    timezone = 'Europe/Istanbul'
  ): Promise<PublisherContentItem> {
    this.assertStudio()
    if (!isPublisherSchedulingEnabled()) {
      throw new PublisherContentError('SCHEDULING_DISABLED', 'FLAG_OFF')
    }
    const member = await requirePublisherMember(publisherId, userId, 'content:schedule', this.publisherRepo)
    if (!canRolePublishContent(member.role)) {
      throw new PublisherContentError('CANNOT_SCHEDULE', 'FORBIDDEN')
    }
    const current = await this.contentRepo.findById(contentId)
    if (!current || current.publisherId !== publisherId) {
      throw new PublisherContentError('CONTENT_NOT_FOUND', 'NOT_FOUND')
    }
    if (current.status !== 'APPROVED' && current.status !== 'SCHEDULED') {
      throw new PublisherContentError('INVALID_STATUS', 'INVALID_STATE')
    }
    const scheduledAt = new Date(scheduledAtIso)
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new PublisherContentError('INVALID_SCHEDULE', 'INVALID_STATE')
    }

    const updated = await this.contentRepo.updateOptimistic(
      contentId,
      publisherId,
      { version: current.version },
      {
        status: 'SCHEDULED',
        scheduledAt,
        scheduleTimezone: timezone,
        scheduleClaimedAt: null,
        scheduleClaimedBy: null,
        scheduleClaimExpiresAt: null,
        updatedBy: userId,
      }
    )
    if (!updated) throw new PublisherContentError('VERSION_CONFLICT', 'CONFLICT')
    await this.contentRepo.createRevisionFromItem(updated, 'SCHEDULE', null, userId)
    await this.contentRepo.insertAudit({
      contentId,
      publisherId,
      eventType: 'CONTENT_SCHEDULED',
      actorUserId: userId,
      payload: { scheduledAt: scheduledAt.toISOString(), timezone },
    })
    return updated
  }

  async archive(
    publisherId: string,
    contentId: string,
    userId: string
  ): Promise<PublisherContentItem> {
    this.assertStudio()
    await requirePublisherMember(publisherId, userId, 'content:archive', this.publisherRepo)
    const current = await this.contentRepo.findById(contentId)
    if (!current || current.publisherId !== publisherId) {
      throw new PublisherContentError('CONTENT_NOT_FOUND', 'NOT_FOUND')
    }
    if (current.status === 'ARCHIVED') return current
    // Soft archive only — never hard-delete published
    const updated = await this.contentRepo.updateOptimistic(
      contentId,
      publisherId,
      { version: current.version },
      { status: 'ARCHIVED', updatedBy: userId }
    )
    if (!updated) throw new PublisherContentError('VERSION_CONFLICT', 'CONFLICT')
    await this.contentRepo.createRevisionFromItem(updated, 'ARCHIVE', null, userId)
    await this.contentRepo.insertAudit({
      contentId,
      publisherId,
      eventType: 'CONTENT_ARCHIVED',
      actorUserId: userId,
    })
    return updated
  }

  async importFromSourceArticle(
    publisherId: string,
    userId: string,
    rawArticleId: string
  ): Promise<PublisherContentItem> {
    this.assertStudio()
    await requirePublisherMember(publisherId, userId, 'content:write', this.publisherRepo)
    const raw = await this.contentRepo.findRawArticleForPublisher(publisherId, rawArticleId)
    if (!raw) throw new PublisherContentError('SOURCE_NOT_FOUND', 'NOT_FOUND')

    const body = (raw.contentText ?? raw.summary ?? '').trim()
    const item = emptyItem(publisherId, userId, {
      title: (raw.title ?? '').trim() || 'Kaynak Haber',
      summary: raw.summary,
      spot: raw.summary,
      bodyBlocks: body ? textToArticleBlocks(body) : [],
      heroImageUrl: raw.mainImageUrl,
      sourceMode: 'CRAWLER_SOURCE',
      rightsBasis: 'SOURCE_ASSOCIATED',
      rightsStatus: 'PENDING',
      sourceUrl: raw.url,
      originalSourceId: raw.sourceId,
      crawlerRawArticleId: raw.id,
      crawlerClusterId: raw.clusterId,
      seoSlug: draftSlugCandidate(raw.title ?? 'kaynak-haber'),
    })
    await this.contentRepo.insert(item)
    await this.contentRepo.createRevisionFromItem(item, 'SOURCE_IMPORT', null, userId)
    await this.contentRepo.insertAudit({
      contentId: item.id,
      publisherId,
      eventType: 'CONTENT_SOURCE_IMPORTED',
      actorUserId: userId,
      payload: { rawArticleId: raw.id, sourceId: raw.sourceId, ai: false },
    })
    publisherLog('publisher_content_source_imported', {
      publisherId,
      contentId: item.id,
      rawArticleId: raw.id,
      userId,
    })
    return item
  }

  async listSourceArticles(publisherId: string, userId: string) {
    this.assertStudio()
    await requirePublisherMember(publisherId, userId, 'content:read', this.publisherRepo)
    return this.contentRepo.listSourceArticles({ publisherId, limit: 60 })
  }

  async listAudit(publisherId: string, contentId: string, userId: string) {
    this.assertStudio()
    await requirePublisherMember(publisherId, userId, 'content:read', this.publisherRepo)
    const item = await this.contentRepo.findById(contentId)
    if (!item || item.publisherId !== publisherId) {
      throw new PublisherContentError('CONTENT_NOT_FOUND', 'NOT_FOUND')
    }
    return this.contentRepo.listAudit(contentId)
  }

  /** Cron: claim + publish due scheduled items (no AI). */
  async runScheduleTick(workerId: string, limit = 5): Promise<{
    claimed: number
    published: number
    recovered: number
    errors: number
  }> {
    if (!isPublisherSchedulingEnabled() || !isPublisherManualPublishEnabled()) {
      return { claimed: 0, published: 0, recovered: 0, errors: 0 }
    }
    const now = new Date()
    const leaseMs = 2 * 60 * 1000
    let claimed = 0
    let published = 0
    let recovered = 0
    let errors = 0

    for (let i = 0; i < limit; i++) {
      const item = await this.contentRepo.claimNextScheduled(workerId, now, leaseMs)
      if (!item) break
      claimed++
      if (item.scheduleClaimedBy && item.scheduleClaimExpiresAt && item.scheduleClaimExpiresAt <= now) {
        recovered++
        await this.contentRepo.insertAudit({
          contentId: item.id,
          publisherId: item.publisherId,
          eventType: 'SCHEDULE_CLAIM_STALE_RECOVERED',
          actorUserId: workerId,
        })
      }
      await this.contentRepo.insertAudit({
        contentId: item.id,
        publisherId: item.publisherId,
        eventType: 'SCHEDULE_CLAIMED',
        actorUserId: workerId,
      })
      try {
        const publisher = await this.loadPublisher(item.publisherId)
        const pub = await this.publishFn({
          item,
          publisher,
          actorUserId: item.approvedBy || item.createdBy,
          actorDisplayName: publisher.displayName,
        })
        const claimedPub = await this.contentRepo.claimPublishSlot(
          item.id,
          item.publisherId,
          pub.newsId,
          workerId,
          new Date(),
          { seoSlug: pub.slug }
        )
        if (claimedPub) {
          published++
          await this.contentRepo.insertAudit({
            contentId: item.id,
            publisherId: item.publisherId,
            eventType: 'SCHEDULE_PUBLISHED',
            actorUserId: workerId,
            payload: { newsId: pub.newsId },
          })
        }
      } catch (err) {
        errors++
        console.error(
          '[publisherContent.schedule]',
          item.id,
          err instanceof Error ? err.message : err
        )
        // release claim so another tick can retry
        await this.contentRepo.updateOptimistic(
          item.id,
          item.publisherId,
          { version: item.version },
          {
            scheduleClaimedAt: null,
            scheduleClaimedBy: null,
            scheduleClaimExpiresAt: null,
          }
        )
      }
    }

    return { claimed, published, recovered, errors }
  }
}

export const publisherContentService = new PublisherContentService()

export type { PublisherMemberRecord }
