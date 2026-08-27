/**
 * Phase P7A — Publisher Content + Canonical Publish Bridge tests.
 * In-memory / fake adapters only — no live DB / AI / Firestore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { roleHasPermission } from '@/lib/publisher/authorization'
import { newPublisherId } from '@/lib/publisher/id'
import {
  articleBlocksToSafeHtml,
  canRolePublishContent,
  canUserEditContent,
  resolveStablePublishSlug,
} from '@/lib/publisher/contentDomain'
import { getArticleSeoContext } from '@/services/seo/articleSeoContext'
import {
  PublisherContentError,
  PublisherContentService,
} from '@/services/publisher/publisherContentService'
import {
  PublisherPublishService,
  type FirestoreNewsWriter,
} from '@/services/publisher/publisherContentPublish'
import type { NewsMirrorRepository } from '@/services/publisher/newsMirrorRepository'
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
      (i) =>
        i.id === id &&
        i.publisherId === publisherId &&
        (!i.publishedNewsId || i.publishedNewsId === newsId)
    )
    if (idx < 0) return null
    const cur = this.items[idx]!
    const next: PublisherContentItem = {
      ...cur,
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
      seoSlug: extra?.seoSlug ?? cur.seoSlug,
      version: cur.version + 1,
      updatedAt: now(),
    }
    this.items[idx] = next
    return next
  }

  async listPartialPublications(limit = 10) {
    return this.items
      .filter((i) => ['PARTIAL', 'FAILED', 'PUBLISHING'].includes(i.publicationStatus))
      .slice(0, limit)
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

describe('P7A security + permissions', () => {
  it('role matrix: AD_MANAGER/ANALYST cannot mutate; AUTHOR limited; EDITOR can publish', () => {
    expect(roleHasPermission('AD_MANAGER', 'content:create')).toBe(false)
    expect(roleHasPermission('AD_MANAGER', 'content:publish')).toBe(false)
    expect(roleHasPermission('ANALYST', 'content:update:own')).toBe(false)
    expect(roleHasPermission('AUTHOR', 'content:create')).toBe(true)
    expect(roleHasPermission('AUTHOR', 'content:publish')).toBe(false)
    expect(roleHasPermission('AUTHOR', 'content:source-import')).toBe(true)
    expect(roleHasPermission('EDITOR', 'content:approve')).toBe(true)
    expect(canRolePublishContent('EDITOR')).toBe(true)
  })
})

describe('P7A workflow', () => {
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
        const slug = resolveStablePublishSlug(item, newsId)
        await contentRepo.claimPublishSlot(item.id, item.publisherId, newsId, 'editor1', now(), {
          seoSlug: slug,
          publicationStatus: 'PUBLISHED',
          firestoreStatus: 'OK',
          postgresStatus: 'OK',
        })
        return {
          newsId,
          slug,
          alreadyPublished: Boolean(item.publishedNewsId && item.publicationStatus === 'PUBLISHED'),
          publicationStatus: 'PUBLISHED' as const,
          firestoreOk: true,
          postgresOk: true,
        }
      }
    )
  })

  it('AUTHOR cannot edit others drafts; AD_MANAGER cannot create', async () => {
    const draft = await service.createDraft('pub_test', 'author1')
    expect(canUserEditContent('AUTHOR', draft, 'author1')).toBe(true)
    expect(canUserEditContent('AUTHOR', draft, 'author2')).toBe(false)
    await expect(
      service.saveDraft('pub_test', draft.id, 'author2', {
        title: 'Hırsız',
        expectedVersion: draft.version,
      })
    ).rejects.toBeInstanceOf(PublisherContentError)
    await expect(service.createDraft('pub_test', 'ads1')).rejects.toBeTruthy()
  })

  it('version conflict on stale expectedVersion', async () => {
    const draft = await service.createDraft('pub_test', 'author1')
    await service.saveDraft('pub_test', draft.id, 'author1', {
      title: 'v2',
      expectedVersion: draft.version,
    })
    await expect(
      service.saveDraft('pub_test', draft.id, 'author1', {
        title: 'stale',
        expectedVersion: draft.version,
      })
    ).rejects.toMatchObject({ message: 'CONTENT_VERSION_CONFLICT' })
  })

  it('submit → changes → approve → illegal transition rejected', async () => {
    const draft = await service.createDraft('pub_test', 'author1')
    await service.saveDraft('pub_test', draft.id, 'author1', {
      title: 'Haber',
      expectedVersion: draft.version,
    })
    const submitted = await service.submitForReview('pub_test', draft.id, 'author1')
    expect(submitted.status).toBe('IN_REVIEW')

    const changes = await service.requestChanges('pub_test', draft.id, 'editor1', 'Spot ekle')
    expect(changes.status).toBe('CHANGES_REQUESTED')

    await service.submitForReview('pub_test', draft.id, 'author1')
    const approved = await service.approve('pub_test', draft.id, 'editor1')
    expect(approved.status).toBe('APPROVED')

    await expect(service.approve('pub_test', draft.id, 'editor1')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    })
  })

  it('publish is idempotent', async () => {
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
    expect(first.publicationStatus).toBe('PUBLISHED')
    const callsAfterFirst = publishCalls

    const second = await service.publishNow('pub_test', draft.id, 'editor1')
    expect(second.publishedNewsId).toBe(first.publishedNewsId)
    expect(publishCalls).toBe(callsAfterFirst)
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
    expect(imported.crawlerClusterId).toBe('cl_1')
    expect(imported.rightsBasis).toBe('SOURCE_ASSOCIATED')
    expect(contentRepo.rawArticles.get('raw_1')!.title).toBe('Kaynak başlık')
    expect(publishCalls).toBe(0)
  })

  it('AUTHOR cannot publish', async () => {
    const draft = await service.createDraft('pub_test', 'author1')
    await service.saveDraft('pub_test', draft.id, 'author1', {
      title: 'X',
      expectedVersion: draft.version,
    })
    await service.submitForReview('pub_test', draft.id, 'author1')
    await service.approve('pub_test', draft.id, 'editor1')
    await expect(service.publishNow('pub_test', draft.id, 'author1')).rejects.toBeTruthy()
  })
})

describe('P7A dual-write bridge (fake adapters)', () => {
  let contentRepo: MemoryContentRepo
  let firestoreDocs: Map<string, Record<string, unknown>>
  let pgRows: Map<string, { id: string }>
  let firestoreFail = false
  let pgFail = false

  function makeItem(partial?: Partial<PublisherContentItem>): PublisherContentItem {
    const t = now()
    return {
      id: 'pcnt_1',
      publisherId: 'pub_test',
      status: 'APPROVED',
      sourceMode: 'MANUAL',
      title: 'Köprü haberi',
      spot: null,
      summary: 'Özet',
      bodyBlocks: [{ id: 'b1', type: 'paragraph', text: 'Gövde <script>x</script>' }],
      bodyHtml: null,
      categoryId: 'gundem',
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
      rightsStatus: 'CLEARED',
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
      publicationStatus: 'NONE',
      firestoreStatus: 'NONE',
      postgresStatus: 'NONE',
      publicationAttempts: 0,
      publicationLastError: null,
      publicationClaimedAt: null,
      publicationClaimedBy: null,
      reviewNote: null,
      createdBy: 'editor1',
      updatedBy: 'editor1',
      approvedBy: 'editor1',
      version: 1,
      createdAt: t,
      updatedAt: t,
      ...partial,
    }
  }

  beforeEach(async () => {
    contentRepo = new MemoryContentRepo()
    firestoreDocs = new Map()
    pgRows = new Map()
    firestoreFail = false
    pgFail = false
    await contentRepo.insert(makeItem())
  })

  function buildService() {
    const firestore: FirestoreNewsWriter = {
      async ensurePublishedNews({ newsId, payload }) {
        if (firestoreFail) throw new Error('FS_DOWN')
        firestoreDocs.set(newsId, payload)
      },
    }
    const mirror = {
      async ensurePublishedNewsMirror(payload: { id: string }) {
        if (pgFail) throw new Error('PG_DOWN')
        pgRows.set(payload.id, { id: payload.id })
        return { id: payload.id, created: true }
      },
    } as unknown as NewsMirrorRepository

    return new PublisherPublishService(
      contentRepo as unknown as PublisherContentRepository,
      mirror,
      firestore,
      { createId: () => 'news_stable_1' }
    )
  }

  it('successful publish creates one logical article id in both stores', async () => {
    const svc = buildService()
    const item = (await contentRepo.findById('pcnt_1'))!
    const result = await svc.publishContent({
      item,
      publisher: makePublisher(),
      actorUserId: 'editor1',
    })
    expect(result.newsId).toBe('news_stable_1')
    expect(result.publicationStatus).toBe('PUBLISHED')
    expect(firestoreDocs.has('news_stable_1')).toBe(true)
    expect(pgRows.has('news_stable_1')).toBe(true)
    const after = await contentRepo.findById('pcnt_1')
    expect(after?.publishedNewsId).toBe('news_stable_1')
    expect(after?.status).toBe('PUBLISHED')
    expect(after?.publicationStatus).toBe('PUBLISHED')
  })

  it('double publish is idempotent with stable id', async () => {
    const svc = buildService()
    const item = (await contentRepo.findById('pcnt_1'))!
    const first = await svc.publishContent({
      item,
      publisher: makePublisher(),
      actorUserId: 'editor1',
    })
    const again = await contentRepo.findById('pcnt_1')
    const second = await svc.publishContent({
      item: again!,
      publisher: makePublisher(),
      actorUserId: 'editor1',
    })
    expect(second.alreadyPublished).toBe(true)
    expect(second.newsId).toBe(first.newsId)
    expect(firestoreDocs.size).toBe(1)
    expect(pgRows.size).toBe(1)
  })

  it('Firestore ok + PG fail → PARTIAL; retry heals same id', async () => {
    pgFail = true
    const svc = buildService()
    const item = (await contentRepo.findById('pcnt_1'))!
    const partial = await svc.publishContent({
      item,
      publisher: makePublisher(),
      actorUserId: 'editor1',
    })
    expect(partial.publicationStatus).toBe('PARTIAL')
    expect(partial.firestoreOk).toBe(true)
    expect(partial.postgresOk).toBe(false)
    expect(firestoreDocs.has('news_stable_1')).toBe(true)
    expect(pgRows.size).toBe(0)

    const mid = await contentRepo.findById('pcnt_1')
    expect(mid?.publicationStatus).toBe('PARTIAL')
    expect(mid?.publishedNewsId).toBe('news_stable_1')

    pgFail = false
    const healed = await svc.publishContent({
      item: mid!,
      publisher: makePublisher(),
      actorUserId: 'editor1',
    })
    expect(healed.publicationStatus).toBe('PUBLISHED')
    expect(healed.newsId).toBe('news_stable_1')
    expect(pgRows.has('news_stable_1')).toBe(true)
    expect(firestoreDocs.size).toBe(1)
  })

  it('PG ok + Firestore fail → PARTIAL; retry heals', async () => {
    firestoreFail = true
    const svc = buildService()
    const item = (await contentRepo.findById('pcnt_1'))!
    const partial = await svc.publishContent({
      item,
      publisher: makePublisher(),
      actorUserId: 'editor1',
    })
    expect(partial.publicationStatus).toBe('PARTIAL')
    expect(partial.firestoreOk).toBe(false)
    expect(partial.postgresOk).toBe(true)

    const mid = await contentRepo.findById('pcnt_1')
    firestoreFail = false
    const healed = await svc.publishContent({
      item: mid!,
      publisher: makePublisher(),
      actorUserId: 'editor1',
    })
    expect(healed.publicationStatus).toBe('PUBLISHED')
    expect(healed.newsId).toBe(mid!.publishedNewsId)
  })

  it('XSS-safe HTML from blocks', () => {
    const html = articleBlocksToSafeHtml([
      { id: '1', type: 'paragraph', text: 'Merhaba <script>alert(1)</script>' },
    ])
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})

describe('P7A AI safety', () => {
  it('publisher content/publish sources never import AI providers', async () => {
    const fs = await import('node:fs/promises')
    const paths = [
      'src/services/publisher/publisherContentPublish.ts',
      'src/services/publisher/publisherContentService.ts',
      'src/services/publisher/newsMirrorRepository.ts',
    ]
    for (const p of paths) {
      const text = await fs.readFile(p, 'utf8')
      expect(text).not.toMatch(/openai|deepseek|groq|gemini|@ai-sdk|anthropic/i)
    }
  })

  it('env.example keeps AI dispatch flags false', async () => {
    const fs = await import('node:fs/promises')
    const example = await fs.readFile('.env.example', 'utf8')
    expect(example).toMatch(/LEGACY_DIRECT_AI_ENABLED=false/)
    expect(example).toMatch(/CRAWLER_AI_DISPATCH_ENABLED=false/)
  })
})

describe('P7A SEO context', () => {
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
