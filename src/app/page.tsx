import { redirect } from 'next/navigation'
import { ROUTES } from '@/constants/routes'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { getCityNews } from '@/services/cityNewsService.server'
import { CityFeedClient } from '@/components/city/CityFeedClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import type { Metadata } from 'next'

// force-dynamic so the host header is available at request time
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const cityOrigin = `https://${tenant.slug}.nahaber.com`

  return {
    title: `${cityName} Haberleri — ${siteName}`,
    description: `${cityName} son dakika yerel haberler, gündem, etkinlikler ve spor haberleri.`,
    alternates: {
      canonical: cityOrigin,
    },
    openGraph: {
      title: `${cityName} Haberleri — ${siteName}`,
      description: `${cityName} şehrinden son dakika yerel haberler ve güncel gelişmeler.`,
      url: cityOrigin,
      type: 'website',
      locale: 'tr_TR',
      siteName,
    },
  }
}

/**
 * Root `/` handler.
 *
 * City subdomains: middleware normally rewrites `/` → `/city-site`, but if
 * the middleware is unavailable (build mismatch, edge config issue, etc.),
 * we detect the city from the Host header and render city content inline.
 * This makes city routing middleware-independent.
 *
 * National site: redirect to /feed (307, not 308, so browsers don't cache it).
 */
export default async function Home() {
  const tenant = await getActiveTenant()

  if (tenant) {
    const items = await getCityNews(tenant.provinceSlug, 30)
    const displayName = getCityCategoryName(tenant.provinceSlug)
    return (
      <CityLayoutClient
        tenantSlug={tenant.slug}
        displayName={displayName}
        provinceSlug={tenant.provinceSlug}
      >
        <CityFeedClient citySlug={tenant.provinceSlug} initialItems={items} />
      </CityLayoutClient>
    )
  }

  redirect(ROUTES.FEED)
}
