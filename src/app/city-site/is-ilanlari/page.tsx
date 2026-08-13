import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { CityJobsClient } from '@/components/city/CityJobsClient'
import {
  getCityJobListingsServer,
  getJobSyncSetupStatus,
} from '@/services/jobListingService.server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} İş İlanları`,
    description: `${cityName} İŞKUR açık iş ilanları. ${siteName}'de güncel kariyer fırsatlarını inceleyin.`,
  }
}

export default async function CityJobsPage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const [initialJobs, setup] = await Promise.all([
    getCityJobListingsServer(tenant.provinceSlug),
    Promise.resolve(getJobSyncSetupStatus()),
  ])

  return (
    <CityJobsClient
      citySlug={tenant.provinceSlug}
      cityName={cityName}
      initialJobs={initialJobs}
      syncConfigured={setup.configured}
      missingEnv={setup.missing}
    />
  )
}
