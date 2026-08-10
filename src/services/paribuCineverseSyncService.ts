import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { buildEventFingerprint } from '@/lib/eventDedupe'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { isEventUpcoming } from '@/lib/eventUtils'
import {
  buildParibuEventId,
  fetchParibuCanakkaleShowtimes,
  formatSessionTimesLabel,
  PARIBU_ADDRESS,
  PARIBU_PROVIDER_LABEL,
  PARIBU_SOURCE,
  PARIBU_VENUE,
  pickTicketUrl,
  type ParibuMovieDay,
} from '@/services/paribuCineverseService'
import { providerLog } from '@/services/eventProviders/shared'
import type { EventTimelineStatus, NaEvent } from '@/types/event'

/**
 * Daily Paribu Cineverse sync for Çanakkale — upserts cinema showtimes into
 * Firestore `events`, marks elapsed rows past, and soft-cancels stale listings.
 */

const CITY = 'Çanakkale'
const CITY_SLUG = 'canakkale'
const DISTRICT_SLUG = 'merkez'
const META_DOC_PATH = 'meta/paribuCineverseSync'
const MARK_BATCH_SIZE = 400

export interface ParibuSyncResult {
  scraped: number
  inserted: number
  updated: number
  skipped: number
  markedPast: number
  markedRemoved: number
  datesFetched: string[]
  completedAt: string
  durationMs: number
}

function timelineStatusFor(
  event: Pick<NaEvent, 'startsAt' | 'endsAt'>,
  nowIso: string
): EventTimelineStatus {
  return isEventUpcoming(event, nowIso) ? 'upcoming' : 'past'
}

function buildDescription(movie: ParibuMovieDay): string {
  const parts: string[] = []
  if (movie.description?.trim()) parts.push(movie.description.trim())
  if (movie.format?.trim()) parts.push(`Format: ${movie.format.trim()}`)
  const times = formatSessionTimesLabel(movie.sessions)
  if (times) parts.push(`Seans saatleri: ${times}`)
  parts.push(`${PARIBU_VENUE} · ${PARIBU_ADDRESS}`)
  return parts.join('\n\n')
}

function movieDayToEvent(movie: ParibuMovieDay, nowIso: string): NaEvent | null {
  if (!movie.sessions.length) return null

  const startsAt = movie.sessions[0].startsAtIso
  const lastSession = movie.sessions[movie.sessions.length - 1].startsAtIso
  const endsAt = new Date(new Date(lastSession).getTime() + 2.5 * 60 * 60 * 1000).toISOString()

  const tags = ['Sinema']
  if (movie.genre?.trim()) tags.push(movie.genre.trim())

  const id = buildParibuEventId(movie.movieSlug, movie.dateIso)
  const dateLabel = formatSessionTimesLabel(movie.sessions)

  const event: NaEvent = {
    id,
    title: movie.title,
    description: buildDescription(movie),
    category: 'cinema',
    city: CITY,
    citySlug: CITY_SLUG,
    districtSlug: DISTRICT_SLUG,
    venue: PARIBU_VENUE,
    address: PARIBU_ADDRESS,
    startsAt,
    endsAt,
    dateLabel,
    coverImageUrl: movie.coverImageUrl,
    ticketUrl: pickTicketUrl(movie.sessions, movie.dateParam),
    createdAt: nowIso,
    status: 'published',
    timelineStatus: timelineStatusFor({ startsAt, endsAt }, nowIso),
    source: PARIBU_SOURCE,
    provider: PARIBU_PROVIDER_LABEL,
    sourceId: `${movie.movieSlug}_${movie.dateIso}`,
    sourceHash: `${movie.movieSlug}_${movie.dateIso}`,
    externalId: movie.movieUrl,
    tags,
    isFree: false,
    fingerprint: '',
  }

  event.fingerprint = buildEventFingerprint(event)
  return event
}

function isUnchanged(
  event: NaEvent,
  existing: Partial<NaEvent> | undefined,
  nowIso: string
): boolean {
  if (!existing?.fingerprint) return false
  const nextTimeline = timelineStatusFor(event, nowIso)
  return (
    existing.fingerprint === event.fingerprint &&
    existing.timelineStatus === nextTimeline
  )
}

async function upsertEvents(
  events: NaEvent[],
  nowIso: string
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const db = getAdminFirestore()
  if (events.length === 0) return { inserted: 0, updated: 0, skipped: 0 }

  const existingById = new Map<string, Partial<NaEvent>>()
  for (let i = 0; i < events.length; i += 100) {
    const slice = events.slice(i, i + 100)
    const refs = slice.map((e) => db.collection(Collections.EVENTS).doc(e.id))
    const snaps = await db.getAll(...refs)
    for (const snap of snaps) {
      if (snap.exists) existingById.set(snap.id, snap.data() as Partial<NaEvent>)
    }
  }

  let inserted = 0
  let updated = 0
  let skipped = 0
  let batch = db.batch()
  let batchCount = 0

  for (const event of events) {
    const existing = existingById.get(event.id)
    if (isUnchanged(event, existing, nowIso)) {
      skipped += 1
      continue
    }

    if (existing) updated += 1
    else inserted += 1

    const { id, ...payload } = event
    batch.set(
      db.collection(Collections.EVENTS).doc(id),
      { ...payload, syncedAt: nowIso },
      { merge: true }
    )
    batchCount += 1

    if (batchCount >= 400) {
      await batch.commit()
      batch = db.batch()
      batchCount = 0
    }
  }

  if (batchCount > 0) await batch.commit()
  return { inserted, updated, skipped }
}

async function markPastParibuEvents(nowIso: string): Promise<number> {
  const db = getAdminFirestore()
  let markedPast = 0
  let lastDoc: QueryDocumentSnapshot | null = null

  while (true) {
    let q = db
      .collection(Collections.EVENTS)
      .where('startsAt', '<', nowIso)
      .orderBy('startsAt')
      .limit(MARK_BATCH_SIZE)

    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break

    lastDoc = snap.docs[snap.docs.length - 1]
    const batch = db.batch()
    let ops = 0

    for (const doc of snap.docs) {
      const data = doc.data()
      if (data.source !== PARIBU_SOURCE || data.citySlug !== CITY_SLUG) continue
      if (data.timelineStatus !== 'past') {
        batch.update(doc.ref, { timelineStatus: 'past', syncedAt: nowIso })
        markedPast += 1
        ops += 1
      }
    }

    if (ops > 0) await batch.commit()
    if (snap.size < MARK_BATCH_SIZE) break
  }

  return markedPast
}

async function markRemovedParibuEvents(
  scrapedIds: Set<string>,
  nowIso: string
): Promise<number> {
  const db = getAdminFirestore()
  let markedRemoved = 0
  let lastDoc: QueryDocumentSnapshot | null = null

  while (true) {
    let q = db
      .collection(Collections.EVENTS)
      .where('source', '==', PARIBU_SOURCE)
      .where('status', '==', 'published')
      .where('timelineStatus', '==', 'upcoming')
      .orderBy('__name__')
      .limit(MARK_BATCH_SIZE)

    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break

    lastDoc = snap.docs[snap.docs.length - 1]
    const batch = db.batch()
    let ops = 0

    for (const doc of snap.docs) {
      const data = doc.data()
      if (data.citySlug !== CITY_SLUG) continue
      if (!scrapedIds.has(doc.id)) {
        batch.update(doc.ref, { status: 'cancelled', syncedAt: nowIso })
        markedRemoved += 1
        ops += 1
      }
    }

    if (ops > 0) await batch.commit()
    if (snap.size < MARK_BATCH_SIZE) break
  }

  return markedRemoved
}

async function saveMeta(result: ParibuSyncResult): Promise<void> {
  const db = getAdminFirestore()
  await db.doc(META_DOC_PATH).set(result, { merge: true })
}

export const paribuCineverseSyncService = {
  async syncCanakkale(options?: { daysAhead?: number }): Promise<ParibuSyncResult> {
    const started = Date.now()
    const nowIso = new Date().toISOString()

    providerLog('paribu-cineverse', 'starting Çanakkale cinema sync')
    const { movies, datesFetched } = await fetchParibuCanakkaleShowtimes({
      daysAhead: options?.daysAhead,
      nowIso,
    })

    const events = movies
      .map((movie) => movieDayToEvent(movie, nowIso))
      .filter((e): e is NaEvent => e !== null)

    providerLog('paribu-cineverse', `upserting ${events.length} event(s)`)
    const { inserted, updated, skipped } = await upsertEvents(events, nowIso)

    const scrapedIds = new Set(events.map((e) => e.id))
    const markedRemoved =
      events.length > 0 ? await markRemovedParibuEvents(scrapedIds, nowIso) : 0
    const markedPast = await markPastParibuEvents(nowIso)

    const result: ParibuSyncResult = {
      scraped: events.length,
      inserted,
      updated,
      skipped,
      markedPast,
      markedRemoved,
      datesFetched,
      completedAt: nowIso,
      durationMs: Date.now() - started,
    }

    await saveMeta(result)
    console.log('[paribuCineverseSync]', JSON.stringify(result))
    return result
  },
}
