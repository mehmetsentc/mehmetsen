import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { getCityCategoryName, isTurkishProvinceSlug } from '@/constants/cities'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import type { EventCategory, EventStatus } from '@/types/event'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MANUAL_SOURCES = new Set(['firestore', 'init-script', 'admin'])

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

function optionalHttpUrl(raw: string, label: string): { ok: true; value?: string } | { ok: false; error: string } {
  const value = raw.trim()
  if (!value) return { ok: true }
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: `${label} http(s) olmalı` }
    }
    return { ok: true, value }
  } catch {
    return { ok: false, error: `Geçersiz ${label}` }
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!id?.trim()) {
    return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
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
  const status = STATUSES.has(body.status as EventStatus) ? (body.status as EventStatus) : null

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

  const endsAtRaw = asString(body.endsAt).trim()
  const endsAtDate = endsAtRaw ? new Date(endsAtRaw) : null
  if (endsAtRaw && (!endsAtDate || Number.isNaN(endsAtDate.getTime()))) {
    return NextResponse.json({ error: 'Geçersiz bitiş zamanı' }, { status: 400 })
  }

  const ticketUrl = optionalHttpUrl(asString(body.ticketUrl), 'Bilet URL')
  if (!ticketUrl.ok) return NextResponse.json({ error: ticketUrl.error }, { status: 400 })
  const coverImageUrl = optionalHttpUrl(asString(body.coverImageUrl), 'Görsel URL')
  if (!coverImageUrl.ok) return NextResponse.json({ error: coverImageUrl.error }, { status: 400 })

  const now = new Date()
  const patch: Record<string, unknown> = {
    title,
    description: asString(body.description).trim().slice(0, 4000),
    category,
    city: getCityCategoryName(citySlug),
    citySlug,
    venue,
    address: asString(body.address).trim().slice(0, 240) || null,
    startsAt: startsAtDate.toISOString(),
    endsAt: endsAtDate ? endsAtDate.toISOString() : null,
    coverImageUrl: coverImageUrl.value || null,
    ticketUrl: ticketUrl.value || null,
    organizer: asString(body.organizer).trim().slice(0, 120) || null,
    timelineStatus: startsAtDate.getTime() >= now.getTime() ? 'upcoming' : 'past',
    updatedAt: now.toISOString(),
    updatedBy: admin.uid,
  }
  if (status) patch.status = status

  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.EVENTS).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Etkinlik bulunamadı' }, { status: 404 })
    }

    await ref.set(patch, { merge: true })
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('[admin/events] update failed:', error)
    return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  if (!id?.trim()) {
    return NextResponse.json({ error: 'id gerekli' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.EVENTS).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Etkinlik bulunamadı' }, { status: 404 })
    }

    const source = String((snap.data() as { source?: string } | undefined)?.source || 'firestore')
    if (MANUAL_SOURCES.has(source)) {
      await ref.delete()
      return NextResponse.json({ ok: true, mode: 'deleted' })
    }

    await ref.set(
      {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: admin.uid,
      },
      { merge: true }
    )
    return NextResponse.json({ ok: true, mode: 'cancelled' })
  } catch (error) {
    console.error('[admin/events] delete failed:', error)
    return NextResponse.json({ error: 'Silinemedi' }, { status: 500 })
  }
}
