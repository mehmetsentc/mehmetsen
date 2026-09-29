import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { JobListing } from '@/types/jobListing'

/**
 * Board window. The old cap of 120 made every city with a fuller İŞKUR/Kariyer
 * pull display exactly “120 ilan”. 400 is the on-page window; `totalActive`
 * is the real active count in Firestore.
 */
const CITY_JOB_FETCH_LIMIT = 400

export interface CityJobBoardData {
  listings: JobListing[]
  /** True when the open-listing window was filled and more rows may exist. */
  capped: boolean
  /** Active rows for the city, including ones outside the page window. */
  totalActive: number | null
}

function toListing(doc: QueryDocumentSnapshot): JobListing {
  return { id: doc.id, ...(doc.data() as Omit<JobListing, 'id'>) }
}

function isStillOpen(listing: JobListing, nowMs: number): boolean {
  if (!listing.deadlineAt) return true
  const t = Date.parse(listing.deadlineAt)
  if (Number.isNaN(t)) return true
  // Keep listings whose deadline day has not fully passed (Istanbul-ish grace: end of day UTC+3 ≈ +21h from midnight UTC date)
  return t + 24 * 60 * 60 * 1000 >= nowMs
}

/**
 * City SSR prefetch for /is-ilanlari.
 * Order by fetchedAt only — Kariyer rows often have deadlineAt=null; ordering
 * by that field can yield empty results / missing composite indexes.
 */
export async function getCityJobListingsServer(
  citySlug: string,
  limit = CITY_JOB_FETCH_LIMIT
): Promise<CityJobBoardData> {
  try {
    const db = getAdminFirestore()
    const nowMs = Date.now()
    const queryLimit = limit * 2

    const [snap, totalActive] = await Promise.all([
      (async () => {
        try {
          return await db
            .collection(Collections.JOB_LISTINGS)
            .where('citySlug', '==', citySlug)
            .where('isActive', '==', true)
            .orderBy('fetchedAt', 'desc')
            .limit(queryLimit)
            .get()
        } catch (err) {
          console.warn('[getCityJobListingsServer] indexed query failed, plain filter:', err)
          return db
            .collection(Collections.JOB_LISTINGS)
            .where('citySlug', '==', citySlug)
            .where('isActive', '==', true)
            .limit(limit * 3)
            .get()
        }
      })(),
      db
        .collection(Collections.JOB_LISTINGS)
        .where('citySlug', '==', citySlug)
        .where('isActive', '==', true)
        .count()
        .get()
        .then((agg) => agg.data().count)
        .catch((err) => {
          console.warn('[getCityJobListingsServer] count failed:', err)
          return null
        }),
    ])

    const open = snap.docs
      .map(toListing)
      .filter((l) => isStillOpen(l, nowMs))
      .sort((a, b) => {
        const da = a.deadlineAt ?? '9999'
        const db_ = b.deadlineAt ?? '9999'
        if (da !== db_) return da.localeCompare(db_)
        return (b.fetchedAt || '').localeCompare(a.fetchedAt || '')
      })

    const capped = open.length > limit || (open.length >= limit && snap.size >= queryLimit)

    return {
      listings: open.slice(0, limit),
      capped,
      totalActive,
    }
  } catch (err) {
    console.error('[getCityJobListingsServer]', err)
    return { listings: [], capped: false, totalActive: null }
  }
}

export async function getCityJobListingById(
  id: string,
  citySlug: string
): Promise<JobListing | null> {
  try {
    const db = getAdminFirestore()
    const doc = await db.collection(Collections.JOB_LISTINGS).doc(id).get()
    if (!doc.exists) return null
    const data = doc.data()
    if (!data) return null
    const listing: JobListing = { id: doc.id, ...(data as Omit<JobListing, 'id'>) }
    if (listing.citySlug !== citySlug || !listing.isActive) return null
    if (!isStillOpen(listing, Date.now())) return null
    return listing
  } catch (err) {
    console.error('[getCityJobListingById]', err)
    return null
  }
}

/** Whether job sync can run. Kariyer needs only APIFY_TOKEN. */
export function getJobSyncSetupStatus(): {
  configured: boolean
  missing: string[]
} {
  const missing: string[] = []
  if (!process.env.APIFY_TOKEN?.trim()) missing.push('APIFY_TOKEN')
  return { configured: missing.length === 0, missing }
}
