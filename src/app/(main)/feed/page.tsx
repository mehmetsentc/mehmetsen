import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { FeedPageClient } from '@/components/feed/FeedPageClient'
import { FeedStructuredData } from '@/components/home/desktop/FeedStructuredData'
import { getSiteUrl } from '@/lib/seo'
import { getLcpPreload } from '@/lib/lcpImage'
import { getHomeFeedInitialData } from '@/services/newsService.server'
import { ROUTES } from '@/constants/routes'

/**
 * force-dynamic prevents Vercel CDN from caching this page with ISR.
 * Without it, city subdomains (canakkale.nahaber.com/feed) receive the
 * CDN-cached national prerender instead of being rewritten to /city-site
 * by middleware.
 */
export const dynamic = 'force-dynamic'

const NATIONAL_HOSTS = new Set(['nahaber.com', 'www.nahaber.com', 'localhost', '127.0.0.1'])

const siteUrl = getSiteUrl()
const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

const FEED_TITLE = 'Türkiye Gündem, Son Dakika ve Haberler'
const FEED_DESCRIPTION =
  'Gündem, 3. sayfa, spor, dünya, siyaset, ekonomi, turizm, gezi, teknoloji, bilim, otomotiv, kültür, sinema, tiyatro ve magazin haberleri. Türkiye\'nin güncel haber platformu.'

export const metadata: Metadata = {
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
  alternates: {
    canonical: `${siteUrl}${ROUTES.FEED}`,
  },
  openGraph: {
    title: FEED_TITLE,
    description: FEED_DESCRIPTION,
    url: `${siteUrl}${ROUTES.FEED}`,
    type: 'website',
    locale: 'tr_TR',
    siteName,
    images: [
      {
        url: `${siteUrl}/brand/og-default.png`,
        width: 1200,
        height: 630,
        alt: siteName,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@nahabercom',
    title: FEED_TITLE,
    description: FEED_DESCRIPTION,
  },
}

export default async function FeedPage() {
  // If this is a city subdomain (middleware rewrite to /city-site didn't fire),
  // redirect to root which renders city content independently of middleware.
  // Uses a direct host check — no dynamic imports that could silently fail
  // in this serverless bundle.
  if (process.env.CITY_NETWORK_ENABLED === 'true') {
    const h = await headers()
    const host = (h.get('host') ?? '').split(':')[0].toLowerCase()
    if (!NATIONAL_HOSTS.has(host) && host.endsWith('.nahaber.com')) {
      redirect('/')
    }
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
          // React 19: imageSrcSet / imageSizes map to imagesrcset / imagesizes
          imageSrcSet={lcpPreload.imagesrcset}
          imageSizes={lcpPreload.imagesizes}
          fetchPriority="high"
        />
      ) : null}
      <FeedPageClient homeFeedData={data} />
    </>
  )
}
