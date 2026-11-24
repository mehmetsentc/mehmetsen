import 'server-only'
/**
 * EVENT-DESK-1 — Etkinlik Masası veri erişimi.
 * - Gelecek etkinlikler tek sorgu (startsAt ≥ bugün, artan), masa kayıtları tek sorgu (yalnız düzenlenenler).
 * - 60 sn bellek önbelleği; masa yazımında sıfırlanır.
 * - Masa kaydı `eventDesk/{eventId}`; etkinlik belgesine yazılmaz (günlük senkron üzerine yazar).
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { EventCategory, EventStatus, NaEvent } from '@/types/event'
import {
  buildDesk,
  parseDeskInfo,
  parseDeskMedia,
  parseDeskRecord,
  httpsUrl,
  startOfTodayIstanbul,
  type DeskItem,
  type DeskRecord,
  type SuspectItem,
} from './eventDesk'

export const EVENT_DESK_COLLECTION = 'eventDesk'
const MAX_EVENTS = 2500
const TTL_MS = 60_000

const CATEGORIES = new Set<EventCategory>(['concert', 'festival', 'party', 'exhibition', 'theater', 'cinema', 'other'])
const STATUSES = new Set<EventStatus>(['published', 'draft', 'cancelled'])

function s(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString()
  }
  return v == null ? '' : String(v)
}

export function mapEventDoc(id: string, d: Record<string, unknown>): NaEvent {
  return {
    id,
    title: s(d.title) || 'Adsız etkinlik',
    description: s(d.description),
    category: CATEGORIES.has(d.category as EventCategory) ? (d.category as EventCategory) : 'other',
    city: s(d.city),
    citySlug: s(d.citySlug),
    venue: s(d.venue),
    startsAt: s(d.startsAt),
    endsAt: s(d.endsAt) || undefined,
    coverImageUrl: s(d.coverImageUrl) || undefined,
    ticketUrl: s(d.ticketUrl) || undefined,
    organizer: s(d.organizer) || undefined,
    createdAt: s(d.createdAt),
    status: STATUSES.has(d.status as EventStatus) ? (d.status as EventStatus) : 'published',
    source: s(d.source) || 'firestore',
    provider: s(d.provider) || undefined,
  }
}

let cache: { at: number; value: { items: DeskItem[]; suspects: SuspectItem[] } } | null = null

export function invalidateDeskCache(): void {
  cache = null
}

export async function loadDesk(now = Date.now()): Promise<{ items: DeskItem[]; suspects: SuspectItem[] }> {
  if (cache && now - cache.at < TTL_MS) return cache.value
  const db = getAdminFirestore()
  const fromIso = new Date(startOfTodayIstanbul(now)).toISOString()
  const [evSnap, deskSnap] = await Promise.all([
    db.collection(Collections.EVENTS).where('startsAt', '>=', fromIso).orderBy('startsAt', 'asc').limit(MAX_EVENTS).get(),
    db.collection(EVENT_DESK_COLLECTION).limit(5000).get(),
  ])
  const events = evSnap.docs.map((doc) => mapEventDoc(doc.id, doc.data() as Record<string, unknown>))
  const desks = new Map<string, DeskRecord>()
  for (const doc of deskSnap.docs) desks.set(doc.id, parseDeskRecord(doc.id, doc.data()))
  const value = buildDesk(events, desks, now)
  cache = { at: now, value }
  return value
}

export type DeskPatch = {
  coverUrl?: unknown
  media?: unknown
  info?: unknown
  startsAtOverride?: unknown
  hidden?: unknown
  newsId?: unknown
  newsStatus?: unknown
}

/** Masa kaydını günceller; yalnız gönderilen alanlar değişir. Etkinlik yoksa null. */
export async function saveDesk(eventId: string, patch: DeskPatch, uid: string): Promise<DeskRecord | null> {
  if (!/^[A-Za-z0-9_:.-]{2,200}$/.test(eventId)) return null
  const db = getAdminFirestore()
  const evSnap = await db.collection(Collections.EVENTS).doc(eventId).get()
  if (!evSnap.exists) return null
  const ref = db.collection(EVENT_DESK_COLLECTION).doc(eventId)
  const cur = parseDeskRecord(eventId, (await ref.get()).data() ?? null)
  const next: DeskRecord = { ...cur }
  if ('coverUrl' in patch) next.coverUrl = patch.coverUrl === null ? null : httpsUrl(patch.coverUrl)
  if ('media' in patch && Array.isArray(patch.media)) {
    const prev = new Map(cur.media.map((m) => [m.id, m]))
    next.media = patch.media
      .map((m) => parseDeskMedia(m))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .slice(0, 24)
      .map((m) => ({ ...m, addedAt: prev.get(m.id)?.addedAt || Date.now(), addedBy: prev.get(m.id)?.addedBy || uid }))
  }
  if ('info' in patch) next.info = parseDeskInfo({ ...cur.info, ...(patch.info && typeof patch.info === 'object' ? patch.info : {}) })
  if ('startsAtOverride' in patch) {
    const v = patch.startsAtOverride
    const d = typeof v === 'string' ? new Date(v) : null
    next.startsAtOverride = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
  }
  if ('hidden' in patch) next.hidden = patch.hidden === true
  if ('newsId' in patch) next.newsId = typeof patch.newsId === 'string' && /^[A-Za-z0-9_-]{4,80}$/.test(patch.newsId) ? patch.newsId : null
  if ('newsStatus' in patch) next.newsStatus = typeof patch.newsStatus === 'string' ? patch.newsStatus.slice(0, 20) : null
  next.updatedAt = Date.now()
  next.updatedBy = uid
  const { eventId: _id, ...doc } = next
  void _id
  await ref.set(JSON.parse(JSON.stringify(doc)))
  invalidateDeskCache()
  return next
}

export function findDeskItem(items: DeskItem[], eventId: string): DeskItem | null {
  return items.find((i) => i.id === eventId || i.ids.includes(eventId)) ?? null
}
