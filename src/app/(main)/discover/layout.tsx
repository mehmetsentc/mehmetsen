import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Keşfet — Trend Haberler ve Konular',
  description: 'NaHaber\'de trend olan haberler, konular ve popüler içerikleri keşfedin.',
  alternates: {
    canonical: `${siteUrl}${ROUTES.DISCOVER}`,
  },
  openGraph: {
    title: 'Keşfet | NaHaber',
    description: 'Trend haberler ve popüler konular',
    url: `${siteUrl}${ROUTES.DISCOVER}`,
    images: [
      {
        url: `${siteUrl}/brand/og-default.png`,
        width: 1200,
        height: 630,
        alt: 'NaHaber Keşfet',
      },
    ],
  },
}

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return children
}
