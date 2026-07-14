import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function detectDevice(ua: string): 'mobile' | 'desktop' {
  return /mobile|android|iphone|ipad|tablet/i.test(ua) ? 'mobile' : 'desktop'
}

function detectOS(ua: string): string {
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/windows/i.test(ua)) return 'windows'
  if (/mac os x/i.test(ua)) return 'mac'
  if (/linux/i.test(ua)) return 'linux'
  return 'other'
}

function extractDomain(referrer: string): string {
  try {
    const url = new URL(referrer)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function sanitizePath(path: string): string {
  // Firestore dotted field paths cannot safely use `/` or `.` as map keys.
  // /haber/foo → haber__foo  (restored in admin analytics API)
  const cleaned = (path.split('?')[0] || '/').trim() || '/'
  return cleaned
    .replace(/^\/+/, '')
    .replace(/\/+/g, '__')
    .replace(/\./g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80) || 'home'
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    let body: { path?: string; referrer?: string; postId?: string } = {}
    if (contentType.includes('application/json')) {
      body = await request.json() as typeof body
    } else {
      // sendBeacon sometimes arrives as text/plain
      const text = await request.text()
      try {
        body = JSON.parse(text) as typeof body
      } catch {
        body = {}
      }
    }

    const ua = request.headers.get('user-agent') ?? ''
    const path = sanitizePath(body.path ?? '/')
    const referrerDomain = extractDomain(body.referrer ?? '')
    const device = detectDevice(ua)
    const os = detectOS(ua)

    // Skip bots
    if (/bot|crawler|spider|crawl|slurp|googlebot/i.test(ua)) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const db = getAdminFirestore()
    const ref = db.collection(Collections.ANALYTICS_DAILY).doc(today)

    // IMPORTANT: use update() NOT set({ merge: true }) for dot-notation field paths.
    // The Admin SDK's set() treats 'pages.home' as a LITERAL top-level field name
    // (with a literal dot), not a nested path. update() correctly resolves them as
    // nested field paths → { pages: { home: N } }.
    const updateData: Record<string, unknown> = {
      total: FieldValue.increment(1),
      [`devices.${device}`]: FieldValue.increment(1),
      [`os.${os}`]: FieldValue.increment(1),
      [`pages.${path}`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }

    let safeRef = ''
    if (referrerDomain) {
      safeRef = referrerDomain.replace(/\./g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
      if (safeRef) updateData[`referrers.${safeRef}`] = FieldValue.increment(1)
    }

    // update() fails with NOT_FOUND if the doc doesn't exist (first hit of a new day).
    // Fall back to set() with proper nested structure.
    try {
      await ref.update(updateData)
    } catch (updateErr: unknown) {
      const e = updateErr as { code?: number; message?: string }
      if (e?.code === 5 || (typeof e?.message === 'string' && e.message.includes('NOT_FOUND'))) {
        await ref.set({
          total: 1,
          devices: { [device]: 1 },
          os: { [os]: 1 },
          pages: { [path]: 1 },
          ...(safeRef ? { referrers: { [safeRef]: 1 } } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else {
        throw updateErr
      }
    }

    // Also increment viewsCount on the article if postId is provided
    if (body.postId) {
      try {
        await db.collection(Collections.NEWS).doc(body.postId).update({
          viewsCount: FieldValue.increment(1),
        })
      } catch {
        // Article may not exist in news collection — ignore
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[analytics/track]', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
