import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { JobListing } from '@/types/jobListing'

const CITY_JOB_FETCH_LIMIT = 120

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
 * City SSR prefetch for /is-ilanlari — active İŞKUR/manual listings only.
 * Prefer deadline ascending; fall back to fetchedAt when index/path fails.
 */
export async function getCityJobListingsServer(
  citySlug: string,
  limit = CITY_JOB_FETCH_LIMIT
): Promise<JobListing[]> {
  try {
    const db = getAdminFirestore()
    const nowMs = Date.now()

    let snap
    try {
      snap = await db
        .collection(Collections.JOB_LISTINGS)
        .where('citySlug', '==', citySlug)
        .where('isActive', '==', true)
        .orderBy('deadlineAt', 'asc')
        .limit(limit * 2)
        .get()
    } catch {
      snap = await db
        .collection(Collections.JOB_LISTINGS)
        .where('citySlug', '==', citySlug)
        .where('isActive', '==', true)
        .orderBy('fetchedAt', 'desc')
        .limit(limit * 2)
        .get()
    }

    const listings = snap.docs
      .map(toListing)
      .filter((l) => isStillOpen(l, nowMs))
      .sort((a, b) => {
        const da = a.deadlineAt ?? '9999'
        const db_ = b.deadlineAt ?? '9999'
        if (da !== db_) return da.localeCompare(db_)
        return (b.fetchedAt || '').localeCompare(a.fetchedAt || '')
      })
      .slice(0, limit)

    return listings
  } catch (err) {
    console.error('[getCityJobListingsServer]', err)
    return []
  }
}

/** Whether Apify + İŞKUR credentials look present (for empty-state admin blurb). */
export function getJobSyncSetupStatus(): {
  configured: boolean
  missing: string[]
} {
  const required = [
    'APIFY_TOKEN',
    'ISKUR_TC_KIMLIK_NO',
    'ISKUR_SIFRE',
    'ISKUR_EMAIL_RECIPIENT',
    'ISKUR_EMAIL_SENDER',
    'ISKUR_EMAIL_PASSWORD',
  ] as const

  const missing = required.filter((k) => !process.env[k]?.trim())
  return { configured: missing.length === 0, missing: [...missing] }
}
