import type { Metadata } from 'next'
import { WeatherClient } from '@/components/weather/WeatherClient'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const revalidate = 900

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Hava Durumu',
  description: 'Türkiye geneli güncel hava durumu, saatlik ve 7 günlük tahmin',
  alternates: { canonical: `${siteUrl}${ROUTES.WEATHER}` },
  robots: { index: true, follow: true },
}

export default function WeatherPage() {
  return <WeatherClient />
}
