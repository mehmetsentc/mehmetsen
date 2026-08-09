import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { CityEventsClient } from '@/components/city/CityEventsClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) {
    return {
      title: 'Etkinlikler',
      description: 'Türkiye genelinde konser, tiyatro, festival ve etkinlikler.',
    }
  }

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} Etkinlikleri`,
    description: `${cityName} şehrindeki etkinlikler, konserler, tiyatrolar ve festivaller. ${siteName}'de ${cityName} etkinliklerini keşfedin.`,
  }
}

export default async function EtkinlikPage() {
  const citySlug = await getCitySlugFromHeaders()

  if (!citySlug) {
    redirect(ROUTES.EVENTS)
  }

  const cityName = getCityCategoryName(citySlug)

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
    >
      <CityEventsClient citySlug={citySlug} cityName={cityName} />
    </CityLayoutClient>
  )
}
