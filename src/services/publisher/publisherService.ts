import { PublisherRepository, publisherRepository } from './publisherRepository'
import type {
  PublicPublisherRecord,
  PublisherArticleItem,
  PublisherArticlePage,
  PublisherRecord,
  PublisherSourceRecord,
} from '@/types/publisher'
import {
  isInternalTestPublisher,
  isPublisherPubliclyVisible,
  serializePublicPublisher,
} from '@/lib/publisher/public'

export class PublisherService {
  constructor(private readonly repo: PublisherRepository = publisherRepository) {}

  async getPublisherBySlug(slug: string): Promise<PublisherRecord | null> {
    return this.repo.findBySlug(slug.trim().toLowerCase())
  }

  async getPublicPublisherBySlug(slug: string): Promise<PublicPublisherRecord | null> {
    const publisher = await this.getPublisherBySlug(slug)
    if (!publisher) return null
    // INTERNAL_TEST: direct URL may render (noindex) for pilot/ad smoke, but never discoverable.
    if (!isPublisherPubliclyVisible(publisher) && !isInternalTestPublisher(publisher)) return null
    if (publisher.status === 'SUSPENDED' || publisher.status === 'INACTIVE') return null
    return serializePublicPublisher(publisher)
  }

  async getPublisherById(id: string): Promise<PublisherRecord | null> {
    return this.repo.findById(id)
  }

  async getPublisherSources(
    publisherId: string
  ): Promise<Array<PublisherSourceRecord & { sourceName: string; sourceDomain: string }>> {
    return this.repo.listSourcesForPublisher(publisherId)
  }

  async getPublisherArticles(
    publisherId: string,
    limit = 30,
    cursor?: string | null,
    opts?: { categoryId?: string | null }
  ): Promise<PublisherArticlePage> {
    const sourceIds = await this.repo.getSourceIdsForPublisher(publisherId)
    const page = await this.repo.resolvePublishedArticles(sourceIds, limit, cursor)
    // Category filter applied client-side for first page; FS path supports category via opts in service layer
    let items = page.items
    if (opts?.categoryId && opts.categoryId !== 'all') {
      const cat = opts.categoryId.trim().toLowerCase()
      items = items.filter((i) => (i.categoryId || 'gundem') === cat)
    }
    const studio = cursor ? [] : await this.repo.resolveStudioPublishedArticles(publisherId, limit)
    if (!studio.length) return { items, nextCursor: page.nextCursor }

    const seen = new Set(items.map((i) => i.id))
    const merged = [...items]
    for (const item of studio) {
      if (seen.has(item.id)) continue
      if (opts?.categoryId && opts.categoryId !== 'all') {
        const cat = opts.categoryId.trim().toLowerCase()
        if ((item.categoryId || 'gundem') !== cat) continue
      }
      seen.add(item.id)
      merged.push(item)
    }
    merged.sort((a, b) => {
      const am = a.publishedAt?.getTime() ?? 0
      const bm = b.publishedAt?.getTime() ?? 0
      return bm - am
    })
    return {
      items: merged.slice(0, Math.min(Math.max(limit, 1), 48)),
      nextCursor: page.nextCursor,
    }
  }

  async countPublisherPublicArticles(publisherId: string): Promise<number> {
    const sourceIds = await this.repo.getSourceIdsForPublisher(publisherId)
    return this.repo.countPublisherPublicArticles(publisherId, sourceIds)
  }

  /** @deprecated use getPublisherArticles which returns a page */
  async getPublisherArticlesList(publisherId: string, limit = 24): Promise<PublisherArticleItem[]> {
    const page = await this.getPublisherArticles(publisherId, limit)
    return page.items
  }

  async listPublicPublishers(limit = 500): Promise<PublicPublisherRecord[]> {
    const { items } = await this.repo.listPublishers({ filter: 'all', limit, offset: 0 })
    return items
      .filter((p) => p.status === 'ACTIVE' && isPublisherPubliclyVisible(p))
      .map((p) => serializePublicPublisher(p))
  }
}

export const publisherService = new PublisherService()
