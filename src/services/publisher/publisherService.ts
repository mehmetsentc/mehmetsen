import { PublisherRepository, publisherRepository } from './publisherRepository'
import type {
  PublicPublisherRecord,
  PublisherArticleItem,
  PublisherArticlePage,
  PublisherRecord,
  PublisherSourceRecord,
} from '@/types/publisher'
import { isPublisherPubliclyVisible, serializePublicPublisher } from '@/lib/publisher/public'

export class PublisherService {
  constructor(private readonly repo: PublisherRepository = publisherRepository) {}

  async getPublisherBySlug(slug: string): Promise<PublisherRecord | null> {
    return this.repo.findBySlug(slug.trim().toLowerCase())
  }

  async getPublicPublisherBySlug(slug: string): Promise<PublicPublisherRecord | null> {
    const publisher = await this.getPublisherBySlug(slug)
    if (!publisher || !isPublisherPubliclyVisible(publisher)) return null
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
    limit = 24,
    cursor?: string | null
  ): Promise<PublisherArticlePage> {
    const sourceIds = await this.repo.getSourceIdsForPublisher(publisherId)
    const page = await this.repo.resolvePublishedArticles(sourceIds, limit, cursor)
    const studio = await this.repo.resolveStudioPublishedArticles(publisherId, limit)
    if (!studio.length) return page

    const seen = new Set(page.items.map((i) => i.id))
    const merged = [...page.items]
    for (const item of studio) {
      if (seen.has(item.id)) continue
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
