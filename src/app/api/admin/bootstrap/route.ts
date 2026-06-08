import { NextResponse } from 'next/server'
import { getBootstrapAdminUids } from '@/lib/eventSyncAuth'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'

/**
 * One-time promotion for UIDs listed in NEXT_PUBLIC_ADMIN_UIDS.
 * Requires Firebase Admin SDK credentials (FIREBASE_SERVICE_ACCOUNT_JSON or
 * FIREBASE_ADMIN_* env vars). Without them, set role: 'admin' in Firebase Console.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    const bootstrapUids = getBootstrapAdminUids()

    if (!bootstrapUids.includes(decoded.uid)) {
      return NextResponse.json({ error: 'Not a bootstrap admin' }, { status: 403 })
    }

    const userRef = getAdminFirestore().collection('users').doc(decoded.uid)
    const userDoc = await userRef.get()

    if (userDoc.data()?.role === 'admin') {
      return NextResponse.json({ ok: true, alreadyAdmin: true })
    }

    await userRef.update({
      role: 'admin',
      updatedAt: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, promoted: true })
  } catch (error) {
    console.error('[admin/bootstrap] Failed:', error)
    return NextResponse.json({ error: 'Bootstrap unavailable' }, { status: 503 })
  }
}
