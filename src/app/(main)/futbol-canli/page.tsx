import type { Metadata } from 'next'
import { FootballPage } from '@/components/football/FootballPage'
import { getTodayFixtures } from '@/services/footballService.server'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const revalidate = 300

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Süper Lig — Puan Tablosu & Maçlar',
  description: 'Türkiye Süper Lig puan tablosu, bugünkü maçlar ve canlı skorlar.',
  alternates: { canonical: `${siteUrl}${ROUTES.FOOTBALL}` },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Süper Lig Puan Tablosu & Maçlar — Nahaber',
    description: 'Türkiye Süper Lig puan tablosu, bugünkü maçlar ve canlı skorlar.',
  },
}

export default async function FutbolCanliPage() {
  const initialFixtures = await getTodayFixtures(203).catch(() => [])
  return <FootballPage initialFixtures={initialFixtures} />
}
