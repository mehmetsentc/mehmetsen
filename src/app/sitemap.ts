import type { MetadataRoute } from 'next'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl()
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}${ROUTES.FEED}`, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}${ROUTES.DISCOVER}`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}${ROUTES.EVENTS}`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}${ROUTES.REELS}`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${base}${ROUTES.SEARCH}`, changeFrequency: 'weekly', priority: 0.5 },
  ]

  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .limit(500)
      .get()

    const articles: MetadataRoute.Sitemap = snap.docs.map((doc) => {
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

    return [...staticRoutes, ...articles]
  } catch (error) {
    console.warn('[sitemap] news fetch failed:', error)
    return staticRoutes
  }
}
