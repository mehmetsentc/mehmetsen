import { FieldValue } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lightweight news view counter.
 * Single FieldValue.increment(1) on the news doc — no analytics events,
 * daily aggregates, IP/geo, or session docs.
 * Client should debounce once per browser session per article.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (!checkRateLimit(`news-view:${ip}`, 60, 60_000)) {
    return rateLimitResponse()
  }

  let body: { id?: unknown } = {}
  try {
    body = (await request.json()) as { id?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id || id.length > 128 || !/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.NEWS).doc(id)
    // update() fails if missing — avoid creating empty docs via set/merge
    await ref.update({ viewsCount: FieldValue.increment(1) })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const err = error as { code?: number | string; message?: string }
    const missing =
      err.code === 5 ||
      err.code === 'not-found' ||
      /NOT_FOUND|No document to update/i.test(err.message ?? '')
    if (missing) {
      return NextResponse.json({ ok: false, skipped: 'not-found' }, { status: 404 })
    }
    console.error('[news/view]', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
