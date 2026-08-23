import type { Metadata } from 'next'
import { NahaberSkorPage } from '@/components/skor/NahaberSkorPage'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const revalidate = 60

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'NaHaber Skor — Canlı skor, sonuçlar ve puan durumu',
  description:
    'Futbol, basketbol ve voleybol canlı skorları, bugünkü maçlar, sonuçlar, program ve sezon arşivi.',
  alternates: { canonical: `${siteUrl}${ROUTES.SKOR}` },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'NaHaber Skor',
    description: 'Canlı skor · Bugün · Sonuçlar · Program · Puan · Arşiv',
  },
}

export default function SkorPage() {
  return <NahaberSkorPage />
}
