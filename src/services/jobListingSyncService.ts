/**
 * İŞKUR → Apify → Firestore sync.
 *
 * Actor: sevimliai/iskur-ilan-scraper-email
 * Supports province filter via input `il` (e.g. "ÇANAKKALE").
 *
 * Legal/ops: data comes from İŞKUR via a third-party scraper. Do not invent
 * listings. Public UI must show “Kaynak: İŞKUR”.
 *
 * Cost: ~$3 / 1000 results — sync only cities in ISKUR_SYNC_CITIES (default
 * canakkale). Requires APIFY_TOKEN + İŞKUR login + SMTP credentials.
 *
 * Env (never commit):
 *   APIFY_TOKEN
 *   ISKUR_TC_KIMLIK_NO, ISKUR_SIFRE
 *   ISKUR_EMAIL_RECIPIENT, ISKUR_EMAIL_SENDER, ISKUR_EMAIL_PASSWORD
 *   optional: ISKUR_SMTP_HOST, ISKUR_SMTP_PORT, ISKUR_EMAIL_SUBJECT_PREFIX,
 *             ISKUR_ISYERI_TURU, ISKUR_ILAN_TARIHI, ISKUR_ILAN_TURU,
 *             ISKUR_SYNC_CITIES (comma-separated slugs, default canakkale)
 *
 * Operator risk: actor requires a real İŞKUR account (TC+şifre); ToS/compliance
 * is on the operator. Product UX uses Firestore dataset items, not email.
 */

import type { Firestore } from 'firebase-admin/firestore'
import { getCityCategoryName, isTurkishProvinceSlug } from '@/constants/cities'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import type {
  JobListing,
  JobListingKind,
  JobListingSyncResult,
} from '@/types/jobListing'

const ACTOR_ID = 'sevimliai~iskur-ilan-scraper-email'
const WRITE_BATCH_SIZE = 400
const META_DOC_PATH = 'meta/jobListingSync'
const DEFAULT_CITIES = ['canakkale']
/** Actor enum: "2"|"3"|"4" — "4" = broadest date window (more listings). */
const DEFAULT_ILAN_TARIHI = '4'


function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.replace(/[^\d.-]/g, ''))
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

/** Parse loose TR date strings into ISO when possible. */
function parseLooseDate(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const isoTry = Date.parse(trimmed)
  if (!Number.isNaN(isoTry)) return new Date(isoTry).toISOString()

  // dd.MM.yyyy or dd/MM/yyyy
  const m = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2])
    const year = Number(m[3])
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

function normalizeKind(raw: string | null): JobListingKind {
  if (!raw) return 'other'
  const t = raw.toLocaleLowerCase('tr-TR')
  if (t.includes('iup')) return 'iup'
  if (t.includes('typ')) return 'typ'
  if (t.includes('normal')) return 'normal'
  return 'other'
}

function buildIskurDetailUrl(ilanNo: string, employerType: string | null): string {
  const turu =
    employerType && /kamu/i.test(employerType)
      ? 'Kamu'
      : employerType && /ozel|özel/i.test(employerType)
        ? 'Ozel'
        : 'Ozel'
  return `https://esube.iskur.gov.tr/Istihdam/AcikIsIlanDetay.aspx?uiID=${encodeURIComponent(ilanNo)}&isyeriTuru=${turu}`
}

function toIskurIlName(citySlug: string): string {
  return getCityCategoryName(citySlug).toLocaleUpperCase('tr-TR')
}

export function resolveIskurSyncCities(): string[] {
  const fromEnv = process.env.ISKUR_SYNC_CITIES?.trim()
  const raw = fromEnv
    ? fromEnv.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_CITIES
  const unique = [...new Set(raw)].filter(isTurkishProvinceSlug)
  return unique.length > 0 ? unique : DEFAULT_CITIES
}

function isApifyConfigured(): { ok: true } | { ok: false; reason: string } {
  if (!process.env.APIFY_TOKEN?.trim()) {
    return { ok: false, reason: 'APIFY_TOKEN missing' }
  }
  if (!process.env.ISKUR_TC_KIMLIK_NO?.trim() || !process.env.ISKUR_SIFRE?.trim()) {
    return {
      ok: false,
      reason: 'ISKUR_TC_KIMLIK_NO / ISKUR_SIFRE missing (actor requires İŞKUR login)',
    }
  }
  if (
    !process.env.ISKUR_EMAIL_RECIPIENT?.trim() ||
    !process.env.ISKUR_EMAIL_SENDER?.trim() ||
    !process.env.ISKUR_EMAIL_PASSWORD?.trim()
  ) {
    return {
      ok: false,
      reason:
        'ISKUR_EMAIL_RECIPIENT / ISKUR_EMAIL_SENDER / ISKUR_EMAIL_PASSWORD missing (actor requires SMTP)',
    }
  }
  return { ok: true }
}

/** OpenAPI-aligned actor input. `il` must be uppercase Turkish province name. */
function buildActorInput(citySlug: string): Record<string, unknown> {
  return {
    tcKimlikNo: process.env.ISKUR_TC_KIMLIK_NO!.trim(),
    sifre: process.env.ISKUR_SIFRE!.trim(),
    recipientEmail: process.env.ISKUR_EMAIL_RECIPIENT!.trim(),
    senderEmail: process.env.ISKUR_EMAIL_SENDER!.trim(),
    emailPassword: process.env.ISKUR_EMAIL_PASSWORD!.trim(),
    smtpHost: process.env.ISKUR_SMTP_HOST?.trim() || 'smtp.yandex.com',
    smtpPort: Number(process.env.ISKUR_SMTP_PORT?.trim() || '587') || 587,
    emailSubjectPrefix: process.env.ISKUR_EMAIL_SUBJECT_PREFIX?.trim() || 'NaHaber İŞKUR',
    isyeriTuru: process.env.ISKUR_ISYERI_TURU?.trim() || 'ozel',
    il: toIskurIlName(citySlug),
    ilanTarihi: process.env.ISKUR_ILAN_TARIHI?.trim() || DEFAULT_ILAN_TARIHI,
    ilanTuru: process.env.ISKUR_ILAN_TURU?.trim() || 'hepsi',
    // Actor default excludes "KADİRLİ"; empty = no extra geo filter
    excludedKeywords: [],
  }
}

/**
 * Normalize Apify dataset rows. Field names vary; we accept common Turkish /
 * camelCase variants and never invent missing titles.
 */
export function normalizeApifyJobItem(
  item: unknown,
  citySlug: string,
  fetchedAt: string
): JobListing | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>

  const sourceId =
    pickString(row, [
      'ilanNo',
      'ilan_no',
      'ilanNumarasi',
      'ilanNumara',
      'uiID',
      'id',
      'listingId',
    ]) ?? null
  const title =
    pickString(row, [
      'meslek',
      'meslekAdi',
      'meslekAdı',
      'title',
      'pozisyon',
      'position',
      'ilanBasligi',
      'ilanBaşlığı',
    ]) ?? null

  if (!sourceId && !title) return null
  if (!title) return null

  const employer = pickString(row, [
    'isveren',
    'işveren',
    'isverenAdi',
    'işverenAdı',
    'employer',
    'company',
    'firma',
    'yuklenici',
    'yüklenici',
  ])
  const employerType = pickString(row, [
    'isverenTuru',
    'işverenTürü',
    'isyeriTuru',
    'işyeriTürü',
    'employerType',
  ])
  const district = pickString(row, ['ilce', 'ilçe', 'district', 'calismaIlce'])
  const locationLabel =
    pickString(row, [
      'calismaYeri',
      'çalışmaYeri',
      'location',
      'lokasyon',
      'adres',
      'ilIlce',
    ]) ??
    ([getCityCategoryName(citySlug), district].filter(Boolean).join(' / ') || null)

  const applyUrlRaw = pickString(row, [
    'detayUrl',
    'detailUrl',
    'url',
    'applyUrl',
    'basvuruUrl',
    'link',
  ])
  const idKey = sourceId ?? Buffer.from(`${citySlug}:${title}:${employer ?? ''}`).toString('base64url').slice(0, 24)
  const applyUrl =
    applyUrlRaw ||
    (sourceId ? buildIskurDetailUrl(sourceId, employerType) : null)

  const deadlineAt = parseLooseDate(
    pickString(row, [
      'sonBasvuruTarihi',
      'sonBaşvuruTarihi',
      'deadline',
      'applicationDeadline',
      'bitisTarihi',
      'bitişTarihi',
    ])
  )
  const publishedAt = parseLooseDate(
    pickString(row, ['ilanTarihi', 'publishedAt', 'yayinTarihi', 'yayınTarihi'])
  )

  const listing: JobListing = {
    id: `iskur_${idKey}`,
    citySlug,
    cityName: getCityCategoryName(citySlug),
    title,
    employer,
    employerType,
    district,
    locationLabel,
    workType: pickString(row, ['calismaSekli', 'çalışmaŞekli', 'workType', 'periyot']),
    openPositions: pickNumber(row, ['acikPozisyon', 'açıkPozisyon', 'openPositions', 'kontenjan']),
    deadlineAt,
    publishedAt,
    applyUrl,
    source: 'iskur',
    sourceId: idKey,
    listingKind: normalizeKind(
      pickString(row, ['ilanTuru', 'ilanTürü', 'listingKind', 'type'])
    ),
    isActive: true,
    fetchedAt,
    syncedAt: fetchedAt,
  }

  return listing
}

/** run-sync-get-dataset-items hard-caps at 300s; Antalya exceeds that. */
const APIFY_RUN_URL = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs`
const APIFY_POLL_MS = 8_000
const APIFY_MAX_WAIT_MS = 720_000

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

async function fetchApifyJobsForCity(citySlug: string): Promise<unknown[]> {
  const token = process.env.APIFY_TOKEN!.trim()
  const q = `token=${encodeURIComponent(token)}`

  const startRes = await fetch(`${APIFY_RUN_URL}?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildActorInput(citySlug)),
    signal: AbortSignal.timeout(60_000),
  })
  if (!startRes.ok) {
    const body = await startRes.text().catch(() => '')
    throw new Error(`Apify start ${startRes.status} for ${citySlug}: ${body.slice(0, 300)}`)
  }

  const started = (await startRes.json()) as {
    data?: { id?: string; defaultDatasetId?: string; status?: string }
  }
  const runId = started.data?.id
  let datasetId = started.data?.defaultDatasetId
  if (!runId) {
    throw new Error(`Apify start missing run id for ${citySlug}`)
  }

  const deadline = Date.now() + APIFY_MAX_WAIT_MS
  let status = started.data?.status || 'RUNNING'

  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
    if (Date.now() > deadline) {
      throw new Error(`Apify async poll timed out for ${citySlug} (run=${runId})`)
    }
    await sleep(APIFY_POLL_MS)
    const pollRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?${q}`,
      { signal: AbortSignal.timeout(30_000) }
    )
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => '')
      throw new Error(`Apify poll ${pollRes.status} for ${citySlug}: ${body.slice(0, 200)}`)
    }
    const poll = (await pollRes.json()) as {
      data?: { status?: string; defaultDatasetId?: string }
    }
    status = poll.data?.status || status
    if (poll.data?.defaultDatasetId) datasetId = poll.data.defaultDatasetId
  }

  if (status !== 'SUCCEEDED' || !datasetId) {
    throw new Error(`Apify run ${status} for ${citySlug} (run=${runId})`)
  }

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?${q}&clean=true`,
    { signal: AbortSignal.timeout(120_000) }
  )
  if (!itemsRes.ok) {
    const body = await itemsRes.text().catch(() => '')
    throw new Error(`Apify dataset ${itemsRes.status} for ${citySlug}: ${body.slice(0, 300)}`)
  }

  return flattenApifyDataset(await itemsRes.json())
}


/**
 * Actor returns category wrappers:
 * `{ ilanTuru, toplamIlanSayisi, ilanlar: [...] }` — not flat job rows.
 * Flatten `ilanlar` so normalizeApifyJobItem sees real listings.
 */
export function flattenApifyDataset(data: unknown): unknown[] {
  const roots: unknown[] = []
  if (Array.isArray(data)) roots.push(...data)
  else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (Array.isArray(obj.items)) roots.push(...obj.items)
    else if (Array.isArray(obj.data)) roots.push(...obj.data)
    else roots.push(data)
  }

  const out: unknown[] = []
  for (const row of roots) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    if (Array.isArray(r.ilanlar)) {
      for (const job of r.ilanlar) out.push(job)
      continue
    }
    // Already a flat job row (or empty status object without title → skipped later)
    if (r.meslek || r.ilanNo || r.title || r.pozisyon) out.push(row)
  }
  return out
}

async function upsertListings(
  db: Firestore,
  listings: JobListing[]
): Promise<{ upserted: number; skipped: number }> {
  let upserted = 0
  let skipped = 0

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

  return { upserted, skipped }
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
    .where('source', '==', 'iskur')
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

export async function syncIskurJobListings(): Promise<JobListingSyncResult> {
  const started = Date.now()
  const cities = resolveIskurSyncCities()
  const config = isApifyConfigured()

  if (!config.ok) {
    console.warn(`[jobListingSync] skipped — ${config.reason}`)
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

  const db = getAdminFirestore()
  const fetchedAt = new Date().toISOString()
  let scraped = 0
  let upserted = 0
  let skipped = 0
  let markedInactive = 0
  const failedCities: string[] = []

  // Sequential city runs — actor is login-based; parallel would thrash the same account.
  for (const citySlug of cities) {
    try {
      console.log(`[jobListingSync] Apify pull for ${citySlug} (il=${toIskurIlName(citySlug)})`)
      const items = await fetchApifyJobsForCity(citySlug)
      const listings: JobListing[] = []
      const seen = new Set<string>()

      for (const item of items) {
        const normalized = normalizeApifyJobItem(item, citySlug, fetchedAt)
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
      const write = await upsertListings(db, listings)
      upserted += write.upserted
      skipped += write.skipped
      markedInactive += await markMissingInactive(db, citySlug, seen, fetchedAt)
      console.log(
        `[jobListingSync] ${citySlug}: scraped=${listings.length} upserted=${write.upserted} inactive+=${markedInactive}`
      )
    } catch (err) {
      failedCities.push(citySlug)
      console.error(`[jobListingSync] failed for ${citySlug}:`, err)
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
    console.warn('[jobListingSync] meta write failed:', err)
  }

  return result
}
