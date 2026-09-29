import { getDistrictsForProvince } from '@/constants/cities'
import {
  buildClassifiedDetail,
  buildListingDetail,
  type JobDetailContent,
} from '@/lib/jobListingPresentation'
import { getApprovedJobClassifiedById } from '@/services/jobClassifiedService.server'
import { getCityJobListingById } from '@/services/jobListingService.server'

const CLASSIFIED_PREFIX = 'classified_'

export async function loadCityJobDetail(
  citySlug: string,
  id: string
): Promise<JobDetailContent | null> {
  const districts = getDistrictsForProvince(citySlug)

  if (id.startsWith(CLASSIFIED_PREFIX)) {
    const classified = await getApprovedJobClassifiedById(
      id.slice(CLASSIFIED_PREFIX.length),
      citySlug
    )
    if (!classified || classified.type !== 'employer') return null
    return buildClassifiedDetail(classified)
  }

  const listing = await getCityJobListingById(id, citySlug)
  if (!listing) return null

  return buildListingDetail(listing, districts, [])
}
