import type { MetadataRoute } from 'next'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { tagToSlug } from '@/lib/tags'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { TURKISH_PROVINCES } from '@/constants/cities'

// ─── Pagination config ────────────────────────────────────────────────────────
// Time-range pagination: each sitemap page covers one WEEK of articles.
// This eliminates Firestore OFFSET scans (old approach scanned 20k+ docs per page).
// Each query now reads ONLY the documents it returns.
const DAYS_PER_PAGE = 7
const MS_PER_PAGE   = DAYS_PER_PAGE * 24 * 60 * 60 * 1000

// Maximum pages = 2 years of weekly buckets. Google only cares about recent content.
const MAX_PAGES = 104 // 2 years

// Hard limit per page (Firestore max = 1000)
export const ARTICLES_PER_PAGE = 500

// ─── Helper: fields only ──────────────────────────────────────────────────────
// Select only the 3 fields we actually need → fewer bytes transferred
const SELECT_FIELDS = ['slug', 'publishedAt', 'updatedAt'] as const

// ─── Static + category routes (page 0 only) ──────────────────────────────────
async function staticAndCategoryRoutes(base: string): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}${ROUTES.HOME}`,     changeFrequency: 'hourly', priority: 1 },
    { url: `${base}${ROUTES.FEED}`,     changeFrequency: 'hourly', priority: 1 },
    { url: `${base}${ROUTES.DISCOVER}`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}${ROUTES.EVENTS}`,   changeFrequency: 'daily',  priority: 0.8 },
    { url: `${base}${ROUTES.REELS}`,    changeFrequency: 'hourly', priority: 0.8 },
    { url: `${base}${ROUTES.LOCAL}`,    changeFrequency: 'hourly', priority: 0.85 },
    { url: `${base}${ROUTES.APP}`,      changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/hakkimizda`,        changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/iletisim`,          changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}${ROUTES.SITE_MAP}`,  changeFrequency: 'weekly',  priority: 0.5 },
    { url: `${base}/gizlilik`,          changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/editoryal-ilkeler`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/kune`,              changeFrequency: 'monthly', priority: 0.3 },
  ]

  const categoryRoutes: MetadataRoute.Sitemap = DEFAULT_CATEGORIES.map((cat) => ({
    url: `${base}${ROUTES.CATEGORY(cat.slug ?? cat.id)}`,
    changeFrequency: 'hourly' as const,
    priority: cat.parentId ? 0.75 : 0.85,
  }))

  const localCityRoutes: MetadataRoute.Sitemap = TURKISH_PROVINCES.map((province) => ({
    url: `${base}${ROUTES.LOCAL_CITY(province.slug)}`,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))

  try {
    const latestForSeo = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .select(...SELECT_FIELDS, 'tags')
      .limit(300)
      .get()

    const tagSlugs = new Set<string>()
    for (const doc of latestForSeo.docs) {
      const data = doc.data() as { tags?: string[] }
      for (const tag of data.tags ?? []) {
        const normalized = tagToSlug(tag ?? '')
        if (normalized) tagSlugs.add(normalized)
        if (tagSlugs.size >= 100) break
      }
    }

    const tagRoutes: MetadataRoute.Sitemap = Array.from(tagSlugs).map((tag) => ({
      url: `${base}${ROUTES.TAG(tag)}`,
      changeFrequency: 'daily',
      priority: 0.5,
    }))

    return [...staticRoutes, ...categoryRoutes, ...localCityRoutes, ...tagRoutes]
  } catch {
    return [...staticRoutes, ...categoryRoutes, ...localCityRoutes]
  }
}

// ─── Article doc → sitemap entry ─────────────────────────────────────────────
function mapArticleDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
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

// ─── Time windows for each page ───────────────────────────────────────────────
// page 0 → now .. now-7d  (most recent week)
// page 1 → now-7d .. now-14d
// page N → now - N*7d .. now - (N+1)*7d
function pageTimeRange(id: number): { from: number; to: number } {
  const now = Date.now()
  return {
    to:   now - id * MS_PER_PAGE,
    from: now - (id + 1) * MS_PER_PAGE,
  }
}

// ─── Page count ───────────────────────────────────────────────────────────────
export async function getSitemapPageCount(): Promise<number> {
  try {
    // Find the oldest published article to know how many weeks back we go
    const oldest = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'asc')
      .select('publishedAt')
      .limit(1)
      .get()

    if (oldest.empty) return 1

    const firstPublishedAt = (oldest.docs[0].data() as { publishedAt?: number }).publishedAt ?? 0
    const weeksBack = Math.ceil((Date.now() - firstPublishedAt) / MS_PER_PAGE)
    return Math.min(MAX_PAGES, Math.max(1, weeksBack))
  } catch {
    return 1
  }
}

// ─── Sitemap page ─────────────────────────────────────────────────────────────
export async function getSitemapPage(id: number): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl()

  try {
    const { from, to } = pageTimeRange(id)

    const snap = await getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('publishedAt', '>=', from)
      .where('publishedAt', '<', to)
      .orderBy('publishedAt', 'desc')
      .select(...SELECT_FIELDS)
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

// ─── XML helpers ─────────────────────────────────────────────────────────────
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
      const lastMod    = formatLastMod(entry.lastModified)
      const changeFreq = entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : ''
      const priority   = entry.priority !== undefined ? `<priority>${entry.priority}</priority>` : ''
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
