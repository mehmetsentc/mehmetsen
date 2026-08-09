import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import {
  DISTRICT_DISPLAY_NAMES,
  getCityCategoryName,
  getDistrictsForProvince,
} from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { MobileFeedCardNews } from '@/components/feed/MobileFeedCard'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCityNewsByDistrict } from '@/services/cityNewsService.server'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) return {}

  const districtName = DISTRICT_DISPLAY_NAMES[slug]
  if (!districtName) return {}

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${districtName} Haberleri — ${cityName} | ${siteName}`,
    description: `${districtName} ilçesinden yerel haberler. ${cityName} ${districtName} haberleri ${siteName}'de.`,
  }
}

export default async function IlcePage({ params }: PageProps) {
  const { slug } = await params
  const citySlug = await getCitySlugFromHeaders()

  if (!citySlug) {
    redirect(ROUTES.LOCAL)
  }

  const districts = getDistrictsForProvince(citySlug)
  const district = districts.find((d) => d.slug === slug)
  if (!district) notFound()

  const cityName = getCityCategoryName(citySlug)
  const items = await getCityNewsByDistrict(citySlug, slug, 30)

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
    >
      <div className="mx-auto w-full max-w-3xl px-4 pb-2 max-md:pt-2">
        <h1 className="text-xl font-bold text-[rgb(var(--color-text))]">
          {district.name} Haberleri
        </h1>
        <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">
          {cityName} · {district.name}
        </p>
      </div>
      <div className="home-feed mx-auto w-full max-w-3xl pb-6 max-md:pb-10">
        {items.length > 0 ? (
          <div className="sd-feed">
            {items.map((item, i) => (
              <MobileFeedCardNews key={item.id} item={item} priority={i === 0} />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-lg font-semibold text-[rgb(var(--color-text))]">
              Henüz haber yok
            </p>
          </div>
        )}
      </div>
    </CityLayoutClient>
  )
}
