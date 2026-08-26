import 'server-only'

import type { Post } from '@/types/post'
import { hasDatabaseUrl } from '@/db'
import { isEventPagesEnabled } from '@/lib/seo/featureFlag'
import { eventPageService } from '@/services/seo/eventPageService'
import { publisherService } from '@/services/publisher/publisherService'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'

export interface ArticleSeoContext {
  publisher: { slug: string; name: string } | null
  event: { slug: string; title: string; sourceCount: number } | null
}

/** Lightweight SEO context for article internal linking (no AI). */
export async function getArticleSeoContext(
  post: Post,
  opts?: { publisherSlug?: string | null; clusterId?: string | null }
): Promise<ArticleSeoContext> {
  let publisher: ArticleSeoContext['publisher'] = null
  let event: ArticleSeoContext['event'] = null

  const publisherSlug = opts?.publisherSlug?.trim()
  if (isPublisherPlatformEnabled() && hasDatabaseUrl() && publisherSlug) {
    try {
      const pub = await publisherService.getPublicPublisherBySlug(publisherSlug)
      if (pub) publisher = { slug: pub.slug, name: pub.displayName }
    } catch {
      // best-effort
    }
  }

  const clusterId = opts?.clusterId?.trim()
  if (isEventPagesEnabled() && hasDatabaseUrl() && clusterId) {
    try {
      const cluster = await eventPageService.getBySlug(clusterId)
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
