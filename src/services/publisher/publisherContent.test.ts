/**
 * Phase P7 — Publisher Content Studio tests (in-memory, no live DB / AI).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { roleHasPermission } from '@/lib/publisher/authorization'
import { newPublisherId } from '@/lib/publisher/id'
import {
  canRolePublishContent,
  canUserEditContent,
  resolveStablePublishSlug,
} from '@/lib/publisher/contentDomain'
import { getArticleSeoContext } from '@/services/seo/articleSeoContext'
import {
  PublisherContentError,
  PublisherContentService,
} from '@/services/publisher/publisherContentService'
import type { PublisherContentRepository } from '@/services/publisher/publisherContentRepository'
import type { PublisherRepository } from '@/services/publisher/publisherRepository'
import type {
  PublisherMemberRecord,
  PublisherRecord,
} from '@/types/publisher'
import type {
  PublisherContentAuditRow,
  PublisherContentItem,
  PublisherContentRevision,
  PublisherContentStatus,
} from '@/types/publisherContent'
import { snapshotContent } from '@/lib/publisher/contentDomain'

vi.mock('@/lib/publisher/contentFlags', () => ({
  isPublisherContentStudioEnabled: () => true,
  isPublisherManualPublishEnabled: () => true,
  isPublisherSchedulingEnabled: () => true,
}))

vi.mock('@/lib/publisher/featureFlag', () => ({
  isPublisherPlatformEnabled: () => true,
  isPublisherStudioEnabled: () => true,
  isPublisherProfileComposerEnabled: () => true,
}))

function now() {
  return new Date()
}

function makePublisher(): PublisherRecord {
  const t = now()
  return {
    id: 'pub_test',
    name: 'Test',
    slug: 'test-gazete',
    displayName: 'Test Gazete',
    publisherType: 'NEWS_ORGANIZATION',
    status: 'ACTIVE',
    description: null,
    logoUrl: null,
    coverImageUrl: null,
    websiteUrl: null,
    primaryDomain: 'test.example',
    countryCode: 'TR',
    city: null,
    district: null,
    verificationStatus: 'VERIFIED',
    claimedAt: t,
    verifiedAt: t,
    createdAt: t,
    updatedAt: t,
  }
}

function makeMember(
  role: PublisherMemberRecord['role'],
  userId: string
): PublisherMemberRecord {
  const t = now()
  return {
    id: newPublisherId('pmem'),
    publisherId: 'pub_test',
    userId,
    role,
    status: 'ACTIVE',
    invitedAt: null,
    acceptedAt: t,
    createdAt: t,
    updatedAt: t,
  }
}

class MemoryPublisherRepo {
  members: PublisherMemberRecord[] = []
  publisher = makePublisher()

  async findById(id: string) {
    return id === this.publisher.id ? this.publisher : null
  }
  async findActiveMember(publisherId: string, userId: string) {
    return (
      this.members.find(
        (m) => m.publisherId === publisherId && m.userId === userId && m.status === 'ACTIVE'
      ) ?? null
    )
  }
}

class MemoryContentRepo {
  items: PublisherContentItem[] = []
  revisions: PublisherContentRevision[] = []
  audits: PublisherContentAuditRow[] = []
  rawArticles = new Map<
    string,
    {
      id: string
      sourceId: string
      title: string | null
      url: string | null
      summary: string | null
      contentText: string | null
      clusterId: string | null
      mainImageUrl: string | null
    }
  >()

  async findById(id: string) {
    return this.items.find((i) => i.id === id) ?? null
  }

  async listByPublisher(input: {
    publisherId: string
    status?: PublisherContentStatus | PublisherContentStatus[] | null
    limit?: number
  }) {
    let rows = this.items.filter((i) => i.publisherId === input.publisherId)
    if (input.status) {
      const set = new Set(Array.isArray(input.status) ? input.status : [input.status])
      rows = rows.filter((i) => set.has(i.status))
    }
    return rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, input.limit ?? 40)
  }

  async insert(item: PublisherContentItem) {
    this.items.push({ ...item })
    return item
  }

  async updateOptimistic(
    id: string,
    publisherId: string,
    expected: { version?: number | null; updatedAt?: Date | null },
    patch: Partial<PublisherContentItem>
  ) {
    const idx = this.items.findIndex((i) => i.id === id && i.publisherId === publisherId)
    if (idx < 0) return null
    const cur = this.items[idx]!
    if (expected.version != null && cur.version !== expected.version) return null
    const next: PublisherContentItem = {
      ...cur,
      ...patch,
      version: cur.version + 1,
      updatedAt: now(),
    }
    this.items[idx] = next
    return next
  }

  async claimPublishSlot(
    id: string,
    publisherId: string,
    newsId: string,
    actorUserId: string,
    publishedAt: Date,
    extra?: Partial<PublisherContentItem>
  ) {
    const idx = this.items.findIndex(
      (i) => i.id === id && i.publisherId === publisherId && !i.publishedNewsId
    )
    if (idx < 0) return null
    const cur = this.items[idx]!
    if (!['APPROVED', 'SCHEDULED', 'IN_REVIEW', 'DRAFT'].includes(cur.status)) return null
    const next: PublisherContentItem = {
      ...cur,
      status: 'PUBLISHED',
      publishedNewsId: newsId,
      publishedAt,
      scheduledAt: null,
      scheduleClaimedAt: null,
      scheduleClaimedBy: null,
      scheduleClaimExpiresAt: null,
      updatedBy: actorUserId,
      seoSlug: extra?.seoSlug ?? cur.seoSlug,
      version: cur.version + 1,
      updatedAt: now(),
    }
    this.items[idx] = next
    return next
  }

  async insertRevision(input: {
    contentId: string
    revisionNumber: number
    status: PublisherContentStatus
    snapshot: Record<string, unknown>
    changeKind: string
    note?: string | null
    createdBy?: string | null
  }) {
    const row: PublisherContentRevision = {
      id: newPublisherId('prev'),
      contentId: input.contentId,
      revisionNumber: input.revisionNumber,
      status: input.status,
      snapshot: input.snapshot,
      changeKind: input.changeKind,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now(),
    }
    this.revisions.push(row)
    return row
  }

  async nextRevisionNumber(contentId: string) {
    const max = this.revisions
      .filter((r) => r.contentId === contentId)
      .reduce((m, r) => Math.max(m, r.revisionNumber), 0)
    return max + 1
  }

  async insertAudit(input: {
    contentId: string
    publisherId: string
    eventType: string
    actorUserId?: string | null
    payload?: Record<string, unknown> | null
  }) {
    const row: PublisherContentAuditRow = {
      id: newPublisherId('paud'),
      contentId: input.contentId,
      publisherId: input.publisherId,
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      payload: input.payload ?? null,
      createdAt: now(),
    }
    this.audits.push(row)
    return row
  }

  async listAudit(contentId: string) {
    return this.audits.filter((a) => a.contentId === contentId)
  }

  async listSourceArticles() {
    return []
  }

  async findRawArticleForPublisher(_publisherId: string, rawArticleId: string) {
    return this.rawArticles.get(rawArticleId) ?? null
  }

  async claimNextScheduled(workerId: string, at: Date, leaseMs: number) {
    const candidate = this.items.find(
      (i) =>
        i.status === 'SCHEDULED' &&
        i.scheduledAt &&
        i.scheduledAt <= at &&
        (!i.scheduleClaimedBy || (i.scheduleClaimExpiresAt && i.scheduleClaimExpiresAt <= at))
    )
    if (!candidate) return null
    const next = {
      ...candidate,
      scheduleClaimedAt: at,
      scheduleClaimedBy: workerId,
      scheduleClaimExpiresAt: new Date(at.getTime() + leaseMs),
      updatedAt: at,
    }
    const idx = this.items.findIndex((i) => i.id === candidate.id)
    this.items[idx] = next
    return next
  }

  async createRevisionFromItem(
    item: PublisherContentItem,
    changeKind: string,
    note?: string | null,
    actorUserId?: string | null
  ) {
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

describe('P7 publisher content studio', () => {
  let pubRepo: MemoryPublisherRepo
  let contentRepo: MemoryContentRepo
  let service: PublisherContentService
  let publishCalls: number

  beforeEach(() => {
    pubRepo = new MemoryPublisherRepo()
    pubRepo.members = [
      makeMember('OWNER', 'owner1'),
      makeMember('EDITOR', 'editor1'),
      makeMember('AUTHOR', 'author1'),
      makeMember('AUTHOR', 'author2'),
      makeMember('AD_MANAGER', 'ads1'),
      makeMember('ANALYST', 'analyst1'),
    ]
    contentRepo = new MemoryContentRepo()
    publishCalls = 0
    service = new PublisherContentService(
      contentRepo as unknown as PublisherContentRepository,
      pubRepo as unknown as PublisherRepository,
      async ({ item }) => {
        publishCalls++
        const newsId = item.publishedNewsId || `news_${item.id}`
        return { newsId, slug: resolveStablePublishSlug(item, newsId), alreadyPublished: Boolean(item.publishedNewsId) }
      }
    )
  })

  it('auth: AD_MANAGER cannot publish; AUTHOR can write own draft', async () => {
    expect(roleHasPermission('AD_MANAGER', 'content:publish')).toBe(false)
    expect(roleHasPermission('AUTHOR', 'content:write')).toBe(true)
    expect(roleHasPermission('ANALYST', 'content:write')).toBe(false)
    expect(canRolePublishContent('EDITOR')).toBe(true)

    const draft = await service.createDraft('pub_test', 'author1')
    expect(draft.status).toBe('DRAFT')
    expect(canUserEditContent('AUTHOR', draft, 'author1')).toBe(true)
    expect(canUserEditContent('AUTHOR', draft, 'author2')).toBe(false)
    expect(canUserEditContent('EDITOR', draft, 'editor1')).toBe(true)
  })

  it('draft + revision on meaningful save', async () => {
    const draft = await service.createDraft('pub_test', 'author1')
    const saved = await service.saveDraft('pub_test', draft.id, 'author1', {
      title: 'Test başlık',
      expectedVersion: draft.version,
    })
    expect(saved.title).toBe('Test başlık')
    expect(contentRepo.revisions.length).toBeGreaterThanOrEqual(2)
  })

  it('review workflow: submit → changes → approve', async () => {
    const draft = await service.createDraft('pub_test', 'author1')
    await service.saveDraft('pub_test', draft.id, 'author1', {
      title: 'Haber',
      expectedVersion: draft.version,
    })
    const submitted = await service.submitForReview('pub_test', draft.id, 'author1')
    expect(submitted.status).toBe('IN_REVIEW')

    const changes = await service.requestChanges('pub_test', draft.id, 'editor1', 'Spot ekle')
    expect(changes.status).toBe('CHANGES_REQUESTED')
    expect(changes.reviewNote).toBe('Spot ekle')

    const again = await service.submitForReview('pub_test', draft.id, 'author1')
    expect(again.status).toBe('IN_REVIEW')
    const approved = await service.approve('pub_test', draft.id, 'editor1')
    expect(approved.status).toBe('APPROVED')
  })

  it('publish is idempotent (double-click safe)', async () => {
    const draft = await service.createDraft('pub_test', 'editor1')
    await service.saveDraft('pub_test', draft.id, 'editor1', {
      title: 'Yayın haberi',
      expectedVersion: draft.version,
    })
    await service.submitForReview('pub_test', draft.id, 'editor1')
    await service.approve('pub_test', draft.id, 'editor1')

    const first = await service.publishNow('pub_test', draft.id, 'editor1')
    expect(first.status).toBe('PUBLISHED')
    expect(first.publishedNewsId).toBeTruthy()
    const callsAfterFirst = publishCalls

    const second = await service.publishNow('pub_test', draft.id, 'editor1')
    expect(second.publishedNewsId).toBe(first.publishedNewsId)
    expect(publishCalls).toBe(callsAfterFirst)
  })

  it('schedule claim is atomic and recovers stale lease', async () => {
    const draft = await service.createDraft('pub_test', 'editor1')
    await service.saveDraft('pub_test', draft.id, 'editor1', {
      title: 'Planlı',
      expectedVersion: draft.version,
    })
    await service.submitForReview('pub_test', draft.id, 'editor1')
    await service.approve('pub_test', draft.id, 'editor1')
    const scheduledAt = new Date(Date.now() - 60_000)
    await service.schedule(
      'pub_test',
      draft.id,
      'editor1',
      new Date(Date.now() + 3_600_000).toISOString()
    )
    // force due
    const item = contentRepo.items[0]!
    item.scheduledAt = scheduledAt
    item.status = 'SCHEDULED'
    item.scheduleClaimedBy = 'old_worker'
    item.scheduleClaimExpiresAt = new Date(Date.now() - 1000)

    const tick = await service.runScheduleTick('worker_new', 3)
    expect(tick.claimed).toBe(1)
    expect(tick.published).toBe(1)
    expect(contentRepo.items[0]!.status).toBe('PUBLISHED')
  })

  it('source import creates draft without AI and does not mutate raw', async () => {
    contentRepo.rawArticles.set('raw_1', {
      id: 'raw_1',
      sourceId: 'src_1',
      title: 'Kaynak başlık',
      url: 'https://example.com/a',
      summary: 'Özet',
      contentText: 'Gövde metni burada.',
      clusterId: 'cl_1',
      mainImageUrl: null,
    })
    const imported = await service.importFromSourceArticle('pub_test', 'author1', 'raw_1')
    expect(imported.sourceMode).toBe('CRAWLER_SOURCE')
    expect(imported.crawlerRawArticleId).toBe('raw_1')
    expect(imported.status).toBe('DRAFT')
    expect(imported.rightsBasis).toBe('SOURCE_ASSOCIATED')
    expect(contentRepo.rawArticles.get('raw_1')!.title).toBe('Kaynak başlık')
    expect(publishCalls).toBe(0)
    expect(contentRepo.audits.some((a) => a.eventType === 'CONTENT_SOURCE_IMPORTED')).toBe(true)
  })

  it('AUTHOR cannot edit others drafts', async () => {
    const draft = await service.createDraft('pub_test', 'author1')
    await expect(
      service.saveDraft('pub_test', draft.id, 'author2', {
        title: 'Hırsız',
        expectedVersion: draft.version,
      })
    ).rejects.toBeInstanceOf(PublisherContentError)
  })
})

describe('P7 SEO context', () => {
  it('accepts nullable publisher_id / cluster_id / source_id opts', async () => {
    const ctx = await getArticleSeoContext(
      {
        id: 'x',
        title: 't',
        slug: 's',
        content: '',
        summary: '',
        authorId: 'a',
        authorUsername: 'a',
        authorDisplayName: 'a',
        authorPhotoURL: null,
        categoryId: 'gundem',
        tags: [],
        mediaItems: [],
        coverImageUrl: null,
        status: 'published',
        visibility: 'public',
        postType: 'news',
        source: '',
        likesCount: 0,
        commentsCount: 0,
        savesCount: 0,
        sharesCount: 0,
        viewsCount: 0,
        isEditorPick: false,
        isTrending: false,
        publishedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { publisherId: null, clusterId: null, sourceId: null }
    )
    expect(ctx).toEqual({ publisher: null, event: null })
  })
})

describe('P7 preview noindex contract', () => {
  it('preview route metadata requests noindex', async () => {
    const mod = await import('@/app/(main)/publisher-studio/[slug]/preview/[contentId]/page')
    const meta = await mod.generateMetadata()
    expect(meta.robots).toMatchObject({ index: false, follow: false })
  })
})
