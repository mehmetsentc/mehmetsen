import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LocalNewsClient } from '@/components/local/LocalNewsClient'
import { getBreakingSliderItems } from '@/services/newsService.server'
import { getSiteUrl, buildCategoryOgUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { TURKISH_PROVINCES } from '@/constants/cities'
import type { NewsItem } from '@/types/newsItem'

export const revalidate = 60

const PROVINCE_BY_SLUG = new Map(TURKISH_PROVINCES.map((p) => [p.slug, p]))

interface CityPageProps {
  params: Promise<{ citySlug: string }>
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { citySlug } = await params
  const province = PROVINCE_BY_SLUG.get(citySlug)
  if (!province) return {}

  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const siteUrl = getSiteUrl()
  const title = `${province.name} Haberleri`
  const description = `${province.name} son dakika yerel haberler, gündem ve gelişmeler. ${province.name} şehrinden en güncel haberleri ${siteName}'de takip edin.`
  const canonicalUrl = `${siteUrl}${ROUTES.LOCAL_CITY(citySlug)}`
  const ogImage = buildCategoryOgUrl(`${province.name} Yerel Haber`, 'Yerel')
  const keywords = [
    `${province.name} haberleri`,
    `${province.name} son dakika`,
    `${province.name} yerel haber`,
    `${province.name} gündem`,
    'yerel haberler',
    siteName,
  ]

  return {
    title,
    description,
    keywords,
    robots: { index: true, follow: true },
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `${title} | ${siteName}`,
      description,
      url: canonicalUrl,
      type: 'website',
      locale: 'tr_TR',
      siteName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${province.name} Yerel Haber` }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      title: `${title} | ${siteName}`,
      description,
      images: [{ url: ogImage, alt: `${province.name} Yerel Haber` }],
    },
  }
}

export function generateStaticParams() {
  return TURKISH_PROVINCES.map((p) => ({ citySlug: p.slug }))
}

export default async function LocalNewsCityPage({ params }: CityPageProps) {
  const { citySlug } = await params
  const province = PROVINCE_BY_SLUG.get(citySlug)
  if (!province) notFound()

  const siteUrl = getSiteUrl()
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const pageUrl = `${siteUrl}${ROUTES.LOCAL_CITY(citySlug)}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${province.name} Haberleri | ${siteName}`,
    description: `${province.name} şehrinden son dakika yerel haberler ve güncel gelişmeler.`,
    url: pageUrl,
    inLanguage: 'tr-TR',
    isPartOf: { '@type': 'WebSite', name: siteName, url: siteUrl },
    about: {
      '@type': 'City',
      name: province.name,
      containedInPlace: { '@type': 'Country', name: 'Türkiye' },
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: siteName, item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'Yerel Haberler', item: `${siteUrl}${ROUTES.LOCAL}` },
        { '@type': 'ListItem', position: 3, name: province.name, item: pageUrl },
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
      <LocalNewsClient breakingItems={breakingItems} initialCitySlug={citySlug} />
    </>
  )
}
