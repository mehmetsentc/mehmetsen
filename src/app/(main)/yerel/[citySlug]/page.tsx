import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LocalNewsClient } from '@/components/local/LocalNewsClient'
import { getBreakingSliderItems } from '@/services/newsService.server'
import { getSiteUrl } from '@/lib/seo'
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

  const title = `${province.name} Yerel Haber | NaHaber`
  const description = `${province.name} son dakika yerel haberler, gündem ve gelişmeler. ${province.name} şehrinden en güncel haberleri takip edin.`
  const url = `${getSiteUrl()}${ROUTES.LOCAL_CITY(citySlug)}`

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
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

  return <LocalNewsClient breakingItems={breakingItems} initialCitySlug={citySlug} />
}
