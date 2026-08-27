import 'server-only'

import type { Post } from '@/types/post'
import type { ArticleSeoContext } from '@/lib/seo/articleSeoTypes'
import { hasDatabaseUrl } from '@/db'
import { isEventPagesEnabled } from '@/lib/seo/featureFlag'
import { eventPageService } from '@/services/seo/eventPageService'
import { publisherService } from '@/services/publisher/publisherService'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'
import { publisherRepository } from '@/services/publisher/publisherRepository'

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
        const pub = await publisherService.getPublicPublisherBySlug(publisherSlug)
        if (pub) publisher = { slug: pub.slug, name: pub.displayName }
      } else if (publisherId) {
        const pub = await publisherRepository.findById(publisherId)
        if (pub) publisher = { slug: pub.slug, name: pub.displayName }
      } else if (sourceId) {
        const pub = await publisherRepository.findPublisherBySourceId(sourceId)
        if (pub) publisher = { slug: pub.slug, name: pub.displayName }
      }
    } catch {
      // best-effort
    }
  }

  const eventKey = eventSlug || clusterId
  if (isEventPagesEnabled() && hasDatabaseUrl() && eventKey) {
    try {
      const cluster = await eventPageService.getBySlug(eventKey)
      if (cluster) {
        event = {
          slug: cluster.slug,
          title: cluster.canonicalTitle,
          sourceCount: cluster.uniqueSourceCount,
        }
      }
    } catch {
      // best-effort
    }
  }

  return { publisher, event }
}
