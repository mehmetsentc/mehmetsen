import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { CityJobClassifiedForm } from '@/components/city/CityJobClassifiedForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}
  const cityName = getCityCategoryName(tenant.provinceSlug)
  return {
    title: `${cityName} · İş arıyorum`,
    description: 'İş arayan ilanı bırakın. İnceleme sonrası yayınlanır.',
  }
}

export default async function CityIsAriyorumPage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null
  const cityName = getCityCategoryName(tenant.provinceSlug)
  return (
    <CityJobClassifiedForm
      type="seeker"
      citySlug={tenant.provinceSlug}
      cityName={cityName}
    />
  )
}
