import { FeedPageClient } from '@/components/feed/FeedPageClient'
import { FeedStructuredData } from '@/components/home/desktop/FeedStructuredData'
import { getLcpPreload } from '@/lib/lcpImage'
import { getHomeFeedInitialData } from '@/services/newsService.server'
import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

const siteUrl = getSiteUrl()
const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

export const NATIONAL_HOME_TITLE = 'Anasayfa | Türkiye Gündem, Son Dakika ve Haberler'
const NATIONAL_HOME_DESCRIPTION =
  'Gündem, 3. sayfa, spor, dünya, siyaset, ekonomi, turizm, gezi, teknoloji, bilim, otomotiv, kültür, sinema, tiyatro ve magazin haberleri. Türkiye\'nin güncel haber platformu.'

export function nationalHomeMetadata(): Metadata {
  const canonical = `${siteUrl}${ROUTES.HOME}`
  return {
    title: NATIONAL_HOME_TITLE,
    description: NATIONAL_HOME_DESCRIPTION,
    keywords: [
      'anasayfa',
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
    alternates: { canonical },
    openGraph: {
      title: NATIONAL_HOME_TITLE,
      description: NATIONAL_HOME_DESCRIPTION,
      url: canonical,
      type: 'website',
      locale: 'tr_TR',
      siteName,
      images: [{ url: `${siteUrl}/brand/og-default.png`, width: 1200, height: 630, alt: siteName }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      title: NATIONAL_HOME_TITLE,
      description: NATIONAL_HOME_DESCRIPTION,
    },
  }
}

export async function NationalHomePage() {
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
