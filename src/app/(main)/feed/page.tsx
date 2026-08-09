import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { FeedPageClient } from '@/components/feed/FeedPageClient'
import { FeedStructuredData } from '@/components/home/desktop/FeedStructuredData'
import { getSiteUrl } from '@/lib/seo'
import { getLcpPreload } from '@/lib/lcpImage'
import { getHomeFeedInitialData } from '@/services/newsService.server'
import { ROUTES } from '@/constants/routes'
import { getCityCategoryName } from '@/constants/cities'
import { getCityNews, getCityCategories } from '@/services/cityNewsService.server'
import { CityFeedClient } from '@/components/city/CityFeedClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'

export const dynamic = 'force-dynamic'

const NATIONAL_HOSTS = new Set(['nahaber.com', 'www.nahaber.com', 'localhost', '127.0.0.1'])

const siteUrl = getSiteUrl()
const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

const FEED_TITLE = 'Türkiye Gündem, Son Dakika ve Haberler'
const FEED_DESCRIPTION =
  'Gündem, 3. sayfa, spor, dünya, siyaset, ekonomi, turizm, gezi, teknoloji, bilim, otomotiv, kültür, sinema, tiyatro ve magazin haberleri. Türkiye\'nin güncel haber platformu.'

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
    title: FEED_TITLE,
    description: FEED_DESCRIPTION,
    keywords: [
      'son dakika',
      'gündem haberleri',
      'türkiye haberleri',
      'spor haberleri',
      '3. sayfa',
      'asayiş',
      'ekonomi',
      'turizm',
      'gezi',
      'teknoloji',
      'magazin',
      'NaHaber',
    ],
    robots: { index: true, follow: true },
    alternates: { canonical: `${siteUrl}${ROUTES.FEED}` },
    openGraph: {
      title: FEED_TITLE,
      description: FEED_DESCRIPTION,
      url: `${siteUrl}${ROUTES.FEED}`,
      type: 'website',
      locale: 'tr_TR',
      siteName,
      images: [{ url: `${siteUrl}/brand/og-default.png`, width: 1200, height: 630, alt: siteName }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      title: FEED_TITLE,
      description: FEED_DESCRIPTION,
    },
  }
}

export default async function FeedPage() {
  const h = await headers()
  const citySlug = getCitySlugFromHost(
    h.get('x-forwarded-host') || h.get('host') || ''
  )

  if (citySlug) {
    const displayName = getCityCategoryName(citySlug)
    const [items, categories] = await Promise.all([
      getCityNews(citySlug, 30),
      getCityCategories(citySlug),
    ])
    return (
      <CityLayoutClient
        tenantSlug={citySlug}
        displayName={displayName}
        provinceSlug={citySlug}
        categories={categories}
      >
        <CityFeedClient citySlug={citySlug} initialItems={items} categories={categories} />
      </CityLayoutClient>
    )
  }

  const data = await getHomeFeedInitialData()

  const lcpImage =
    data.featured[0]?.imageUrl ??
    data.breaking[0]?.imageUrl ??
    data.latest[0]?.imageUrl ??
    null
  const lcpPreload = lcpImage ? getLcpPreload(lcpImage) : null

  const headlinePool = [...data.featured, ...data.latest, ...data.breaking]

  return (
    <>
      <FeedStructuredData headlines={headlinePool} />
      {lcpPreload ? (
        <link
          rel="preload"
          as="image"
          href={lcpPreload.href}
          imageSrcSet={lcpPreload.imagesrcset}
          imageSizes={lcpPreload.imagesizes}
          fetchPriority="high"
        />
      ) : null}
      <FeedPageClient homeFeedData={data} />
    </>
  )
}
