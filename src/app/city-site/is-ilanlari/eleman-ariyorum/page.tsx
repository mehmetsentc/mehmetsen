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
    title: `${cityName} · Eleman arıyorum`,
    description: 'İşveren olarak eleman ilanı bırakın. İnceleme sonrası yayınlanır.',
  }
}

export default async function CityElemanAriyorumPage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null
  const cityName = getCityCategoryName(tenant.provinceSlug)
  return (
    <CityJobClassifiedForm
      type="employer"
      citySlug={tenant.provinceSlug}
      cityName={cityName}
    />
  )
}
