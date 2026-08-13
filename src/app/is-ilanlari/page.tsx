import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { CityJobsClient } from '@/components/city/CityJobsClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import {
  getCityJobListingsServer,
  getJobSyncSetupStatus,
} from '@/services/jobListingService.server'
import { getCityNavPresence } from '@/services/cityNewsService.server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) {
    return {
      title: 'İş İlanları',
      description: 'Şehir İŞKUR açık iş ilanları.',
    }
  }

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} İş İlanları`,
    description: `${cityName} İŞKUR açık iş ilanları. ${siteName}'de güncel kariyer fırsatlarını inceleyin.`,
  }
}

/**
 * Public /is-ilanlari stub — mirrors /etkinlik, /spor, /ilceler.
 * City hosts resolve via headers; national host has no board → home.
 * Middleware also rewrites to /city-site/is-ilanlari; this route must exist
 * in the App Router manifest or Vercel serves a sticky CDN 404.
 */
export default async function IsIlanlariPage() {
  const citySlug = await getCitySlugFromHeaders()

  if (!citySlug) {
    redirect(ROUTES.HOME)
  }

  const cityName = getCityCategoryName(citySlug)
  const [initialJobs, setup, navPresence] = await Promise.all([
    getCityJobListingsServer(citySlug),
    Promise.resolve(getJobSyncSetupStatus()),
    getCityNavPresence(citySlug),
  ])

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
      categories={navPresence.categories}
      hasSpor={navPresence.hasSpor}
    >
      <CityJobsClient
        citySlug={citySlug}
        cityName={cityName}
        initialJobs={initialJobs}
        syncConfigured={setup.configured}
        missingEnv={setup.missing}
      />
    </CityLayoutClient>
  )
}
