import { publisherLog } from '@/lib/publisher/observability'
import { apexDomain, isSubdomainOf, normalizeDomain } from '@/lib/publisher/domain'
import { resolveUniquePublisherSlug } from '@/lib/publisher/slug'
import { PublisherRepository, publisherRepository } from './publisherRepository'
import type { BootstrapPublisherAction, BootstrapPublisherResult } from '@/types/publisher'

export async function bootstrapPublishersFromNewsSources(opts: {
  dryRun?: boolean
  limit?: number
  sourceIds?: string[]
  repo?: PublisherRepository
}): Promise<BootstrapPublisherResult> {
  const repo = opts.repo ?? publisherRepository
  const dryRun = opts.dryRun ?? false
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 500)

  const sources = await repo.listNewsSources(limit, 0, opts.sourceIds)
  const result: BootstrapPublisherResult = {
    dryRun,
    processed: 0,
    created: 0,
    matched: 0,
    collisions: 0,
    skipped: 0,
    ambiguous: 0,
    errors: 0,
    details: [],
  }

  for (const source of sources) {
    result.processed++
    const normalizedDomain = normalizeDomain(source.domain || source.baseUrl)

    try {
      const existingLink = await repo.findSourceLinkBySourceId(source.id)
      if (existingLink) {
        result.skipped++
        result.details.push({
          sourceId: source.id,
          sourceName: source.name,
          normalizedDomain,
          action: 'SKIP_ALREADY_LINKED',
          publisherId: existingLink.publisherId,
        })
        continue
      }

      const byDomain = normalizedDomain ? await repo.findByPrimaryDomain(normalizedDomain) : null

      if (byDomain) {
        if (!dryRun) {
          await repo.insertPublisherSource({
            publisherId: byDomain.id,
            sourceId: source.id,
            isPrimary: false,
          })
        }
        result.matched++
        publisherLog('publisher_bootstrap_matched', {
          sourceId: source.id,
          publisherId: byDomain.id,
          domain: normalizedDomain,
          dryRun,
        })
        result.details.push({
          sourceId: source.id,
          sourceName: source.name,
          normalizedDomain,
          action: 'LINK_EXISTING',
          publisherId: byDomain.id,
          slug: byDomain.slug,
        })
        continue
      }

      if (normalizedDomain) {
        const apex = apexDomain(normalizedDomain)
        const apexPublisher =
          apex !== normalizedDomain ? await repo.findByPrimaryDomain(apex) : null
        const subdomainParent = await repo.findPublisherBySubdomainParent(normalizedDomain)
        if (
          (apexPublisher && isSubdomainOf(normalizedDomain, apex)) ||
          (subdomainParent && isSubdomainOf(normalizedDomain, subdomainParent.primaryDomain ?? ''))
        ) {
          result.ambiguous++
          publisherLog('publisher_bootstrap_ambiguous', {
            sourceId: source.id,
            domain: normalizedDomain,
            dryRun,
          })
          result.details.push({
            sourceId: source.id,
            sourceName: source.name,
            normalizedDomain,
            action: 'DOMAIN_AMBIGUOUS',
            message: 'Subdomain source requires manual publisher linking',
          })
          continue
        }
      }

      const { slug, collision } = await resolveUniquePublisherSlug(source.name, (s) =>
        repo.slugExists(s)
      )
      if (collision) {
        result.collisions++
        publisherLog('publisher_bootstrap_collision', { sourceId: source.id, slug, dryRun })
      }

      if (dryRun) {
        result.created++
        result.details.push({
          sourceId: source.id,
          sourceName: source.name,
          normalizedDomain,
          action: collision ? 'SLUG_COLLISION' : 'CREATE_PUBLISHER',
          slug,
        })
        continue
      }

      const publisher = await repo.insertPublisher({
        name: source.name,
        slug,
        displayName: source.name,
        websiteUrl: source.baseUrl,
        primaryDomain: normalizedDomain || null,
        countryCode: source.countryCode,
        city: source.city,
        district: source.district,
        status: 'UNCLAIMED',
        verificationStatus: 'UNCLAIMED',
      })
      await repo.insertPublisherSource({
        publisherId: publisher.id,
        sourceId: source.id,
        isPrimary: true,
      })
      result.created++
      publisherLog('publisher_bootstrap_created', {
        sourceId: source.id,
        publisherId: publisher.id,
        slug: publisher.slug,
        domain: normalizedDomain,
      })
      result.details.push({
        sourceId: source.id,
        sourceName: source.name,
        normalizedDomain,
        action: collision ? 'SLUG_COLLISION' : 'CREATE_PUBLISHER',
        publisherId: publisher.id,
        slug: publisher.slug,
      })
    } catch (err) {
      result.errors++
      publisherLog('publisher_bootstrap_error', {
        sourceId: source.id,
        dryRun,
      })
      result.details.push({
        sourceId: source.id,
        sourceName: source.name,
        normalizedDomain,
        action: 'ERROR',
        message: err instanceof Error ? err.message.slice(0, 200) : 'Unknown error',
      })
    }
  }

  return result
}