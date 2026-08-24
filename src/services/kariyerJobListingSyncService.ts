/**
 * Kariyer.net → Apify → Firestore sync (city-scoped listing URLs).
 *
 * Actor: fatihtahta/kariyer-net-scraper
 * Prefer per-city startUrls (e.g. …/is-ilanlari/canakkale) — not TR-wide crawl.
 *
 * Legal/ops: third-party scrape of public listings; attribute “Kaynak: Kariyer.net”.
 * ToS risk is on the operator. Product UX uses Firestore; apply opens kariyer.net.
 *
 * Env:
 *   APIFY_TOKEN (required)
 *   KARIYER_SYNC_CITIES (optional, default ISKUR_SYNC_CITIES or canakkale)
 *   KARIYER_LIMIT (optional, default 200)
 */

import type { Firestore } from 'firebase-admin/firestore'
import { getCityCategoryName, isTurkishProvinceSlug } from '@/constants/cities'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import type { JobListing, JobListingSyncResult } from '@/types/jobListing'

const ACTOR_ID = 'fatihtahta~kariyer-net-scraper'
const APIFY_SYNC_URL = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items`
const WRITE_BATCH_SIZE = 400
const META_DOC_PATH = 'meta/kariyerJobListingSync'
const DEFAULT_CITIES = ['canakkale']
const DEFAULT_LIMIT = 200

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

/** Kariyer listing path uses ASCII province slug (canakkale, istanbul, …). */
export function buildKariyerListingUrl(citySlug: string): string {
  const slug = citySlug.trim().toLowerCase()
  return `https://www.kariyer.net/is-ilanlari/${encodeURIComponent(slug)}`
}

export function resolveKariyerSyncCities(cityFilter?: string | null): string[] {
  const fromEnv =
    process.env.KARIYER_SYNC_CITIES?.trim() || process.env.ISKUR_SYNC_CITIES?.trim()
  const raw = fromEnv
    ? fromEnv.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_CITIES
  const unique = [...new Set(raw)].filter(isTurkishProvinceSlug)
  const allowed = unique.length > 0 ? unique : DEFAULT_CITIES
  if (!cityFilter?.trim()) return allowed
  const slug = cityFilter.trim().toLowerCase()
  if (!isTurkishProvinceSlug(slug)) return []
  // Query narrows the env allowlist (does not add cities outside KARIYER/ISKUR_SYNC_CITIES).
  return allowed.includes(slug) ? [slug] : []
}

function resolveLimit(): number {
  const n = Number(process.env.KARIYER_LIMIT?.trim() || DEFAULT_LIMIT)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT
  return Math.min(Math.floor(n), 50_000)
}

function isConfigured(): { ok: true } | { ok: false; reason: string } {
  if (!process.env.APIFY_TOKEN?.trim()) {
    return { ok: false, reason: 'APIFY_TOKEN missing' }
  }
  return { ok: true }
}

/** Unwrap `{ outputrecord: job }` wrappers from the actor dataset. */
export function flattenKariyerDataset(data: unknown): Record<string, unknown>[] {
  const roots: unknown[] = []
  if (Array.isArray(data)) roots.push(...data)
  else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.items)) roots.push(...obj.items)
    else if (Array.isArray(obj.data)) roots.push(...obj.data)
    else roots.push(data)
  }

  const out: Record<string, unknown>[] = []
  for (const row of roots) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    if (r.outputrecord && typeof r.outputrecord === 'object') {
      out.push(r.outputrecord as Record<string, unknown>)
      continue
    }
    if (r.title || r.url || r.id) out.push(r)
  }
  return out
}

/**
 * Map Kariyer card fields → JobListing.
 * Listings-only actor: no full description; applyUrl is the public job URL.
 */
export function normalizeKariyerJobItem(
  item: unknown,
  citySlug: string,
  fetchedAt: string
): JobListing | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>

  const title = pickString(row, ['title', 'ilanBasligi', 'pozisyon'])
  if (!title) return null

  const applyUrl = pickString(row, ['url', 'applyUrl', 'link', 'detailUrl'])
  const sourceId =
    pickString(row, ['id', 'sourceId', 'listingId']) ??
    (applyUrl
      ? applyUrl.match(/(\d{5,})(?:\/)?$/)?.[1] ?? null
      : null) ??
    Buffer.from(`${citySlug}:${title}:${pickString(row, ['company']) ?? ''}`)
      .toString('base64url')
      .slice(0, 24)

  const location = pickString(row, ['location', 'lokasyon', 'city'])
  const workModel = pickString(row, ['workModel', 'calismaModeli'])
  const employmentType = pickString(row, ['employmentType', 'calismaSekli', 'workType'])
  const workType = [employmentType, workModel].filter(Boolean).join(' · ') || null

  const listing: JobListing = {
    id: `kariyer_${sourceId}`,
    citySlug,
    cityName: getCityCategoryName(citySlug),
    title,
    employer: pickString(row, ['company', 'employer', 'firma']),
    employerType: null,
    district: null,
    locationLabel: location ?? getCityCategoryName(citySlug),
    workType,
    openPositions: null,
    deadlineAt: null,
    publishedAt: null,
    applyUrl,
    source: 'kariyer',
    sourceId,
    listingKind: 'normal',
    isActive: true,
    fetchedAt,
    syncedAt: fetchedAt,
  }

  return listing
}

async function fetchKariyerJobsForCity(citySlug: string): Promise<Record<string, unknown>[]> {
  const token = process.env.APIFY_TOKEN!.trim()
  const limit = resolveLimit()
  const startUrl = buildKariyerListingUrl(citySlug)

  const res = await fetch(`${APIFY_SYNC_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startUrls: [startUrl],
      limit,
    }),
    signal: AbortSignal.timeout(280_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Apify Kariyer ${res.status} for ${citySlug}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as unknown
  return flattenKariyerDataset(data)
}

async function upsertListings(db: Firestore, listings: JobListing[]): Promise<number> {
  let upserted = 0
  for (let i = 0; i < listings.length; i += WRITE_BATCH_SIZE) {
    const slice = listings.slice(i, i + WRITE_BATCH_SIZE)
    const batch = db.batch()
    for (const listing of slice) {
      const ref = db.collection(Collections.JOB_LISTINGS).doc(listing.id)
      const { id: _id, raw: _raw, ...rest } = listing
      batch.set(ref, rest, { merge: true })
      upserted += 1
    }
    await batch.commit()
  }
  return upserted
}

async function markMissingInactive(
  db: Firestore,
  citySlug: string,
  seenIds: Set<string>,
  syncedAt: string
): Promise<number> {
  const snap = await db
    .collection(Collections.JOB_LISTINGS)
    .where('citySlug', '==', citySlug)
    .where('source', '==', 'kariyer')
    .where('isActive', '==', true)
    .get()

  let marked = 0
  let batch = db.batch()
  let ops = 0

  for (const doc of snap.docs) {
    if (seenIds.has(doc.id)) continue
    batch.update(doc.ref, { isActive: false, syncedAt })
    marked += 1
    ops += 1
    if (ops >= WRITE_BATCH_SIZE) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()
  return marked
}

export async function syncKariyerJobListings(options?: {
  city?: string | null
}): Promise<JobListingSyncResult> {
  const started = Date.now()
  const cities = resolveKariyerSyncCities(options?.city)
  const config = isConfigured()

  if (!config.ok) {
    console.warn(`[kariyerJobSync] skipped — ${config.reason}`)
    return {
      cities,
      scraped: 0,
      upserted: 0,
      skipped: 0,
      markedInactive: 0,
      skippedReason: config.reason,
      failedCities: [],
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    }
  }

  if (cities.length === 0) {
    const reason = options?.city?.trim()
      ? `city "${options.city.trim().toLowerCase()}" not in KARIYER/ISKUR_SYNC_CITIES`
      : 'no cities configured'
    console.warn(`[kariyerJobSync] skipped — ${reason}`)
    return {
      cities: [],
      scraped: 0,
      upserted: 0,
      skipped: 0,
      markedInactive: 0,
      skippedReason: reason,
      failedCities: [],
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    }
  }

  const db = getAdminFirestore()
  const fetchedAt = new Date().toISOString()
  let scraped = 0
  let upserted = 0
  let skipped = 0
  let markedInactive = 0
  const failedCities: string[] = []

  for (const citySlug of cities) {
    try {
      const url = buildKariyerListingUrl(citySlug)
      console.log(`[kariyerJobSync] Apify pull for ${citySlug} (${url})`)
      const items = await fetchKariyerJobsForCity(citySlug)
      const listings: JobListing[] = []
      const seen = new Set<string>()

      for (const item of items) {
        const normalized = normalizeKariyerJobItem(item, citySlug, fetchedAt)
        if (!normalized) {
          skipped += 1
          continue
        }
        if (seen.has(normalized.id)) {
          skipped += 1
          continue
        }
        seen.add(normalized.id)
        listings.push(normalized)
      }

      scraped += listings.length
      const wrote = await upsertListings(db, listings)
      upserted += wrote
      const inactive = await markMissingInactive(db, citySlug, seen, fetchedAt)
      markedInactive += inactive
      console.log(
        `[kariyerJobSync] ${citySlug}: scraped=${listings.length} upserted=${wrote} inactive+=${inactive}`
      )
    } catch (err) {
      failedCities.push(citySlug)
      console.error(`[kariyerJobSync] failed for ${citySlug}:`, err)
    }
  }

  const result: JobListingSyncResult = {
    cities,
    scraped,
    upserted,
    skipped,
    markedInactive,
    failedCities,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  }

  try {
    await db.doc(META_DOC_PATH).set(result, { merge: true })
  } catch (err) {
    console.warn('[kariyerJobSync] meta write failed:', err)
  }

  return result
}
