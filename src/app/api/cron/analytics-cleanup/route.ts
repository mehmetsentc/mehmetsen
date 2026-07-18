import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RETAINED_COLLECTIONS = [
  Collections.ANALYTICS_EVENTS,
  Collections.ANALYTICS_SESSIONS,
  Collections.ANALYTICS_UNIQUES,
] as const

export async function GET(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminFirestore()
  const deleted: Record<string, number> = {}
  for (const collectionName of RETAINED_COLLECTIONS) {
    const expired = await db.collection(collectionName)
      .where('expiresAt', '<=', Timestamp.now())
      .limit(500)
      .get()
    if (!expired.empty) {
      const batch = db.batch()
      expired.docs.forEach((doc) => batch.delete(doc.ref))
      await batch.commit()
    }
    deleted[collectionName] = expired.size
  }

  return NextResponse.json({ ok: true, deleted })
}
