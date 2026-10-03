import 'server-only'

import type { Post } from '@/types/post'
import type { ArticleSeoContext } from '@/lib/seo/articleSeoTypes'
import { hasDatabaseUrl } from '@/db'
import { isEventPagesEnabled } from '@/lib/seo/featureFlag'
import { eventPageService } from '@/services/seo/eventPageService'
import { publisherService } from '@/services/publisher/publisherService'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'
import { publisherRepository } from '@/services/publisher/publisherRepository'
import { unstable_cache } from 'next/cache'

/**
 * FinOps 3 Oct: every article render looked up its publisher (and event) in
 * Postgres (~27k lookups over two days), keeping Neon awake between crawler ticks.
 * Publishers and event titles change rarely; share the answer across renders.
 */
const resolvePublisherCached = unstable_cache(
  async (kind: 'slug' | 'id' | 'source', key: string): Promise<{ slug: string; name: string } | null> => {
    const pub =
      kind === 'slug'
        ? await publisherService.getPublicPublisherBySlug(key)
        : kind === 'id'
          ? await publisherRepository.findById(key)
          : await publisherRepository.findPublisherBySourceId(key)
    return pub ? { slug: pub.slug, name: pub.displayName } : null
  },
  ['article-seo-publisher-v1'],
  { revalidate: 6 * 60 * 60, tags: ['publisher-lookup'] }
)

const resolveEventCached = unstable_cache(
  async (key: string): Promise<{ slug: string; title: string; sourceCount: number } | null> => {
    const cluster = await eventPageService.getBySlug(key)
    return cluster
      ? { slug: cluster.slug, title: cluster.canonicalTitle, sourceCount: cluster.uniqueSourceCount }
      : null
  },
  ['article-seo-event-v1'],
  { revalidate: 30 * 60, tags: ['event-lookup'] }
)

export type { ArticleSeoContext }

export type ArticleSeoContextOpts = {
  publisherId?: string | null
  publisherSlug?: string | null
  /** Nullable cluster id — resolved via event page service (slug or id). */
  clusterId?: string | null
  /** Nullable crawler source id → publisher via publisher_sources. */
  sourceId?: string | null
  eventSlug?: string | null
}

/** Lightweight SEO context for article internal linking (no AI). */
export async function getArticleSeoContext(
  post: Post,
  opts?: ArticleSeoContextOpts
): Promise<ArticleSeoContext> {
  let publisher: ArticleSeoContext['publisher'] = null
  let event: ArticleSeoContext['event'] = null

  const postAny = post as Post & {
    publisherId?: string | null
    publisherSlug?: string | null
    clusterId?: string | null
    ingestionSourceId?: string | null
  }

  const publisherId = opts?.publisherId?.trim() || postAny.publisherId?.trim() || null
  const publisherSlug = opts?.publisherSlug?.trim() || postAny.publisherSlug?.trim() || null
  const clusterId = opts?.clusterId?.trim() || postAny.clusterId?.trim() || null
  const sourceId = opts?.sourceId?.trim() || postAny.ingestionSourceId?.trim() || null
  const eventSlug = opts?.eventSlug?.trim() || null

  if (isPublisherPlatformEnabled() && hasDatabaseUrl()) {
    try {
      if (publisherSlug) {
        publisher = await resolvePublisherCached('slug', publisherSlug)
      } else if (publisherId) {
        publisher = await resolvePublisherCached('id', publisherId)
      } else if (sourceId) {
        publisher = await resolvePublisherCached('source', sourceId)
      }
    } catch {
      // best-effort
    }
  }

  const eventKey = eventSlug || clusterId
  if (isEventPagesEnabled() && hasDatabaseUrl() && eventKey) {
    try {
      event = await resolveEventCached(eventKey)
    } catch {
      // best-effort
    }
  }

  return { publisher, event }
}
