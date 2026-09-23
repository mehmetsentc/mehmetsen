import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getCityCategoryName, isTurkishProvinceSlug } from '@/constants/cities'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { EventCategory, EventStatus, NaEvent } from '@/types/event'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORIES = new Set<EventCategory>([
  'concert',
  'festival',
  'party',
  'exhibition',
  'theater',
  'cinema',
  'other',
])

const STATUSES = new Set<EventStatus>(['published', 'draft', 'cancelled'])

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  return value == null ? '' : String(value)
}

function mapEvent(id: string, data: Record<string, unknown>): NaEvent {
  return {
    id,
    title: asString(data.title) || 'Adsız etkinlik',
    description: asString(data.description),
    category: CATEGORIES.has(data.category as EventCategory) ? (data.category as EventCategory) : 'other',
    city: asString(data.city),
    citySlug: asString(data.citySlug),
    venue: asString(data.venue),
    address: asString(data.address) || undefined,
    startsAt: asString(data.startsAt),
    endsAt: asString(data.endsAt) || undefined,
    coverImageUrl: asString(data.coverImageUrl) || undefined,
    ticketUrl: asString(data.ticketUrl) || undefined,
    organizer: asString(data.organizer) || undefined,
    createdAt: asString(data.createdAt),
    status: STATUSES.has(data.status as EventStatus) ? (data.status as EventStatus) : 'published',
    timelineStatus: data.timelineStatus === 'past' ? 'past' : 'upcoming',
    source: asString(data.source) || 'firestore',
    provider: asString(data.provider) || undefined,
  }
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const q = url.searchParams.get('q')?.trim().toLocaleLowerCase('tr-TR') || ''
  const citySlug = url.searchParams.get('citySlug')?.trim() || ''
  const status = url.searchParams.get('status')?.trim() || ''
  const source = url.searchParams.get('source')?.trim() || ''
  const limit = Math.min(80, Math.max(10, Number(url.searchParams.get('limit') || 40) || 40))

  try {
    const db = getAdminFirestore()
    const col = db.collection(Collections.EVENTS)
    let snap
    if (citySlug && isTurkishProvinceSlug(citySlug)) {
      snap = await col
        .where('citySlug', '==', citySlug)
        .orderBy('startsAt', 'desc')
        .limit(limit)
        .get()
        .catch(async () => col.where('citySlug', '==', citySlug).limit(limit).get())
    } else {
      snap = await col
        .orderBy('startsAt', 'desc')
        .limit(limit)
        .get()
        .catch(async () => col.limit(limit).get())
    }

    let items = snap.docs.map((doc) => mapEvent(doc.id, doc.data() as Record<string, unknown>))
    if (status && STATUSES.has(status as EventStatus)) {
      items = items.filter((item) => item.status === status)
    }
    if (source) {
      items = items.filter((item) => (item.source || 'firestore') === source)
    }
    if (q) {
      items = items.filter((item) =>
        `${item.title} ${item.venue} ${item.city}`.toLocaleLowerCase('tr-TR').includes(q)
      )
    }

    return NextResponse.json({ items, count: items.length })
  } catch (error) {
    console.error('[admin/events] list failed:', error)
    return NextResponse.json({ error: 'Liste alınamadı' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 })
  }

  const title = asString(body.title).trim().slice(0, 180)
  const citySlug = asString(body.citySlug).trim()
  const venue = asString(body.venue).trim().slice(0, 160)
  const startsAtRaw = asString(body.startsAt).trim()
  const category = CATEGORIES.has(body.category as EventCategory)
    ? (body.category as EventCategory)
    : 'other'

  if (!title || !venue || !startsAtRaw) {
    return NextResponse.json({ error: 'Başlık, mekan ve başlangıç zamanı zorunlu' }, { status: 400 })
  }
  if (!isTurkishProvinceSlug(citySlug)) {
    return NextResponse.json({ error: 'Geçerli bir il seçin' }, { status: 400 })
  }

  const startsAtDate = new Date(startsAtRaw)
  if (Number.isNaN(startsAtDate.getTime())) {
    return NextResponse.json({ error: 'Geçersiz başlangıç zamanı' }, { status: 400 })
  }

  const now = new Date()
  const startsAt = startsAtDate.toISOString()
  const endsAtRaw = asString(body.endsAt).trim()
  const endsAtDate = endsAtRaw ? new Date(endsAtRaw) : null
  if (endsAtRaw && (!endsAtDate || Number.isNaN(endsAtDate.getTime()))) {
    return NextResponse.json({ error: 'Geçersiz bitiş zamanı' }, { status: 400 })
  }

  const ticketUrl = asString(body.ticketUrl).trim()
  if (ticketUrl) {
    try {
      const parsed = new URL(ticketUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return NextResponse.json({ error: 'Bilet URL http(s) olmalı' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Geçersiz bilet URL' }, { status: 400 })
    }
  }

  const id = `firestore_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const event: NaEvent = {
    id,
    title,
    description: asString(body.description).trim().slice(0, 4000),
    category,
    city: getCityCategoryName(citySlug),
    citySlug,
    venue,
    address: asString(body.address).trim().slice(0, 240) || undefined,
    startsAt,
    endsAt: endsAtDate ? endsAtDate.toISOString() : undefined,
    coverImageUrl: asString(body.coverImageUrl).trim() || undefined,
    ticketUrl: ticketUrl || undefined,
    organizer: asString(body.organizer).trim().slice(0, 120) || undefined,
    createdAt: now.toISOString(),
    status: 'published',
    timelineStatus: startsAtDate.getTime() >= now.getTime() ? 'upcoming' : 'past',
    source: 'firestore',
    provider: 'NaHaber',
  }

  try {
    const db = getAdminFirestore()
    await db.collection(Collections.EVENTS).doc(id).set(event)
    return NextResponse.json({ item: event }, { status: 201 })
  } catch (error) {
    console.error('[admin/events] create failed:', error)
    return NextResponse.json({ error: 'Etkinlik yazılamadı' }, { status: 500 })
  }
}
