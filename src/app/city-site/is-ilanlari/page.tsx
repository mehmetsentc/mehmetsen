import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { CityJobsClient } from '@/components/city/CityJobsClient'
import {
  getCityJobListingsServer,
  getJobSyncSetupStatus,
} from '@/services/jobListingService.server'
import { getApprovedJobClassifiedsServer } from '@/services/jobClassifiedService.server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} İş İlanları`,
    description: `${cityName} iş ilanları (Kariyer.net, İŞKUR). ${siteName}'de güncel kariyer fırsatlarını inceleyin.`,
  }
}

export default async function CityJobsPage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const [initialJobs, setup, employerClassifieds, seekerClassifieds] = await Promise.all([
    getCityJobListingsServer(tenant.provinceSlug),
    Promise.resolve(getJobSyncSetupStatus()),
    getApprovedJobClassifiedsServer(tenant.provinceSlug, 'employer'),
    getApprovedJobClassifiedsServer(tenant.provinceSlug, 'seeker'),
  ])

  return (
    <CityJobsClient
      citySlug={tenant.provinceSlug}
      cityName={cityName}
      initialJobs={initialJobs}
      employerClassifieds={employerClassifieds}
      seekerClassifieds={seekerClassifieds}
      syncConfigured={setup.configured}
      missingEnv={setup.missing}
    />
  )
}
