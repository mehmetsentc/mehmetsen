import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES, TEKRARLAYAN_CATEGORY_ID } from '@/constants/config'
import { TURKISH_PROVINCES } from '@/constants/cities'

// ─── Static + category routes (page 0 only) ──────────────────────────────────
async function staticAndCategoryRoutes(base: string): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}${ROUTES.HOME}`,     changeFrequency: 'hourly', priority: 1 },
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

  const categoryRoutes: MetadataRoute.Sitemap = DEFAULT_CATEGORIES.filter((cat) => cat.id !== TEKRARLAYAN_CATEGORY_ID).map((cat) => ({
    url: `${base}${ROUTES.CATEGORY(cat.slug ?? cat.id)}`,
    changeFrequency: 'hourly' as const,
    priority: cat.parentId ? 0.75 : 0.85,
  }))

  const localCityRoutes: MetadataRoute.Sitemap = TURKISH_PROVINCES.map((province) => ({
    url: `${base}${ROUTES.LOCAL_CITY(province.slug)}`,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }))

  return [...staticRoutes, ...categoryRoutes, ...localCityRoutes]
}

// ─── Page count ───────────────────────────────────────────────────────────────
export async function getSitemapPageCount(): Promise<number> {
  return 1
}

// ─── Sitemap page ─────────────────────────────────────────────────────────────
/**
 * /sitemap/0.xml = static + category + /yerel routes only.
 *
 * SEO-1C.1: article URLs moved to the permanent monthly shards
 * (/sitemaps/articles-YYYY-MM.xml, see lib/sitemap/articleSitemap.ts). The old
 * rolling 7-day PostgreSQL-only window (500 cap) listed 0 articles because live
 * articles are Firestore-backed; keeping it would only duplicate PG URLs.
 */
export async function getSitemapPage(id: number): Promise<MetadataRoute.Sitemap> {
  if (id !== 0) return []
  return staticAndCategoryRoutes(getSiteUrl())
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
