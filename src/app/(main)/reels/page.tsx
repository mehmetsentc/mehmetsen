import type { Metadata } from 'next'
import { ReelsLoader } from '@/components/video/ReelsLoader'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const metadata: Metadata = {
  title: 'Video Haberler | NaHaber',
  description: 'Kısa video haberler, reels ve gündem videoları',
  alternates: {
    canonical: `${getSiteUrl()}${ROUTES.REELS}`,
  },
  openGraph: {
    title: 'Video Haberler | NaHaber',
    description: 'Gündem ve son dakika video haber içerikleri',
    url: `${getSiteUrl()}${ROUTES.REELS}`,
    type: 'website',
  },
}

export default function ReelsPage() {
  return <ReelsLoader />
}
