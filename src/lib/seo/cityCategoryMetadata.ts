import type { Metadata } from 'next'
import { getCityCategoryName } from '@/constants/cities'
import { resolveCityCategoryRoute } from '@/lib/cityCategoryRoute'
import { buildCityPageMetadata } from '@/lib/seo/cityPageMetadata'

/**
 * SEO-1B city category metadata for `{city}.nahaber.com/kategori/{id}`, served by
 * `/city-site/kategori/[id]` (middleware rewrite). The www category page never
 * reads the host so it can stay on the CDN.
 */
export function buildCityCategoryMetadata(citySlug: string, id: string): Metadata {
  const resolved = resolveCityCategoryRoute(id)
  if (!resolved) return { title: 'Kategori', robots: { index: false, follow: false } }
  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const title = `${cityName} ${resolved.label} Haberleri`
  const description = `${cityName} ${resolved.label.toLowerCase()} haberleri. ${siteName}'de ${cityName} gündemini takip edin.`
  // Lowercase route id; unsafe ids make the helper return null → title/description only.
  const routeId = id.trim().toLowerCase()
  return (
    buildCityPageMetadata({ citySlug, segments: ['kategori', routeId], title, description }) ?? {
      title,
      description,
    }
  )
}
