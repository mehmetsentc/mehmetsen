import type { Metadata } from 'next'
import { LocalNewsClient } from '@/components/local/LocalNewsClient'
import { getBreakingSliderItems } from '@/services/newsService.server'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import type { NewsItem } from '@/types/newsItem'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Yerel Haberler | NaHaber',
  description: 'Bulunduğunuz şehre ve çevrenize özel son dakika yerel haberler',
  alternates: {
    canonical: `${getSiteUrl()}${ROUTES.LOCAL}`,
  },
  openGraph: {
    title: 'Yerel Haberler | NaHaber',
    description: 'Türkiye geneli şehir bazlı yerel haber akışı',
    url: `${getSiteUrl()}${ROUTES.LOCAL}`,
    type: 'website',
  },
}

export default async function LocalNewsPage() {
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
  return <LocalNewsClient breakingItems={breakingItems} />
}
