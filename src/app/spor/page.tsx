import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { CitySporClient } from '@/components/city/CitySporClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCityNewsByCategory, getCityCategories } from '@/services/cityNewsService.server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) {
    return {
      title: 'Spor Haberleri',
      description: 'Futbol, basketbol, voleybol ve tüm spor haberleri.',
    }
  }

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} Spor Haberleri`,
    description: `${cityName} spor haberleri, yerel spor gelişmeleri ve maç sonuçları. ${siteName}'de ${cityName} sporunu takip edin.`,
  }
}

export default async function SporPage() {
  const citySlug = await getCitySlugFromHeaders()

  if (!citySlug) {
    redirect(ROUTES.SPOR)
  }

  const cityName = getCityCategoryName(citySlug)
  const items = await getCityNewsByCategory(citySlug, 'spor', 30)
  const categories = await getCityCategories(citySlug)

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
      categories={categories}
    >
      <CitySporClient citySlug={citySlug} cityName={cityName} initialItems={items} />
    </CityLayoutClient>
  )
}
