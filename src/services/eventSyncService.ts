import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { buildEventFingerprint, dedupeEvents } from '@/lib/eventDedupe'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { eventProviders, getEnabledProviders } from '@/services/eventProviders'
import { providerLog } from '@/services/eventProviders/shared'
import type { EventTimelineStatus, NaEvent } from '@/types/event'
import { isEventUpcoming } from '@/lib/eventUtils'

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

function timelineStatusFor(
  event: Pick<NaEvent, 'startsAt' | 'endsAt'>,
  nowIso: string
): EventTimelineStatus {
  return isEventUpcoming(event, nowIso) ? 'upcoming' : 'past'
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
    timelineStatus: event.timelineStatus ?? timelineStatusFor(event, nowIso),
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

  // Soft-removed / draft rows must be rewritten so a later successful scrape
  // can republish them. Skipping on fingerprint alone left Antalya (and other
  // cities) stuck on `cancelled` after a partial provider feed.
  const existingStatus = existing.status as NaEvent['status'] | undefined
  if (existingStatus === 'cancelled' || existingStatus === 'draft') return false

  const nextFingerprint = event.fingerprint ?? buildEventFingerprint(event)
  const storedFingerprint = existing.fingerprint as string | undefined
  const nextTimeline = timelineStatusFor(event, nowIso)
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

  // Cursor-based pagination prevents re-reading the same docs when nothing
  // needs updating (e.g. all past events already marked as 'past').
  let lastDoc: QueryDocumentSnapshot | null = null

  while (true) {
    let q = db
      .collection(Collections.EVENTS)
      .where('startsAt', '<', nowIso)
      .orderBy('startsAt')
      .limit(MARK_PAST_BATCH_SIZE)

    if (lastDoc) q = q.startAfter(lastDoc)

    const snap = await q.get()

    if (snap.empty) break

    lastDoc = snap.docs[snap.docs.length - 1]

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
 *
 * Also skipped for city×provider pairs that contributed zero scraped rows —
 * an empty successful response (rate-limit, blocked IP, facet miss) must not
 * wipe that city's published catalog.
 */
async function markRemovedEvents(
  db: Firestore,
  scrapedIds: Set<string>,
  successfulProviders: string[],
  scrapedCitiesByProvider: Map<string, Set<string>>
): Promise<number> {
  if (successfulProviders.length === 0) return 0

  const nowIso = new Date().toISOString()
  let markedRemoved = 0

  for (const providerId of successfulProviders) {
    const citiesWithHits = scrapedCitiesByProvider.get(providerId)
    if (!citiesWithHits || citiesWithHits.size === 0) continue

    // Use cursor-based pagination so we never re-read the same docs.
    // Without startAfter, the loop reads the same first 400 forever when
    // nothing is being cancelled — causing an infinite read loop.
    let lastDoc: QueryDocumentSnapshot | null = null

    while (true) {
      let q = db
        .collection(Collections.EVENTS)
        .where('source', '==', providerId)
        .where('status', '==', 'published')
        .where('timelineStatus', '==', 'upcoming')
        .orderBy('__name__')
        .limit(MARK_REMOVED_BATCH_SIZE)

      if (lastDoc) q = q.startAfter(lastDoc)

      const snap = await q.get()

      if (snap.empty) break

      lastDoc = snap.docs[snap.docs.length - 1]

      const batch = db.batch()
      let batchCount = 0

      for (const doc of snap.docs) {
        const citySlug = (doc.data().citySlug as string | undefined)?.trim()
        if (!citySlug || !citiesWithHits.has(citySlug)) continue
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

export interface OccurrenceCanaryUpsertResult {
  inserted: number
  updated: number
  skipped: number
  markedPast: 0
  markedRemoved: 0
  wroteMeta: false
  eventIds: string[]
}

export const eventSyncService = {
  /**
   * Çanakkale (or other scoped) occurrence canary.
   * Reuses upsertEvents only — never markRemoved, markPast, or sync meta.
   */
  async planOccurrenceUpserts(events: NaEvent[]): Promise<{
    wouldInsert: NaEvent[]
    wouldUpdate: NaEvent[]
    wouldSkipUnchanged: NaEvent[]
    wouldDelete: 0
  }> {
    const db = getAdminFirestore()
    const nowIso = new Date().toISOString()
    const existingById = await loadExistingEvents(db, events)
    const wouldInsert: NaEvent[] = []
    const wouldUpdate: NaEvent[] = []
    const wouldSkipUnchanged: NaEvent[] = []
    for (const event of events) {
      const existing = existingById.get(event.id)
      if (!existing) wouldInsert.push(event)
      else if (isUnchanged(event, existing, nowIso)) wouldSkipUnchanged.push(event)
      else wouldUpdate.push(event)
    }
    return { wouldInsert, wouldUpdate, wouldSkipUnchanged, wouldDelete: 0 }
  },

  async syncOccurrences(options: {
    mode?: 'shadow' | 'write'
    allowWrite?: boolean
    includeTicketmasterShadow?: boolean
    citySlugs?: string[]
    biletixStrategy?: import('@/services/eventProviders/biletixDiscovery').BiletixDiscoveryStrategy
    deadlineMs?: number
    cityConcurrency?: number
    resumable?: boolean
    persistCheckpoint?: boolean
    checkpointStore?: import('@/lib/eventSyncCheckpoint').OccurrenceCheckpointStore
    existingLoader?: (input?: { sources?: string[]; citySlugs?: string[] }) => Promise<import('@/types/event').NaEvent[]>
    biletimgoCities?: string[]
    nowIso?: string
  } = {}): Promise<import('@/services/eventProviders/occurrenceCron').OccurrenceCronSummary> {
    const { runOccurrenceCron, decideOccurrenceWrite } = await import('@/services/eventProviders/occurrenceCron')
    const {
      abortIfSuspiciousReinsert,
      classifyProposedMutation,
      providerOccurrenceKey,
    } = await import('@/services/eventProviders/occurrenceMutation')
    const discovery = await runOccurrenceCron({
      mode: options.mode === 'write' ? 'write' : 'shadow',
      allowWrite: options.allowWrite,
      includeTicketmasterShadow: options.includeTicketmasterShadow,
      citySlugs: options.citySlugs,
      biletixStrategy: options.biletixStrategy,
      deadlineMs: options.deadlineMs,
      cityConcurrency: options.cityConcurrency,
      resumable: options.resumable,
      persistCheckpoint: options.persistCheckpoint,
      checkpointStore: options.checkpointStore,
      existingLoader: options.existingLoader,
      biletimgoCities: options.biletimgoCities,
      nowIso: options.nowIso,
    })
    const planStarted = Date.now()
    const plan = await eventSyncService.planOccurrenceUpserts(discovery.writeable)
    discovery.timings = {
      ...discovery.timings,
      reconcileMs: (discovery.timings?.reconcileMs ?? 0) + (Date.now() - planStarted),
    }
    discovery.wouldInsert = plan.wouldInsert.length
    discovery.wouldUpdate = plan.wouldUpdate.length
    discovery.wouldSkipUnchanged = plan.wouldSkipUnchanged.length
    discovery.wouldDelete = 0
    discovery.firestoreEventWrites = 0
    discovery.inserted = 0
    discovery.updated = 0

    const writePlan: typeof discovery.writePlan = []
    const classes: typeof discovery.mutationClasses = {
      NEW_SOURCE_OCCURRENCE: 0,
      MATERIAL_UPDATE: 0,
      EXPECTED_REFRESH: 0,
      SUSPICIOUS_REINSERT: 0,
    }
    const classify = (event: NaEvent, operation: 'INSERT' | 'UPDATE' | 'SKIP') => {
      const key = providerOccurrenceKey(event)
      const existingId = discovery.existingByProviderKey[key]
      const classified = classifyProposedMutation({
        operation,
        incoming: event,
        existingById: operation === 'INSERT' ? null : { id: event.id, status: event.status },
        existingByProviderKey: existingId ? { id: existingId } : null,
      })
      classes[classified] += 1
      writePlan.push({
        province: event.citySlug || '',
        provider: event.source ?? '',
        eventId: event.id,
        title: event.title,
        operation,
      })
      return classified
    }
    for (const event of plan.wouldInsert) classify(event, 'INSERT')
    for (const event of plan.wouldUpdate) classify(event, 'UPDATE')
    for (const event of plan.wouldSkipUnchanged) classify(event, 'SKIP')
    discovery.writePlan = writePlan
    discovery.mutationClasses = classes

    const suspicious = abortIfSuspiciousReinsert([
      ...Array.from({ length: classes.SUSPICIOUS_REINSERT }, () => 'SUSPICIOUS_REINSERT' as const),
    ])
    const decision = decideOccurrenceWrite({
      mode: options.mode === 'write' ? 'write' : 'shadow',
      allowWrite: options.allowWrite,
      wouldDelete: plan.wouldDelete,
    })
    if (!suspicious.ok) {
      discovery.abortedWrite = true
      discovery.abortReason = 'suspicious_reinsert'
    } else if (decision.action === 'abort') {
      discovery.abortedWrite = true
      discovery.abortReason = decision.reason
    } else if (decision.action === 'write') {
      const { createFirestoreEventSyncLockStore, withEventSyncWriteLock } = await import('@/lib/eventSyncLock')
      const store = createFirestoreEventSyncLockStore(getAdminFirestore())
      try {
        const locked = await withEventSyncWriteLock(
          store,
          { runId: discovery.runId, mode: 'write', startedAt: discovery.startedAt },
          async () => eventSyncService.upsertOccurrencesOnly(discovery.writeable)
        )
        if (!locked.ok) {
          discovery.abortedWrite = true
          discovery.abortReason = 'write_locked'
          discovery.lockStatus = 'busy'
        } else {
          discovery.inserted = locked.value.inserted
          discovery.updated = locked.value.updated
          discovery.firestoreEventWrites = locked.value.inserted + locked.value.updated
          discovery.abortedWrite = false
          discovery.abortReason = null
          discovery.lockStatus = 'released'
        }
      } catch (error) {
        discovery.abortedWrite = true
        discovery.abortReason = error instanceof Error ? error.message : 'write_failed'
        discovery.lockStatus = 'released_after_error'
        throw error
      }
    }

    const { classifyOccurrenceRunHealth } = await import('@/lib/eventSyncRoutePolicy')
    discovery.runHealth = classifyOccurrenceRunHealth({
      abortedWrite: discovery.abortedWrite,
      abortReason: discovery.abortReason,
      wouldDelete: discovery.wouldDelete,
      suspiciousReinsert: classes.SUSPICIOUS_REINSERT,
      lockStatus: discovery.lockStatus,
      biletix: String(discovery.providerStatus.biletix ?? ''),
      bubilet: String(discovery.providerStatus.bubilet ?? ''),
      biletimgo: String(discovery.providerStatus.biletimgo ?? ''),
    })
    discovery.invocationHealth = discovery.runHealth
    discovery.configuration = {
      ...discovery.configuration,
      state: options.allowWrite ? 'OCCURRENCE_WRITE' : 'OCCURRENCE_SHADOW',
    }

    return { ...discovery, writeable: [], existingByProviderKey: {} }
  },

  async upsertOccurrencesOnly(events: NaEvent[]): Promise<OccurrenceCanaryUpsertResult> {
    const db = getAdminFirestore()
    const { inserted, updated, skipped } = await upsertEvents(db, events)
    return {
      inserted,
      updated,
      skipped,
      markedPast: 0,
      markedRemoved: 0,
      wroteMeta: false,
      eventIds: events.map((e) => e.id),
    }
  },

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
    const scrapedCitiesByProvider = new Map<string, Set<string>>()
    for (const event of events) {
      const source = event.source?.trim()
      const citySlug = event.citySlug?.trim()
      if (!source || !citySlug) continue
      let cities = scrapedCitiesByProvider.get(source)
      if (!cities) {
        cities = new Set()
        scrapedCitiesByProvider.set(source, cities)
      }
      cities.add(citySlug)
    }
    providerLog('sync', 'marking removed provider events')
    // Safety guard: if scraped 0 events, providers likely failed silently (e.g. IP blocked).
    // Skip markRemovedEvents to avoid mass-cancelling all Firestore events.
    const markedRemoved =
      events.length > 0
        ? await markRemovedEvents(db, scrapedIds, successfulProviders, scrapedCitiesByProvider)
        : 0
    if (events.length === 0) {
      console.warn('[eventSync] scraped 0 events — markRemovedEvents skipped to protect existing data')
    }
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
