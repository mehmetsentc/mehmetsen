import type { Metadata } from 'next'
import { MuseumBrowser } from '@/components/museums/MuseumBrowser'
import { getCities } from '@/services/museumService.server'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const revalidate = 86400

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Türkiye Müzeleri',
  description:
    "Türkiye'deki müzeleri şehre göre keşfet. Adres, çalışma saatleri, telefon ve diğer detaylar.",
  alternates: { canonical: `${siteUrl}${ROUTES.MUZELER}` },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Türkiye Müzeleri — Nahaber',
    description:
      "Türkiye'deki müzeleri şehre göre keşfet. Adres, çalışma saatleri, telefon ve diğer detaylar.",
  },
}

export default async function MuzelerPage() {
  const cities = await getCities().catch(() => [])
  return <MuseumBrowser initialCities={cities} />
}
