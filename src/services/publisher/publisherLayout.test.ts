/**
 * Phase P2 — publisher layout engine tests (in-memory, no live DB).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { roleHasPermission } from '@/lib/publisher/authorization'
import { normalizeLayoutItemSize, spanForSize } from '@/types/publisherLayout'
import {
  PublisherLayoutService,
  PublisherStudioAuthError,
  requirePublisherMember,
} from './publisherLayoutService'
import type { PublisherRepository } from './publisherRepository'
import type { PublisherLayoutRepository } from './publisherLayoutRepository'
import type {
  PublisherMemberRecord,
  PublisherRecord,
  PublisherSourceRecord,
} from '@/types/publisher'
import type {
  PublisherLayoutItemRecord,
  PublisherLayoutRecord,
  PublisherLayoutSectionRecord,
  ResolvedLayoutArticle,
} from '@/types/publisherLayout'
import { newPublisherId } from '@/lib/publisher/id'

class MemoryLayoutRepo implements Pick<
  PublisherLayoutRepository,
  | 'findLayoutById'
  | 'findDraftLayout'
  | 'findPublishedLayout'
  | 'listArchivedLayouts'
  | 'listSectionsForLayout'
  | 'listItemsForLayout'
  | 'ensureDraftLayout'
  | 'cloneLayoutAsDraft'
  | 'saveDraftLayout'
  | 'publishLayoutAtomic'
  | 'rollbackToVersion'
  | 'resolveArticlesByIds'
  | 'resolveAutoLatestArticles'
> {
  layouts: PublisherLayoutRecord[] = []
  sections: PublisherLayoutSectionRecord[] = []
  items: PublisherLayoutItemRecord[] = []
  articles = new Map<string, ResolvedLayoutArticle>()
  autoArticles: ResolvedLayoutArticle[] = []

  async findLayoutById(id: string) {
    return this.layouts.find((l) => l.id === id) ?? null
  }

  async findDraftLayout(publisherId: string) {
    return this.layouts.find((l) => l.publisherId === publisherId && l.status === 'DRAFT') ?? null
  }

  async findPublishedLayout(publisherId: string) {
    return this.layouts.find((l) => l.publisherId === publisherId && l.status === 'PUBLISHED') ?? null
  }

  async listArchivedLayouts(publisherId: string, limit = 10) {
    return this.layouts
      .filter((l) => l.publisherId === publisherId && l.status === 'ARCHIVED')
      .sort((a, b) => b.version - a.version)
      .slice(0, limit)
  }

  async listSectionsForLayout(layoutId: string) {
    return this.sections.filter((s) => s.layoutId === layoutId).sort((a, b) => a.position - b.position)
  }

  async listItemsForLayout(layoutId: string) {
    return this.items.filter((i) => i.layoutId === layoutId).sort((a, b) => a.position - b.position)
  }

  async ensureDraftLayout(publisherId: string, createdBy: string | null) {
    const existing = await this.findDraftLayout(publisherId)
    if (existing) return existing
    const now = new Date()
    const layout: PublisherLayoutRecord = {
      id: newPublisherId('playout'),
      publisherId,
      name: 'Ana Sayfa',
      status: 'DRAFT',
      themeKey: 'MODERN',
      version: 1,
      createdBy,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    }
    this.layouts.push(layout)
    this.sections.push({
      id: newPublisherId('psec'),
      layoutId: layout.id,
      title: 'Son Haberler',
      slug: 'son-haberler',
      sectionType: 'LATEST',
      position: 0,
      displayStyle: 'GRID',
      isVisible: true,
      contentMode: 'AUTO',
      autoConfig: { sort: 'newest', limit: 12 },
      createdAt: now,
      updatedAt: now,
    })
    return layout
  }

  async cloneLayoutAsDraft(source: PublisherLayoutRecord, createdBy: string | null) {
    const now = new Date()
    const draft: PublisherLayoutRecord = {
      ...source,
      id: newPublisherId('playout'),
      status: 'DRAFT',
      version: source.version + 1,
      createdBy,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    }
    this.layouts.push(draft)
    const sectionMap = new Map<string, string>()
    for (const s of this.sections.filter((x) => x.layoutId === source.id)) {
      const id = newPublisherId('psec')
      sectionMap.set(s.id, id)
      this.sections.push({ ...s, id, layoutId: draft.id, createdAt: now, updatedAt: now })
    }
    for (const i of this.items.filter((x) => x.layoutId === source.id)) {
      const sectionId = sectionMap.get(i.sectionId)
      if (!sectionId) continue
      this.items.push({ ...i, id: newPublisherId('pitem'), layoutId: draft.id, sectionId, createdAt: now, updatedAt: now })
    }
    return draft
  }

  async saveDraftLayout(layoutId: string, publisherId: string, payload: { sections?: Array<Record<string, unknown>>; name?: string; themeKey?: string }) {
    const layout = this.layouts.find((l) => l.id === layoutId)
    if (!layout || layout.publisherId !== publisherId || layout.status !== 'DRAFT') {
      throw new Error('LAYOUT_NOT_EDITABLE')
    }
    if (payload.name) layout.name = payload.name
    if (payload.themeKey) layout.themeKey = payload.themeKey as PublisherLayoutRecord['themeKey']
    if (payload.sections) {
      this.items = this.items.filter((i) => i.layoutId !== layoutId)
      this.sections = this.sections.filter((s) => s.layoutId !== layoutId)
      const now = new Date()
      const seenArticles = new Set<string>()
      for (const [index, sectionInput] of payload.sections.entries()) {
        const sectionId = newPublisherId('psec')
        this.sections.push({
          id: sectionId,
          layoutId,
          title: String(sectionInput.title ?? 'Bölüm'),
          slug: String(sectionInput.slug ?? `section-${index}`),
          sectionType: (sectionInput.sectionType as PublisherLayoutSectionRecord['sectionType']) ?? 'CUSTOM',
          position: Number(sectionInput.position ?? index),
          displayStyle: String(sectionInput.displayStyle ?? 'GRID'),
          isVisible: sectionInput.isVisible !== false,
          contentMode: (sectionInput.contentMode as PublisherLayoutSectionRecord['contentMode']) ?? 'MANUAL',
          autoConfig: (sectionInput.autoConfig as PublisherLayoutSectionRecord['autoConfig']) ?? null,
          createdAt: now,
          updatedAt: now,
        })
        for (const [itemIndex, itemInput] of ((sectionInput.items as Array<Record<string, unknown>>) ?? []).entries()) {
          const contentId = typeof itemInput.contentId === 'string' ? itemInput.contentId : null
          if (contentId) {
            if (seenArticles.has(contentId)) continue
            seenArticles.add(contentId)
          }
          const size = normalizeLayoutItemSize(typeof itemInput.size === 'string' ? itemInput.size : undefined)
          this.items.push({
            id: newPublisherId('pitem'),
            layoutId,
            sectionId,
            itemType: 'ARTICLE',
            contentId,
            position: Number(itemInput.position ?? itemIndex),
            size,
            span: spanForSize(size),
            presentation: null,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }
    layout.updatedAt = new Date()
    return layout
  }

  async publishLayoutAtomic(layoutId: string, publisherId: string) {
    const draft = this.layouts.find((l) => l.id === layoutId)
    if (!draft || draft.publisherId !== publisherId || draft.status !== 'DRAFT') {
      throw new Error('LAYOUT_NOT_PUBLISHABLE')
    }
    const published = this.layouts.find((l) => l.publisherId === publisherId && l.status === 'PUBLISHED')
    if (published) published.status = 'ARCHIVED'
    draft.status = 'PUBLISHED'
    draft.publishedAt = new Date()
    return draft
  }

  async rollbackToVersion(publisherId: string, targetLayoutId: string, createdBy: string | null) {
    const target = this.layouts.find((l) => l.id === targetLayoutId)
    if (!target || target.publisherId !== publisherId || target.status !== 'ARCHIVED') {
      throw new Error('LAYOUT_ROLLBACK_INVALID')
    }
    const draft = await this.ensureDraftLayout(publisherId, createdBy)
    await this.saveDraftLayout(draft.id, publisherId, {
      name: target.name,
      themeKey: target.themeKey,
      sections: (await this.listSectionsForLayout(target.id)).map((section) => ({
        title: section.title,
        slug: section.slug,
        sectionType: section.sectionType,
        position: section.position,
        displayStyle: section.displayStyle,
        isVisible: section.isVisible,
        contentMode: section.contentMode,
        autoConfig: section.autoConfig,
        items: this.items
          .filter((i) => i.sectionId === section.id)
          .map((item) => ({
            contentId: item.contentId,
            position: item.position,
            size: item.size,
            span: item.span,
          })),
      })),
    })
    return (await this.findDraftLayout(publisherId))!
  }

  async resolveArticlesByIds(ids: string[]) {
    const out = new Map<string, ResolvedLayoutArticle>()
    for (const id of ids) {
      out.set(id, this.articles.get(id) ?? {
        id,
        slug: '',
        title: 'Silinmiş haber',
        summary: null,
        thumbnailUrl: null,
        categorySlug: null,
        categoryName: null,
        publishedAt: null,
        missing: true,
      })
    }
    return out
  }

  async resolveAutoLatestArticles(
    _publisherId: string,
    _sourceIds: string[],
    _config: { sort?: 'newest' | 'oldest'; limit?: number },
    excludeIds: Set<string> = new Set()
  ) {
    return this.autoArticles.filter((a) => !excludeIds.has(a.id))
  }
}

class MemoryPublisherRepo implements Pick<
  PublisherRepository,
  'findActiveMember' | 'getSourceIdsForPublisher'
> {
  members: PublisherMemberRecord[] = []
  sources: PublisherSourceRecord[] = []

  async findActiveMember(publisherId: string, userId: string) {
    return (
      this.members.find(
        (m) => m.publisherId === publisherId && m.userId === userId && m.status === 'ACTIVE'
      ) ?? null
    )
  }

  async getSourceIdsForPublisher(publisherId: string) {
    return this.sources.filter((s) => s.publisherId === publisherId).map((s) => s.sourceId)
  }
}

function seedPublisher(): PublisherRecord {
  const now = new Date()
  return {
    id: 'pub_test',
    name: 'Test',
    slug: 'test',
    displayName: 'Test Publisher',
    publisherType: 'NEWS_ORGANIZATION',
    status: 'ACTIVE',
    description: null,
    logoUrl: null,
    coverImageUrl: null,
    websiteUrl: null,
    primaryDomain: 'test.com',
    countryCode: 'TR',
    city: 'İstanbul',
    district: null,
    verificationStatus: 'VERIFIED',
    claimedAt: now,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

function seedMember(role: PublisherMemberRecord['role'], userId = 'user_editor'): PublisherMemberRecord {
  const now = new Date()
  return {
    id: newPublisherId('pmem'),
    publisherId: 'pub_test',
    userId,
    role,
    status: 'ACTIVE',
    invitedAt: null,
    acceptedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

describe('Phase P2 authorization', () => {
  it('EDITOR can edit layout, ANALYST and AD_MANAGER cannot', () => {
    expect(roleHasPermission('EDITOR', 'layout:edit')).toBe(true)
    expect(roleHasPermission('ANALYST', 'layout:edit')).toBe(false)
    expect(roleHasPermission('AD_MANAGER', 'layout:edit')).toBe(false)
  })

  it('blocks cross-publisher member lookup', async () => {
    const repo = new MemoryPublisherRepo()
    repo.members.push(seedMember('EDITOR', 'user_a'))
    await expect(requirePublisherMember('pub_other', 'user_a', 'layout:edit', repo as never)).rejects.toBeInstanceOf(
      PublisherStudioAuthError
    )
  })
})

describe('Phase P2 layout service', () => {
  let layoutRepo: MemoryLayoutRepo
  let publisherRepo: MemoryPublisherRepo
  let service: PublisherLayoutService

  beforeEach(() => {
    layoutRepo = new MemoryLayoutRepo()
    publisherRepo = new MemoryPublisherRepo()
    publisherRepo.members.push(seedMember('EDITOR'))
    publisherRepo.sources.push({
      id: newPublisherId('psrc'),
      publisherId: 'pub_test',
      sourceId: 'src_1',
      relationshipType: 'PRIMARY',
      isPrimary: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    layoutRepo.autoArticles = [
      {
        id: 'news_1',
        slug: 'haber-1',
        title: 'Haber 1',
        summary: 'Özet',
        thumbnailUrl: null,
        categorySlug: 'gundem',
        categoryName: 'Gündem',
        publishedAt: new Date(),
      },
    ]
    service = new PublisherLayoutService(layoutRepo as never, publisherRepo as never)
  })

  it('published layout resolves, draft not returned for public', async () => {
    const draft = await layoutRepo.ensureDraftLayout('pub_test', 'user_editor')
    await service.publish('pub_test', 'user_editor', draft.id)
    const published = await service.getPublishedLayoutForPublic('pub_test')
    expect(published?.layout.status).toBe('PUBLISHED')
    const stillDraft = await layoutRepo.findDraftLayout('pub_test')
    expect(stillDraft).toBeTruthy()
    expect(stillDraft?.status).toBe('DRAFT')
  })

  it('publish is atomic and archives previous published', async () => {
    const draft1 = await layoutRepo.ensureDraftLayout('pub_test', 'user_editor')
    await service.publish('pub_test', 'user_editor', draft1.id)
    const draft2 = await layoutRepo.ensureDraftLayout('pub_test', 'user_editor')
    await service.publish('pub_test', 'user_editor', draft2.id)
    const archived = await layoutRepo.listArchivedLayouts('pub_test')
    expect(archived).toHaveLength(1)
    expect(await layoutRepo.findPublishedLayout('pub_test')).toMatchObject({ id: draft2.id })
  })

  it('blocks duplicate article in same layout draft save', async () => {
    const draft = await layoutRepo.ensureDraftLayout('pub_test', 'user_editor')
    await layoutRepo.saveDraftLayout(draft.id, 'pub_test', {
      sections: [
        {
          title: 'Manuel',
          position: 0,
          contentMode: 'MANUAL',
          items: [
            { contentId: 'news_a', position: 0, size: 'STANDARD' },
            { contentId: 'news_a', position: 1, size: 'COMPACT' },
          ],
        },
      ],
    })
    const items = await layoutRepo.listItemsForLayout(draft.id)
    expect(items.filter((i) => i.contentId === 'news_a')).toHaveLength(1)
  })

  it('auto LATEST resolves publisher articles only via repo hook', async () => {
    const draft = await layoutRepo.ensureDraftLayout('pub_test', 'user_editor')
    const resolved = await service.getDraftLayout('pub_test', 'user_editor')
    const autoSection = resolved.sections.find((s) => s.section.contentMode === 'AUTO')
    expect(autoSection?.items.some((i) => i.article?.id === 'news_1')).toBe(true)
    expect(resolved.layout.id).toBe(draft.id)
  })

  it('deleted article resolves gracefully', async () => {
    const draft = await layoutRepo.ensureDraftLayout('pub_test', 'user_editor')
    await layoutRepo.saveDraftLayout(draft.id, 'pub_test', {
      sections: [
        {
          title: 'Manuel',
          position: 0,
          contentMode: 'MANUAL',
          items: [{ contentId: 'missing_news', position: 0, size: 'STANDARD' }],
        },
      ],
    })
    const resolved = await service.getDraftLayout('pub_test', 'user_editor')
    const item = resolved.sections[0]?.items[0]
    expect(item?.article?.missing).toBe(true)
  })

  it('semantic size validation uses span map', () => {
    expect(spanForSize(normalizeLayoutItemSize('HERO'))).toBe(12)
    expect(spanForSize(normalizeLayoutItemSize('invalid'))).toBe(4)
  })

  it('rollback restores archived version into draft', async () => {
    const draft = await layoutRepo.ensureDraftLayout('pub_test', 'user_editor')
    await layoutRepo.saveDraftLayout(draft.id, 'pub_test', {
      name: 'v1',
      sections: [{ title: 'A', position: 0, contentMode: 'MANUAL', items: [] }],
    })
    await service.publish('pub_test', 'user_editor', draft.id)
    const archived = (await layoutRepo.listArchivedLayouts('pub_test'))[0]
    expect(archived).toBeUndefined()
    const draft2 = await layoutRepo.ensureDraftLayout('pub_test', 'user_editor')
    await layoutRepo.saveDraftLayout(draft2.id, 'pub_test', {
      name: 'v2',
      sections: [{ title: 'B', position: 0, contentMode: 'MANUAL', items: [] }],
    })
    await service.publish('pub_test', 'user_editor', draft2.id)
    const archivedNow = await layoutRepo.listArchivedLayouts('pub_test')
    expect(archivedNow[0]?.name).toBe('v1')
    const rolled = await service.rollback('pub_test', 'user_editor', archivedNow[0]!.id)
    expect(rolled.sections[0]?.section.title).toBe('A')
  })

  it('public fallback when no published layout', async () => {
    await layoutRepo.ensureDraftLayout('pub_test', 'user_editor')
    const published = await service.getPublishedLayoutForPublic('pub_test')
    expect(published).toBeNull()
  })
})

describe('Phase P2 publisher record seed', () => {
  it('seed publisher helper is stable', () => {
    expect(seedPublisher().slug).toBe('test')
  })
})
