import 'server-only'

import type { MetadataRoute } from 'next'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { ROUTES } from '@/constants/routes'
import { tagToSlug } from '@/lib/tags'
import { hasDatabaseUrl } from '@/db'
import { publisherService } from '@/services/publisher/publisherService'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'
import { isEventPagesEnabled } from '@/lib/seo/featureFlag'
import { evaluatePublisherSeo, evaluateTopicSeo } from '@/lib/seo/seoEligibility'
import { recordSitemapGeneration, recordSitemapError } from '@/lib/seo/observability'
import { urlsetXml } from '@/lib/sitemap/seoXml'

export { urlsetXml } from '@/lib/sitemap/seoXml'
export {
  buildCitiesSitemap,
  buildDistrictsSitemap,
  buildCategoriesSitemap,
} from '@/lib/sitemap/entitySitemaps'
export { buildSitemapIndexXmlAsync } from '@/lib/sitemap/sitemapIndex'

export const SITEMAP_CHUNK_LIMIT = 50_000

export async function buildPublishersSitemap(base: string): Promise<string> {
  if (!isPublisherPlatformEnabled() || !hasDatabaseUrl()) {
    return urlsetXml([])
  }
  try {
    const publishers = await publisherService.listPublicPublishers(2000)
    const entries: MetadataRoute.Sitemap = publishers
      .filter((p) => evaluatePublisherSeo(p).indexable)
      .map((p) => ({
        url: `${base}${ROUTES.PUBLISHER(p.slug)}`,
        lastModified: new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.6,
      }))
    recordSitemapGeneration('publishers', entries.length)
    return urlsetXml(entries.slice(0, SITEMAP_CHUNK_LIMIT))
  } catch (err) {
    recordSitemapError('publishers', err instanceof Error ? err.message : 'unknown')
    return urlsetXml([])
  }
}

export async function buildTopicsSitemap(base: string): Promise<string> {
  try {
    const { getCanonicalPublishedNewsForSitemap } = await import('@/lib/canonical/canonicalEligibility')
    const rows = await getCanonicalPublishedNewsForSitemap({ limit: 500 })

    const tagCounts = new Map<string, number>()
    const tagLastMod = new Map<string, Date>()

    for (const d of rows) {
      const ts = d.publishedAt ?? new Date()
      for (const tag of d.tags ?? []) {
        const slug = tagToSlug(tag)
        if (!slug) continue
        tagCounts.set(slug, (tagCounts.get(slug) ?? 0) + 1)
        const prev = tagLastMod.get(slug)
        if (!prev || ts > prev) tagLastMod.set(slug, ts)
      }
    }

    const entries: MetadataRoute.Sitemap = []
    for (const [slug, count] of tagCounts) {
      if (!evaluateTopicSeo(slug, count).indexable) continue
      entries.push({
        url: `${base}${ROUTES.TAG(slug)}`,
        lastModified: tagLastMod.get(slug),
        changeFrequency: 'daily',
        priority: 0.5,
      })
    }

    recordSitemapGeneration('topics', entries.length)
    return urlsetXml(entries.slice(0, SITEMAP_CHUNK_LIMIT))
  } catch (err) {
    recordSitemapError('topics', err instanceof Error ? err.message : 'unknown')
    return urlsetXml([])
  }
}

export async function buildEventsSitemap(base: string): Promise<string> {
  if (!isEventPagesEnabled()) return urlsetXml([])
  try {
    const { eventPageService } = await import('@/services/seo/eventPageService')
    const events = await eventPageService.listIndexable(SITEMAP_CHUNK_LIMIT)
    const entries: MetadataRoute.Sitemap = events.map((e) => ({
      url: `${base}${ROUTES.EVENT(e.slug)}`,
      lastModified: e.lastmod,
      changeFrequency: 'hourly',
      priority: 0.65,
    }))
    recordSitemapGeneration('events', entries.length)
    return urlsetXml(entries)
  } catch (err) {
    recordSitemapError('events', err instanceof Error ? err.message : 'unknown')
    return urlsetXml([])
  }
}
