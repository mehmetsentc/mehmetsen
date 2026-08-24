import { unstable_cache } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  DUTY_PHARMACIES_CACHE_TAG,
  dutyPharmacyDocId,
  isDutyPharmacyCity,
} from '@/lib/dutyPharmacies/constants'
import type { DutyPharmacySnapshot } from '@/types/dutyPharmacy'

function isSnapshot(value: unknown): value is DutyPharmacySnapshot {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<DutyPharmacySnapshot>
  return Array.isArray(row.groups) && typeof row.citySlug === 'string'
}

const getDutyPharmaciesCached = unstable_cache(
  async (citySlug: string): Promise<DutyPharmacySnapshot | null> => {
    if (!isDutyPharmacyCity(citySlug)) return null
    try {
      const snap = await getAdminFirestore()
        .collection(Collections.DUTY_PHARMACIES)
        .doc(dutyPharmacyDocId(citySlug))
        .get()
      if (!snap.exists) return null
      const data = snap.data()
      return isSnapshot(data) ? data : null
    } catch (error) {
      console.error('[getDutyPharmaciesServer]', error)
      return null
    }
  },
  ['duty-pharmacies'],
  { revalidate: 120, tags: [DUTY_PHARMACIES_CACHE_TAG] }
)

export async function getDutyPharmaciesServer(
  citySlug: string
): Promise<DutyPharmacySnapshot | null> {
  return getDutyPharmaciesCached(citySlug)
}
