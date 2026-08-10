import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getActiveTenant } from '@/lib/tenantContext'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCityCategoryName } from '@/constants/cities'
import { getCityIconMetadata } from '@/lib/cityBrand'
import { getCityCategories } from '@/services/cityNewsService.server'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const icons = getCityIconMetadata(tenant.provinceSlug)
  if (!icons) return {}

  return { icons }
}

/**
 * City tenant layout — wraps all city-site pages.
 * Reached via middleware rewrite (public URL stays clean: /, /etkinlik, etc.)
 * If no tenant is active (national site or flag off), redirects to /.
 */
export default async function CityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tenant = await getActiveTenant()

  if (!tenant) {
    redirect('/')
  }

  const displayName = getCityCategoryName(tenant.provinceSlug)
  const categories = await getCityCategories(tenant.provinceSlug)

  return (
    <CityLayoutClient
      tenantSlug={tenant.slug}
      displayName={displayName}
      provinceSlug={tenant.provinceSlug}
      categories={categories}
    >
      {children}
    </CityLayoutClient>
  )
}
