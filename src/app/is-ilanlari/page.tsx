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
import { getApprovedJobClassifiedsServer } from '@/services/jobClassifiedService.server'
import { getCityNavPresence } from '@/services/cityNewsService.server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) {
    return {
      title: 'İş İlanları',
      description: 'Şehir iş ilanları (Kariyer.net, İŞKUR).',
    }
  }

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} İş İlanları`,
    description: `${cityName} iş ilanları (Kariyer.net, İŞKUR). ${siteName}'de güncel kariyer fırsatlarını inceleyin.`,
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
  const [initialJobs, setup, navPresence, employerClassifieds, seekerClassifieds] =
    await Promise.all([
      getCityJobListingsServer(citySlug),
      Promise.resolve(getJobSyncSetupStatus()),
      getCityNavPresence(citySlug),
      getApprovedJobClassifiedsServer(citySlug, 'employer'),
      getApprovedJobClassifiedsServer(citySlug, 'seeker'),
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
        employerClassifieds={employerClassifieds}
        seekerClassifieds={seekerClassifieds}
        syncConfigured={setup.configured}
        missingEnv={setup.missing}
      />
    </CityLayoutClient>
  )
}
