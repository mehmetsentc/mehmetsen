import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { LocalNewsClient } from '@/components/local/LocalNewsClient'
import { getBreakingSliderItems } from '@/services/newsService.server'
import { getSiteUrl, buildCategoryOgUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { NewsItem } from '@/types/newsItem'
import { getCityCategoryName } from '@/constants/cities'
import { getCityNews } from '@/services/cityNewsService.server'
import { CityFeedClient } from '@/components/city/CityFeedClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'

export const dynamic = 'force-dynamic'

const NATIONAL_HOSTS = new Set(['nahaber.com', 'www.nahaber.com', 'localhost', '127.0.0.1'])

const siteUrl = getSiteUrl()
const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
const canonicalUrl = `${siteUrl}${ROUTES.LOCAL}`
const ogImage = buildCategoryOgUrl('Yerel Haberler — 81 İlden Son Dakika', 'Yerel')

function getCitySlugFromHost(host: string): string | null {
  const clean = host.split(':')[0].toLowerCase()
  if (NATIONAL_HOSTS.has(clean)) return null
  const m = clean.match(/^([a-z0-9-]+)\.nahaber\.com$/)
  if (m && m[1] !== 'www') return m[1]
  const local = clean.match(/^([a-z0-9-]+)\.localhost$/)
  if (local) return local[1]
  return null
}

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const citySlug = getCitySlugFromHost(
    h.get('x-forwarded-host') || h.get('host') || ''
  )

  if (citySlug) {
    const cityName = getCityCategoryName(citySlug)
    const cityOrigin = `https://${citySlug}.nahaber.com`
    return {
      title: `${cityName} Haberleri`,
      description: `${cityName} son dakika yerel haberler, gündem, etkinlikler ve spor haberleri.`,
      alternates: { canonical: cityOrigin },
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

  return {
    title: 'Yerel Haberler — 81 İlden Son Dakika',
    description: '81 ilden yerel son dakika haberler, şehir gündemleri ve bölgesel gelişmeler. Bulunduğunuz şehre özel haberleri takip edin.',
    keywords: ['yerel haberler', 'şehir haberleri', 'il haberleri', 'son dakika yerel', 'Türkiye yerel haber', siteName],
    robots: { index: true, follow: true },
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `Yerel Haberler | ${siteName}`,
      description: '81 ilden yerel son dakika haberler ve şehir gündemleri.',
      url: canonicalUrl,
      type: 'website',
      locale: 'tr_TR',
      siteName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: 'Yerel Haberler' }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      title: `Yerel Haberler | ${siteName}`,
      description: '81 ilden yerel son dakika haberler ve şehir gündemleri.',
      images: [{ url: ogImage, alt: 'Yerel Haberler' }],
    },
  }
}

export default async function LocalNewsPage() {
  const h = await headers()
  const citySlug = getCitySlugFromHost(
    h.get('x-forwarded-host') || h.get('host') || ''
  )

  if (citySlug) {
    const displayName = getCityCategoryName(citySlug)
    const items = await getCityNews(citySlug, 30)
    return (
      <CityLayoutClient
        tenantSlug={citySlug}
        displayName={displayName}
        provinceSlug={citySlug}
      >
        <CityFeedClient citySlug={citySlug} initialItems={items} />
      </CityLayoutClient>
    )
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Yerel Haberler | ${siteName}`,
    description: '81 ilden yerel son dakika haberler ve şehir gündemleri.',
    url: canonicalUrl,
    inLanguage: 'tr-TR',
    isPartOf: { '@type': 'WebSite', name: siteName, url: siteUrl },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Yerel Haberler', item: canonicalUrl },
      ],
    },
  }

  const sliderItems = await getBreakingSliderItems(12)
  const breakingItems: NewsItem[] = sliderItems.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    imageUrl: item.imageUrl ?? undefined,
    category: item.categoryId,
    publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined,
    breaking: true,
  }))
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LocalNewsClient breakingItems={breakingItems} />
    </>
  )
}
