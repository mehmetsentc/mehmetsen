/**
 * GET  /api/admin/newsletter — list subscribers
 * PATCH /api/admin/newsletter — unsubscribe / reactivate
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasPermission } from '@/types/cms'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

function toIso(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') return new Date(value).toISOString()
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString()
    } catch {
      return null
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  const auth = await verifyCmsToken(request)
  if (!auth || !hasPermission(auth.role, 'users:read')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'active'
  const cursor = searchParams.get('cursor')
  const q = (searchParams.get('q') || '').trim().toLowerCase()
  const format = searchParams.get('format')

  try {
    const db = getAdminFirestore()
    const col = db.collection(Collections.NEWSLETTER_SUBSCRIBERS)

    // CSV export of active list
    if (format === 'csv') {
      const snap = await col.where('status', '==', 'active').orderBy('subscribedAt', 'desc').limit(5000).get()
      const rows = [['email', 'source', 'subscribedAt', 'marketingConsent']]
      for (const doc of snap.docs) {
        const d = doc.data()
        rows.push([
          String(d.email ?? ''),
          String(d.source ?? ''),
          toIso(d.subscribedAt) ?? '',
          d.marketingConsent === true ? 'true' : 'false',
        ])
      }
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="nahaber-bulten.csv"',
        },
      })
    }

    let query = col.orderBy('subscribedAt', 'desc').limit(PAGE_SIZE)
    if (status !== 'all') {
      query = col.where('status', '==', status).orderBy('subscribedAt', 'desc').limit(PAGE_SIZE)
    }
    if (cursor) {
      const cursorDoc = await col.doc(cursor).get()
      if (cursorDoc.exists) {
        query =
          status !== 'all'
            ? col
                .where('status', '==', status)
                .orderBy('subscribedAt', 'desc')
                .startAfter(cursorDoc)
                .limit(PAGE_SIZE)
            : col.orderBy('subscribedAt', 'desc').startAfter(cursorDoc).limit(PAGE_SIZE)
      }
    }

    const snap = await query.get()
    let items = snap.docs.map((doc) => {
      const d = doc.data()
      return {
        id: doc.id,
        email: String(d.email ?? ''),
        status: String(d.status ?? 'active'),
        source: String(d.source ?? ''),
        marketingConsent: d.marketingConsent === true,
        subscribedAt: toIso(d.subscribedAt),
        unsubscribedAt: toIso(d.unsubscribedAt),
        updatedAt: toIso(d.updatedAt),
      }
    })

    if (q) {
      items = items.filter((i) => i.email.includes(q))
    }

    // Counts (cheap enough for admin)
    const [activeCountSnap, unsubCountSnap] = await Promise.all([
      col.where('status', '==', 'active').count().get(),
      col.where('status', '==', 'unsubscribed').count().get(),
    ])

    return NextResponse.json({
      items,
      nextCursor: snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1]?.id ?? null : null,
      counts: {
        active: activeCountSnap.data().count,
        unsubscribed: unsubCountSnap.data().count,
      },
    })
  } catch (err) {
    console.error('[admin/newsletter GET]', err instanceof Error ? err.message : 'failed')
    return NextResponse.json({ error: 'Liste alınamadı' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyCmsToken(request)
  if (!auth || !hasPermission(auth.role, 'users:read')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { id?: string; action?: 'unsubscribe' | 'reactivate' }
  try {
    body = (await request.json()) as { id?: string; action?: 'unsubscribe' | 'reactivate' }
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek' }, { status: 400 })
  }

  const id = (body.id ?? '').trim()
  if (!id || (body.action !== 'unsubscribe' && body.action !== 'reactivate')) {
    return NextResponse.json({ error: 'id ve action gerekli' }, { status: 400 })
  }

  try {
    const db = getAdminFirestore()
    const ref = db.collection(Collections.NEWSLETTER_SUBSCRIBERS).doc(id)
    const existing = await ref.get()
    if (!existing.exists) {
      return NextResponse.json({ error: 'Kayıt bulunamadı' }, { status: 404 })
    }

    if (body.action === 'unsubscribe') {
      await ref.set(
        {
          status: 'unsubscribed',
          marketingConsent: false,
          unsubscribedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    } else {
      await ref.set(
        {
          status: 'active',
          marketingConsent: true,
          unsubscribedAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/newsletter PATCH]', err instanceof Error ? err.message : 'failed')
    return NextResponse.json({ error: 'Güncelleme başarısız' }, { status: 500 })
  }
}
