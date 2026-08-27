/**
 * Lightweight city/category/district sitemap builders — no DB/Firestore imports.
 * Keeps entity sitemaps resilient when crawler/publisher modules fail to init.
 */
import type { MetadataRoute } from 'next'
import { ROUTES } from '@/constants/routes'
import { DEFAULT_CATEGORIES, TEKRARLAYAN_CATEGORY_ID } from '@/constants/config'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { evaluateCategorySeo } from '@/lib/seo/seoEligibility'
import { recordSitemapGeneration } from '@/lib/seo/observability'
import { urlsetXml } from '@/lib/sitemap/seoXml'

export async function buildCitiesSitemap(base: string): Promise<string> {
  const entries: MetadataRoute.Sitemap = TURKISH_PROVINCES.map((p) => ({
    url: `${base}${ROUTES.LOCAL_CITY(p.slug)}`,
    changeFrequency: 'daily',
    priority: 0.7,
  }))
  recordSitemapGeneration('cities', entries.length)
  return urlsetXml(entries)
}

export async function buildDistrictsSitemap(_base: string): Promise<string> {
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
