import type { Firestore } from 'firebase-admin/firestore'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { buildEventFingerprint, dedupeEvents } from '@/lib/eventDedupe'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { eventProviders, getEnabledProviders } from '@/services/eventProviders'
import { providerLog } from '@/services/eventProviders/shared'
import type { EventTimelineStatus, NaEvent } from '@/types/event'

/**
 * Daily server-side sync: scrape Biletix / Bubilet / Biletino for all 81
 * provinces, upsert into Firestore `events`, then mark elapsed events as past.
 *
 * Incremental writes: unchanged events (matching `fingerprint`) are skipped so
 * each run does not rewrite the full collection. Events missing from a
 * successful provider feed are soft-removed (`status: cancelled`).
 *
 * Invoked from `/api/events/sync` (cron or admin) and never from the client
 * events page — reads stay a single fast Firestore query.
 */

const CITY_CONCURRENCY = 4
const WRITE_BATCH_SIZE = 400
const MARK_PAST_BATCH_SIZE = 400
const MARK_REMOVED_BATCH_SIZE = 400
const META_DOC_PATH = 'meta/eventSync'

export interface EventSyncResult {
  providers: string[]
  citiesScanned: number
  scraped: number
  inserted: number
  updated: number
  skipped: number
  markedPast: number
  markedRemoved: number
  failedProviders: string[]
  completedAt: string
  durationMs: number
}

function parseSourceHash(eventId: string, source?: string): string {
  if (source && eventId.startsWith(`${source}_`)) {
    return eventId.slice(source.length + 1)
  }
  const idx = eventId.indexOf('_')
  return idx >= 0 ? eventId.slice(idx + 1) : eventId
}

function timelineStatusFor(startsAt: string, nowIso: string): EventTimelineStatus {
  return startsAt >= nowIso ? 'upcoming' : 'past'
}

function toFirestorePayload(
  event: NaEvent,
  syncedAt: string,
  nowIso: string
): Omit<NaEvent, 'id'> {
  const source = event.source ?? 'unknown'
  const sourceHash = event.sourceHash ?? parseSourceHash(event.id, source)
  const { id: _id, ...rest } = event
  return {
    ...rest,
    status: event.status ?? 'published',
    source,
    sourceId: event.sourceId ?? event.externalId ?? sourceHash,
    sourceHash,
    fingerprint: event.fingerprint ?? buildEventFingerprint(event),
    timelineStatus: event.timelineStatus ?? timelineStatusFor(event.startsAt, nowIso),
    syncedAt,
  }
}

async function scrapeAllCities(): Promise<{
  events: NaEvent[]
  providers: string[]
  failedProviders: string[]
  citiesScanned: number
}> {
  const enabled = getEnabledProviders()
  if (enabled.length === 0) {
    providerLog('sync', `no providers enabled (${eventProviders.length} registered)`)
    return { events: [], providers: [], failedProviders: [], citiesScanned: 0 }
  }

  const citySlugs = TURKISH_PROVINCES.map((p) => p.slug)
  const merged: NaEvent[] = []
  const failedProviders = new Set<string>()

  // National Biletix pull (no city filter) catches events missing a city facet.
  providerLog('sync', 'fetching national Biletix feed')
  const nationalSettled = await Promise.allSettled(
    enabled
      .filter((p) => p.id === 'biletix')
      .map((provider) => provider.fetchEvents({}))
  )
  for (const outcome of nationalSettled) {
    if (outcome.status === 'fulfilled') merged.push(...outcome.value)
    else failedProviders.add('biletix')
  }

  const totalCities = citySlugs.length
  for (let i = 0; i < citySlugs.length; i += CITY_CONCURRENCY) {
    const batchEnd = Math.min(i + CITY_CONCURRENCY, totalCities)
    providerLog(
      'sync',
      `scraping cities ${i + 1}-${batchEnd}/${totalCities} (${enabled.map((p) => p.id).join(', ')})`
    )
    const batch = citySlugs.slice(i, i + CITY_CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (citySlug) => {
        const settled = await Promise.allSettled(
          enabled.map((provider) => provider.fetchEvents({ citySlug }))
        )
        const cityEvents: NaEvent[] = []
        settled.forEach((outcome, idx) => {
          const provider = enabled[idx]
          if (outcome.status === 'fulfilled') {
            cityEvents.push(...outcome.value)
          } else {
            failedProviders.add(provider.id)
            providerLog('sync', `provider ${provider.id} failed for ${citySlug}`, outcome.reason)
          }
        })
        return cityEvents
      })
    )
    for (const cityEvents of batchResults) merged.push(...cityEvents)
  }

  return {
    events: dedupeEvents(merged),
    providers: enabled.map((p) => p.id),
    failedProviders: [...failedProviders],
    citiesScanned: citySlugs.length,
  }
}

async function loadExistingEvents(
  db: Firestore,
  events: NaEvent[]
): Promise<Map<string, Partial<NaEvent>>> {
  const existing = new Map<string, Partial<NaEvent>>()
  if (events.length === 0) return existing

  for (let i = 0; i < events.length; i += 100) {
    const slice = events.slice(i, i + 100)
    const refs = slice.map((event) => db.collection(Collections.EVENTS).doc(event.id))
    const snaps = await db.getAll(...refs)
    for (const snap of snaps) {
      if (snap.exists) existing.set(snap.id, snap.data() as Partial<NaEvent>)
    }
  }

  return existing
}

function isUnchanged(
  event: NaEvent,
  existing: Partial<NaEvent> | undefined,
  nowIso: string
): boolean {
  if (!existing) return false

  const nextFingerprint = event.fingerprint ?? buildEventFingerprint(event)
  const storedFingerprint = existing.fingerprint as string | undefined
  const nextTimeline = timelineStatusFor(event.startsAt, nowIso)
  const storedTimeline = existing.timelineStatus as EventTimelineStatus | undefined

  if (!storedFingerprint) return false

  return storedFingerprint === nextFingerprint && storedTimeline === nextTimeline
}

async function upsertEvents(
  db: Firestore,
  events: NaEvent[]
): Promise<{ inserted: number; updated: number; skipped: number }> {
  if (events.length === 0) return { inserted: 0, updated: 0, skipped: 0 }

  const syncedAt = new Date().toISOString()
  const nowIso = syncedAt
  const existingById = await loadExistingEvents(db, events)

  let inserted = 0
  let updated = 0
  let skipped = 0
  const pending: NaEvent[] = []

  for (const event of events) {
    const existing = existingById.get(event.id)
    if (isUnchanged(event, existing, nowIso)) {
      skipped += 1
      continue
    }
    pending.push(event)
    if (existing) updated += 1
    else inserted += 1
  }

  for (let i = 0; i < pending.length; i += WRITE_BATCH_SIZE) {
    const slice = pending.slice(i, i + WRITE_BATCH_SIZE)
    const batch = db.batch()

    for (const event of slice) {
      const ref = db.collection(Collections.EVENTS).doc(event.id)
      const payload = toFirestorePayload(event, syncedAt, nowIso)
      batch.set(ref, payload, { merge: true })
    }

    await batch.commit()
  }

  return { inserted, updated, skipped }
}

async function markPastEvents(db: Firestore): Promise<number> {
  const nowIso = new Date().toISOString()
  let markedPast = 0

  // Query only by startsAt — no composite index needed.
  // Skip docs already marked past to avoid unnecessary writes.
  while (true) {
    const snap = await db
      .collection(Collections.EVENTS)
      .where('startsAt', '<', nowIso)
      .limit(MARK_PAST_BATCH_SIZE)
      .get()

    if (snap.empty) break

    const batch = db.batch()
    let batchHasOps = false
    for (const doc of snap.docs) {
      if (doc.data().timelineStatus !== 'past') {
        batch.update(doc.ref, { timelineStatus: 'past', syncedAt: nowIso })
        markedPast += 1
        batchHasOps = true
      }
    }
    if (batchHasOps) await batch.commit()

    if (snap.size < MARK_PAST_BATCH_SIZE) break
  }

  return markedPast
}

/**
 * Soft-remove provider events that disappeared from a successful provider feed.
 * Skipped for providers that failed during this run to avoid mass false positives.
 */
async function markRemovedEvents(
  db: Firestore,
  scrapedIds: Set<string>,
  successfulProviders: string[]
): Promise<number> {
  if (successfulProviders.length === 0) return 0

  const nowIso = new Date().toISOString()
  let markedRemoved = 0

  for (const providerId of successfulProviders) {
    while (true) {
      const snap = await db
        .collection(Collections.EVENTS)
        .where('source', '==', providerId)
        .where('status', '==', 'published')
        .where('timelineStatus', '==', 'upcoming')
        .limit(MARK_REMOVED_BATCH_SIZE)
        .get()

      if (snap.empty) break

      const batch = db.batch()
      let batchCount = 0

      for (const doc of snap.docs) {
        if (!scrapedIds.has(doc.id)) {
          batch.update(doc.ref, {
            status: 'cancelled',
            syncedAt: nowIso,
          })
          markedRemoved += 1
          batchCount += 1
        }
      }

      if (batchCount > 0) await batch.commit()
      if (snap.size < MARK_REMOVED_BATCH_SIZE) break
    }
  }

  return markedRemoved
}

async function saveSyncMeta(db: Firestore, result: EventSyncResult): Promise<void> {
  const { durationMs: _durationMs, completedAt: _completedAt, ...stats } = result
  await db.doc(META_DOC_PATH).set(
    {
      ...stats,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
    },
    { merge: true }
  )
}

export const eventSyncService = {
  async syncEvents(): Promise<EventSyncResult> {
    const started = Date.now()
    const db = getAdminFirestore()

    providerLog('sync', 'starting daily event sync')
    const { events, providers, failedProviders, citiesScanned } = await scrapeAllCities()
    providerLog('sync', `scraped ${events.length} unique event(s) from ${citiesScanned} cities`)

    providerLog('sync', `upserting ${events.length} event(s) to Firestore`)
    const { inserted, updated, skipped } = await upsertEvents(db, events)
    providerLog('sync', `upsert done: ${inserted} inserted, ${updated} updated, ${skipped} unchanged`)

    const successfulProviders = providers.filter((id) => !failedProviders.includes(id))
    const scrapedIds = new Set(events.map((e) => e.id))
    providerLog('sync', 'marking removed provider events')
    const markedRemoved = await markRemovedEvents(db, scrapedIds, successfulProviders)
    providerLog('sync', 'marking past events')
    const markedPast = await markPastEvents(db)

    const completedAt = new Date().toISOString()
    const durationMs = Date.now() - started
    const result: EventSyncResult = {
      providers,
      citiesScanned,
      scraped: events.length,
      inserted,
      updated,
      skipped,
      markedPast,
      markedRemoved,
      failedProviders,
      completedAt,
      durationMs,
    }

    await saveSyncMeta(db, result)
    console.log('[eventSync]', JSON.stringify(result))
    return result
  },
}
