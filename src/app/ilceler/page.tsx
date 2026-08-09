import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCityCategoryName, getDistrictsForProvince } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { CityDistrictsClient } from '@/components/city/CityDistrictsClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) {
    return {
      title: 'Yerel Haberler',
      description: '81 ilden yerel son dakika haberler ve şehir gündemleri.',
    }
  }

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} İlçeleri`,
    description: `${cityName} ilçelerinden yerel haberler. ${siteName}'de ${cityName} ilçe haberleri.`,
  }
}

export default async function IlcelerPage() {
  const citySlug = await getCitySlugFromHeaders()

  if (!citySlug) {
    redirect(ROUTES.LOCAL)
  }

  const cityName = getCityCategoryName(citySlug)
  const districts = getDistrictsForProvince(citySlug)

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
    >
      <CityDistrictsClient citySlug={citySlug} cityName={cityName} districts={districts} />
    </CityLayoutClient>
  )
}
