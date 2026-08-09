import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getActiveTenant } from '@/lib/tenantContext'
import {
  getCityCategoryName,
  getDistrictsForProvince,
  DISTRICT_DISPLAY_NAMES,
} from '@/constants/cities'
import { getCityNewsByDistrict } from '@/services/cityNewsService.server'
import { MobileFeedCardNews } from '@/components/feed/MobileFeedCard'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const districtName = DISTRICT_DISPLAY_NAMES[slug]
  if (!districtName) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${districtName} Haberleri — ${cityName} | ${siteName}`,
    description: `${districtName} ilçesinden yerel haberler. ${cityName} ${districtName} haberleri ${siteName}'de.`,
  }
}

export default async function CityDistrictPage({ params }: PageProps) {
  const { slug } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const districts = getDistrictsForProvince(tenant.provinceSlug)
  const district = districts.find((d) => d.slug === slug)
  if (!district) notFound()

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const items = await getCityNewsByDistrict(tenant.provinceSlug, slug, 30)

  return (
    <>
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
    </>
  )
}
