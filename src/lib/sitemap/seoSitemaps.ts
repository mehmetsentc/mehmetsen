import 'server-only'

import type { MetadataRoute } from 'next'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { tagToSlug } from '@/lib/tags'
import { DEFAULT_CATEGORIES, TEKRARLAYAN_CATEGORY_ID } from '@/constants/config'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { hasDatabaseUrl } from '@/db'
import { publisherService } from '@/services/publisher/publisherService'
import { isPublisherPlatformEnabled } from '@/lib/publisher/featureFlag'
import { isEventPagesEnabled } from '@/lib/seo/featureFlag'
import { eventPageService } from '@/services/seo/eventPageService'
import {
  evaluateCategorySeo,
  evaluatePublisherSeo,
  evaluateTopicSeo,
} from '@/lib/seo/seoEligibility'
import { recordSitemapGeneration, recordSitemapError } from '@/lib/seo/observability'
import { getSitemapPageCount } from '@/lib/sitemap/mainSitemap'

export const SITEMAP_CHUNK_LIMIT = 50_000

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function urlsetXml(entries: MetadataRoute.Sitemap): string {
  const rows = entries
    .map((entry) => {
      const lastMod =
        entry.lastModified instanceof Date
          ? entry.lastModified.toISOString()
          : entry.lastModified
            ? new Date(entry.lastModified).toISOString()
            : ''
      const lastmodTag = lastMod ? `<lastmod>${lastMod}</lastmod>` : ''
      const freq = entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : ''
      const pri = entry.priority !== undefined ? `<priority>${entry.priority}</priority>` : ''
      return `  <url><loc>${xmlEscape(entry.url)}</loc>${lastmodTag}${freq}${pri}</url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>`
}

export async function buildSitemapIndexXmlAsync(base: string): Promise<string> {
  const pageCount = await getSitemapPageCount()
  const newsChunks = Array.from({ length: pageCount }, (_, i) => ({
    loc: `${base}/sitemap-news-${i}.xml`,
  }))
  const dedicated = [
    `${base}/news-sitemap.xml`,
    `${base}/video-sitemap.xml`,
    `${base}/images-sitemap.xml`,
    `${base}/sitemap-publishers.xml`,
    `${base}/sitemap-cities.xml`,
    `${base}/sitemap-districts.xml`,
    `${base}/sitemap-categories.xml`,
    `${base}/sitemap-topics.xml`,
    ...(isEventPagesEnabled() ? [`${base}/sitemap-events.xml`] : []),
  ].map((loc) => ({ loc }))

  const items = [...dedicated, ...newsChunks]
    .map(
      (item) =>
        `  <sitemap>\n    <loc>${xmlEscape(item.loc)}</loc>\n  </sitemap>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`
}

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

export async function buildCitiesSitemap(base: string): Promise<string> {
  const entries: MetadataRoute.Sitemap = TURKISH_PROVINCES.map((p) => ({
    url: `${base}${ROUTES.LOCAL_CITY(p.slug)}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }))
  recordSitemapGeneration('cities', entries.length)
  return urlsetXml(entries)
}

export async function buildDistrictsSitemap(base: string): Promise<string> {
  // District URLs under city-site /ilceler/[slug] — national yerel district stub
  const entries: MetadataRoute.Sitemap = []
  recordSitemapGeneration('districts', entries.length)
  return urlsetXml(entries)
}

export async function buildCategoriesSitemap(base: string): Promise<string> {
  const entries: MetadataRoute.Sitemap = DEFAULT_CATEGORIES.filter(
    (c) => c.id !== TEKRARLAYAN_CATEGORY_ID
  )
    .filter(() => evaluateCategorySeo('_', 10).indexable)
    .map((cat) => ({
      url: `${base}${ROUTES.CATEGORY(cat.slug ?? cat.id)}`,
      changeFrequency: 'hourly',
      priority: cat.parentId ? 0.75 : 0.85,
    }))
  recordSitemapGeneration('categories', entries.length)
  return urlsetXml(entries)
}

export async function buildTopicsSitemap(base: string): Promise<string> {
  try {
    const snap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .select('tags', 'publishedAt')
      .limit(500)
      .get()

    const tagCounts = new Map<string, number>()
    const tagLastMod = new Map<string, Date>()

    for (const doc of snap.docs) {
      const d = doc.data() as { tags?: string[]; publishedAt?: number }
      const ts = new Date(d.publishedAt ?? Date.now())
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
