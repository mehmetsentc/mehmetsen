import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { MetadataRoute } from 'next'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES } from '@/constants/config'

export const ARTICLES_PER_PAGE = 500

async function staticAndCategoryRoutes(base: string): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}${ROUTES.HOME}`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}${ROUTES.FEED}`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}${ROUTES.DISCOVER}`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}${ROUTES.EVENTS}`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}${ROUTES.REELS}`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${base}${ROUTES.LOCAL}`, changeFrequency: 'hourly', priority: 0.85 },
    { url: `${base}/hakkimizda`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/iletisim`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/gizlilik`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/editoryal-ilkeler`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/kune`, changeFrequency: 'monthly', priority: 0.3 },
  ]

  const categoryRoutes: MetadataRoute.Sitemap = DEFAULT_CATEGORIES.map((cat) => ({
    url: `${base}${ROUTES.CATEGORY(cat.id)}`,
    changeFrequency: 'hourly' as const,
    priority: 0.85,
  }))

  try {
    const latestForSeo = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(300)
      .get()

    const authorSlugs = new Set<string>()
    const tagSlugs = new Set<string>()

    for (const doc of latestForSeo.docs) {
      const data = doc.data() as { source?: string; tags?: string[] }
      const source = data.source?.trim()
      if (source) {
        authorSlugs.add(encodeURIComponent(source.toLowerCase().replace(/\s+/g, '-')))
      }
      for (const tag of data.tags ?? []) {
        const normalized = tag?.trim()
        if (normalized) tagSlugs.add(normalized)
        if (tagSlugs.size >= 100) break
      }
    }

    const authorRoutes: MetadataRoute.Sitemap = Array.from(authorSlugs).map((slug) => ({
      url: `${base}/yazar/${slug}`,
      changeFrequency: 'daily',
      priority: 0.6,
    }))

    const tagRoutes: MetadataRoute.Sitemap = Array.from(tagSlugs).map((tag) => ({
      url: `${base}${ROUTES.SEARCH}?q=${encodeURIComponent(tag)}`,
      changeFrequency: 'daily',
      priority: 0.5,
    }))

    return [...staticRoutes, ...categoryRoutes, ...authorRoutes, ...tagRoutes]
  } catch {
    return [...staticRoutes, ...categoryRoutes]
  }
}

function mapArticleDocs(
  docs: QueryDocumentSnapshot[],
  base: string
): MetadataRoute.Sitemap {
  return docs.map((doc) => {
    const data = doc.data() as { slug?: string; publishedAt?: number; updatedAt?: number }
    const slug = data.slug?.trim() || doc.id
    const path = slug !== doc.id ? ROUTES.NEWS_DETAIL(slug) : ROUTES.POST_DETAIL(doc.id)
    const lastMod = new Date(data.updatedAt ?? data.publishedAt ?? Date.now())
    return {
      url: `${base}${path}`,
      lastModified: lastMod,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }
  })
}

export async function getSitemapPageCount(): Promise<number> {
  try {
    const countSnap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .count()
      .get()
    const total = countSnap.data().count
    return Math.max(1, Math.ceil(total / ARTICLES_PER_PAGE))
  } catch {
    return 1
  }
}

export async function getSitemapPage(id: number): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl()

  try {
    const snap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .offset(id * ARTICLES_PER_PAGE)
      .limit(ARTICLES_PER_PAGE)
      .get()

    const articles = mapArticleDocs(snap.docs, base)
    if (id === 0) {
      const staticRoutes = await staticAndCategoryRoutes(base)
      return [...staticRoutes, ...articles]
    }
    return articles
  } catch (error) {
    console.warn(`[sitemap/${id}] fetch failed:`, error)
    return id === 0 ? await staticAndCategoryRoutes(base) : []
  }
}

function formatLastMod(value: Date | string | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function sitemapEntriesToXml(entries: MetadataRoute.Sitemap): string {
  return entries
    .map((entry) => {
      const lastMod = formatLastMod(entry.lastModified)
      const changeFreq = entry.changeFrequency
        ? `<changefreq>${entry.changeFrequency}</changefreq>`
        : ''
      const priority =
        entry.priority !== undefined ? `<priority>${entry.priority}</priority>` : ''
      const lastModTag = lastMod ? `<lastmod>${lastMod}</lastmod>` : ''

      return `<url><loc>${escapeXml(entry.url)}</loc>${lastModTag}${changeFreq}${priority}</url>`
    })
    .join('')
}

export function buildSitemapIndexXml(base: string, pageCount: number): string {
  const pageItems = Array.from({ length: pageCount }, (_, id) => {
    return `  <sitemap>\n    <loc>${base}/sitemap/${id}.xml</loc>\n  </sitemap>`
  })
  const dedicatedItems = [
    `${base}/news-sitemap.xml`,
    `${base}/video-sitemap.xml`,
    `${base}/images-sitemap.xml`,
  ].map((url) => `  <sitemap>\n    <loc>${url}</loc>\n  </sitemap>`)
  const items = [...dedicatedItems, ...pageItems].join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`
}
