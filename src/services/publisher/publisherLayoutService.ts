import { publisherLog } from '@/lib/publisher/observability'
import { roleHasPermission, type PublisherPermission } from '@/lib/publisher/authorization'
import type { PublisherMemberRecord, PublisherRecord } from '@/types/publisher'
import type {
  LayoutDraftPayload,
  LayoutItemSize,
  PublisherLayoutRecord,
  ResolvedPublisherLayout,
} from '@/types/publisherLayout'
import { PublisherLayoutRepository, publisherLayoutRepository } from './publisherLayoutRepository'
import { PublisherRepository, publisherRepository } from './publisherRepository'

export class PublisherStudioAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_MEMBER' = 'FORBIDDEN'
  ) {
    super(message)
    this.name = 'PublisherStudioAuthError'
  }
}

export async function requirePublisherMember(
  publisherId: string,
  userId: string,
  permission: PublisherPermission,
  repo: PublisherRepository = publisherRepository
): Promise<PublisherMemberRecord> {
  const member = await repo.findActiveMember(publisherId, userId)
  if (!member) throw new PublisherStudioAuthError('NOT_A_MEMBER', 'NOT_MEMBER')
  if (!roleHasPermission(member.role, permission)) {
    throw new PublisherStudioAuthError('INSUFFICIENT_PERMISSION', 'FORBIDDEN')
  }
  return member
}

export class PublisherLayoutService {
  constructor(
    private readonly layoutRepo: PublisherLayoutRepository = publisherLayoutRepository,
    private readonly publisherRepo: PublisherRepository = publisherRepository
  ) {}

  async getDraftLayout(publisherId: string, userId: string): Promise<ResolvedPublisherLayout> {
    await requirePublisherMember(publisherId, userId, 'layout:read', this.publisherRepo)
    const draft = await this.layoutRepo.ensureDraftLayout(publisherId, userId)
    return this.resolveLayout(draft, publisherId)
  }

  async getPublishedLayoutForPublic(publisherId: string): Promise<ResolvedPublisherLayout | null> {
    const published = await this.layoutRepo.findPublishedLayout(publisherId)
    if (!published) return null
    return this.resolveLayout(published, publisherId)
  }

  async saveDraft(
    publisherId: string,
    userId: string,
    payload: LayoutDraftPayload
  ): Promise<ResolvedPublisherLayout> {
    await requirePublisherMember(publisherId, userId, 'layout:edit', this.publisherRepo)
    const draft = await this.layoutRepo.ensureDraftLayout(publisherId, userId)
    const updated = await this.layoutRepo.saveDraftLayout(draft.id, publisherId, payload)
    publisherLog('publisher_layout_draft_saved', { publisherId, layoutId: updated.id, userId })
    return this.resolveLayout(updated, publisherId)
  }

  async publish(
    publisherId: string,
    userId: string,
    layoutId?: string
  ): Promise<{ published: PublisherLayoutRecord; draft: PublisherLayoutRecord | null }> {
    await requirePublisherMember(publisherId, userId, 'layout:edit', this.publisherRepo)
    const draft = layoutId
      ? await this.layoutRepo.findLayoutById(layoutId)
      : await this.layoutRepo.findDraftLayout(publisherId)
    if (!draft || draft.publisherId !== publisherId || draft.status !== 'DRAFT') {
      throw new Error('LAYOUT_NOT_PUBLISHABLE')
    }
    const published = await this.layoutRepo.publishLayoutAtomic(draft.id, publisherId)
    publisherLog('publisher_layout_published', {
      publisherId,
      layoutId: published.id,
      version: published.version,
      userId,
    })
    const newDraft = await this.layoutRepo.ensureDraftLayout(publisherId, userId)
    return { published, draft: newDraft }
  }

  async rollback(
    publisherId: string,
    userId: string,
    targetLayoutId: string
  ): Promise<ResolvedPublisherLayout> {
    await requirePublisherMember(publisherId, userId, 'layout:edit', this.publisherRepo)
    const draft = await this.layoutRepo.rollbackToVersion(publisherId, targetLayoutId, userId)
    publisherLog('publisher_layout_rollback', { publisherId, targetLayoutId, draftId: draft.id, userId })
    return this.resolveLayout(draft, publisherId)
  }

  async listVersionHistory(publisherId: string, userId: string): Promise<PublisherLayoutRecord[]> {
    await requirePublisherMember(publisherId, userId, 'layout:read', this.publisherRepo)
    const published = await this.layoutRepo.findPublishedLayout(publisherId)
    const archived = await this.layoutRepo.listArchivedLayouts(publisherId)
    const draft = await this.layoutRepo.findDraftLayout(publisherId)
    return [
      ...(draft ? [draft] : []),
      ...(published ? [published] : []),
      ...archived,
    ].sort((a, b) => b.version - a.version)
  }

  private async resolveLayout(
    layout: PublisherLayoutRecord,
    publisherId: string
  ): Promise<ResolvedPublisherLayout> {
    const sections = await this.layoutRepo.listSectionsForLayout(layout.id)
    const items = await this.layoutRepo.listItemsForLayout(layout.id)
    const sourceIds = await this.publisherRepo.getSourceIdsForPublisher(publisherId)

    const manualArticleIds = items
      .filter((i) => i.itemType === 'ARTICLE' && i.contentId)
      .map((i) => i.contentId!)
    const articlesById = await this.layoutRepo.resolveArticlesByIds(manualArticleIds, sourceIds)

    const usedAutoIds = new Set<string>()
    const resolvedSections = []

    for (const section of sections) {
      const sectionItems = items.filter((i) => i.sectionId === section.id)
      const resolvedItems = []

      for (const item of sectionItems) {
        if (item.itemType === 'ARTICLE' && item.contentId) {
          resolvedItems.push({
            ...item,
            article: articlesById.get(item.contentId) ?? null,
          })
        } else {
          resolvedItems.push({ ...item, article: null })
        }
      }

      if (section.contentMode === 'AUTO' && section.isVisible) {
        const autoArticles = await this.layoutRepo.resolveAutoLatestArticles(
          publisherId,
          sourceIds,
          {
            sort: section.autoConfig?.sort ?? 'newest',
            limit: section.autoConfig?.limit ?? 12,
          },
          usedAutoIds
        )
        for (const [index, article] of autoArticles.entries()) {
          usedAutoIds.add(article.id)
          resolvedItems.push({
            id: `auto_${section.id}_${article.id}`,
            layoutId: layout.id,
            sectionId: section.id,
            itemType: 'ARTICLE' as const,
            contentId: article.id,
            position: sectionItems.length + index,
            size: (index === 0 ? 'LEAD' : 'STANDARD') as LayoutItemSize,
            span: index === 0 ? 8 : 4,
            presentation: null,
            createdAt: layout.createdAt,
            updatedAt: layout.updatedAt,
            article,
          })
        }
      }

      resolvedSections.push({
        section,
        items: resolvedItems.sort((a, b) => a.position - b.position),
      })
    }

    return { layout, sections: resolvedSections }
  }
}

export class PublisherProfileService {
  constructor(private readonly repo: PublisherRepository = publisherRepository) {}

  async updateProfile(
    publisherId: string,
    userId: string,
    patch: {
      displayName?: string
      description?: string | null
      logoUrl?: string | null
      coverImageUrl?: string | null
      city?: string | null
      district?: string | null
      countryCode?: string | null
      websiteUrl?: string | null
      accentColorHex?: string | null
    }
  ): Promise<PublisherRecord> {
    await requirePublisherMember(publisherId, userId, 'profile:edit', this.repo)
    const updated = await this.repo.updatePublisherProfile(publisherId, patch)
    if (!updated) throw new Error('PUBLISHER_NOT_FOUND')
    publisherLog('publisher_profile_updated', { publisherId, userId })
    return updated
  }
}

export const publisherLayoutService = new PublisherLayoutService()
export const publisherProfileService = new PublisherProfileService()
