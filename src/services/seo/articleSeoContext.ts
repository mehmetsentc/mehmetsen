import 'server-only'

import type { Post } from '@/types/post'
import type { ArticleSeoContext } from '@/lib/seo/articleSeoTypes'
import { hasDatabaseUrl } from '@/db'
import { isEventPagesEnabled } from '@/lib/seo/featureFlag'
import { eventPageService } from '@/services/seo/eventPageService'
import { publisherService } from '@/services/publisher/publisherService'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'

export type { ArticleSeoContext }

/** Lightweight SEO context for article internal linking (no AI). */
export async function getArticleSeoContext(
  post: Post,
  opts?: { publisherSlug?: string | null; clusterId?: string | null; eventSlug?: string | null }
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

  const eventSlug = opts?.eventSlug?.trim() || opts?.clusterId?.trim()
  if (isEventPagesEnabled() && hasDatabaseUrl() && eventSlug) {
    try {
      const cluster = await eventPageService.getBySlug(eventSlug)
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

  // post unused today — kept for future publisher/cluster fields on Post without N+1
  void post

  return { publisher, event }
}
