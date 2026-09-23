import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MANUAL_SOURCES = new Set(['firestore', 'init-script', 'admin'])

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
