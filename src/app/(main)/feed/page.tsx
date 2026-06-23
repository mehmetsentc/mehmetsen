import type { Metadata } from 'next'
import { FeedPageClient } from '@/components/feed/FeedPageClient'
import { getSiteUrl } from '@/lib/seo'
import { getLcpPreloadHref } from '@/lib/lcpImage'
import { getHomeFeedInitialData } from '@/services/newsService.server'
import { ROUTES } from '@/constants/routes'

/**
 * Vercel CDN cache: 2 dakika tazelik + sayfa SSR sırasında 1 Firestore sorgusu.
 * Eski implementasyonda 19 paralel sorgu vardı (TTFB 5-15s).
 */
export const revalidate = 120

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Gündem — Son Dakika Haberler',
  description:
    'Türkiye gündeminden son dakika haberleri, güncel gelişmeler ve editoryal içerik — NaHaber',
  alternates: {
    canonical: `${siteUrl}${ROUTES.FEED}`,
  },
  openGraph: {
    title: 'Gündem — Son Dakika Haberler | NaHaber',
    description: 'Türkiye gündeminden son dakika haberleri — NaHaber',
    url: `${siteUrl}${ROUTES.FEED}`,
    type: 'website',
  },
}

export default async function FeedPage() {
  const data = await getHomeFeedInitialData()

  const lcpImage =
    data.featured[0]?.imageUrl ??
    data.breaking[0]?.imageUrl ??
    data.latest[0]?.imageUrl ??
    null
  const lcpPreload = lcpImage ? getLcpPreloadHref(lcpImage) : null

  return (
    <>
      {lcpPreload ? (
        <link rel="preload" as="image" href={lcpPreload} fetchPriority="high" />
      ) : null}
      <FeedPageClient homeFeedData={data} />
    </>
  )
}
