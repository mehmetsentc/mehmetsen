/**
 * EVENT-DESK-1
 * GET  /api/admin/events/desk → gelecek etkinlikler (birleşik), il sayıları, şüpheli tarihler
 * POST /api/admin/events/desk { eventId, coverUrl?, media?, info?, newsId?, newsStatus? }
 *      { eventId, startsAtOverride? | hidden? } → yayın yetkisi gerekir
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasPermission } from '@/types/cms'
import { findDeskItem, loadDesk, saveDesk, type DeskPatch } from '@/lib/events/eventDeskStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const { items, suspects } = await loadDesk()
    const cities: Record<string, { name: string; count: number }> = {}
    for (const it of items) {
      if (!it.citySlug) continue
      const c = (cities[it.citySlug] ??= { name: it.city || it.citySlug, count: 0 })
      c.count++
    }
    return NextResponse.json({ items, suspects, cities, total: items.length, now: Date.now() }, { headers: NO_STORE })
  } catch (error) {
    console.error('[events/desk] list failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Etkinlik listesi alınamadı' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:create')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Geçersiz gövde' }, { status: 400 })
  }
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : ''
  if (!eventId) return NextResponse.json({ error: 'eventId gerekli' }, { status: 400 })
  if (('startsAtOverride' in body || 'hidden' in body) && !hasPermission(auth.role, 'news:publish')) {
    return NextResponse.json({ error: 'Tarih düzeltme ve gizleme için yayın yetkisi gerekir' }, { status: 403 })
  }
  const patch: DeskPatch = {}
  for (const k of ['coverUrl', 'media', 'info', 'startsAtOverride', 'hidden', 'newsId', 'newsStatus'] as const) {
    if (k in body) patch[k] = body[k]
  }
  try {
    const desk = await saveDesk(eventId, patch, auth.uid)
    if (!desk) return NextResponse.json({ error: 'Etkinlik bulunamadı' }, { status: 404 })
    const { items } = await loadDesk()
    return NextResponse.json({ desk, item: findDeskItem(items, eventId) }, { headers: NO_STORE })
  } catch (error) {
    console.error('[events/desk] save failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Kaydedilemedi' }, { status: 500 })
  }
}
