import type { Metadata } from 'next'
import { LocalNewsClient } from '@/components/local/LocalNewsClient'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

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

export default function LocalNewsPage() {
  return <LocalNewsClient />
}
