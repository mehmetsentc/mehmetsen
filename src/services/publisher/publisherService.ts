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
    return this.repo.resolvePublishedArticles(sourceIds, limit, cursor)
  }

  /** @deprecated use getPublisherArticles which returns a page */
  async getPublisherArticlesList(publisherId: string, limit = 24): Promise<PublisherArticleItem[]> {
    const page = await this.getPublisherArticles(publisherId, limit)
    return page.items
  }
}

export const publisherService = new PublisherService()
