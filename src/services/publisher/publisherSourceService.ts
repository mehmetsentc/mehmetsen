import { PublisherRepository, publisherRepository } from './publisherRepository'
import type { PublisherSourceRecord } from '@/types/publisher'

export class PublisherSourceService {
  constructor(private readonly repo: PublisherRepository = publisherRepository) {}

  async linkSourceToPublisher(input: {
    publisherId: string
    sourceId: string
    relationshipType?: PublisherSourceRecord['relationshipType']
    isPrimary?: boolean
  }): Promise<PublisherSourceRecord> {
    const existing = await this.repo.findSourceLinkBySourceId(input.sourceId)
    if (existing) return existing
    return this.repo.insertPublisherSource(input)
  }

  async bootstrapPublisherFromSource(source: {
    id: string
    name: string
    domain: string
    baseUrl: string
    countryCode?: string | null
    city?: string | null
    district?: string | null
  }): Promise<{ publisherId: string; action: 'created' | 'matched' | 'skipped'; slug?: string }> {
    const linked = await this.repo.findSourceLinkBySourceId(source.id)
    if (linked) {
      return { publisherId: linked.publisherId, action: 'skipped' }
    }

    const { normalizeDomain } = await import('@/lib/publisher/domain')
    const { resolveUniquePublisherSlug } = await import('@/lib/publisher/slug')
    const domain = normalizeDomain(source.domain || source.baseUrl)

    const byDomain = domain ? await this.repo.findByPrimaryDomain(domain) : null
    if (byDomain) {
      await this.repo.insertPublisherSource({
        publisherId: byDomain.id,
        sourceId: source.id,
        isPrimary: false,
      })
      return { publisherId: byDomain.id, action: 'matched', slug: byDomain.slug }
    }

    const { slug } = await resolveUniquePublisherSlug(source.name, (s) => this.repo.slugExists(s))
    const publisher = await this.repo.insertPublisher({
      name: source.name,
      slug,
      displayName: source.name,
      websiteUrl: source.baseUrl,
      primaryDomain: domain || null,
      countryCode: source.countryCode ?? 'TR',
      city: source.city ?? null,
      district: source.district ?? null,
      status: 'UNCLAIMED',
      verificationStatus: 'UNCLAIMED',
    })
    await this.repo.insertPublisherSource({
      publisherId: publisher.id,
      sourceId: source.id,
      isPrimary: true,
    })
    return { publisherId: publisher.id, action: 'created', slug: publisher.slug }
  }
}

export const publisherSourceService = new PublisherSourceService()
