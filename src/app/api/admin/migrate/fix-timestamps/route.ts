/**
 * POST /api/admin/migrate/fix-timestamps
 *
 * One-time migration: converts Firestore Timestamp values in `news` collection
 * (createdAt, updatedAt, publishedAt) to millisecond numbers so that
 * orderBy('publishedAt', 'desc') sorts all articles chronologically.
 *
 * Run in batches — call repeatedly until done:true is returned.
 * Body: { cursor?: string }  (pass the returned cursor on subsequent calls)
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 400

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let cursor: string | undefined
  try {
    const body = await request.json() as { cursor?: string }
    cursor = body.cursor
  } catch { /* no body — first call */ }

  const db = getAdminFirestore()

  // Query docs where publishedAt IS a Firestore Timestamp (type range filter)
  let q = db.collection('news')
    .where('publishedAt', '>=', new Timestamp(0, 0))
    .orderBy('publishedAt', 'asc')
    .limit(BATCH_SIZE)

  if (cursor) {
    // cursor = base64 of "<seconds>:<nanoseconds>"
    try {
      const [sec, ns] = Buffer.from(cursor, 'base64').toString().split(':').map(Number)
      q = q.startAfter(new Timestamp(sec, ns))
    } catch { /* ignore bad cursor */ }
  }

  const snap = await q.get()

  if (snap.empty) {
    return NextResponse.json({ migrated: 0, done: true })
  }

  const batch = db.batch()
  let migrated = 0

  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    const updates: Record<string, unknown> = {}

    if (data.publishedAt instanceof Timestamp) {
      updates.publishedAt = data.publishedAt.toMillis()
    }
    if (data.createdAt instanceof Timestamp) {
      updates.createdAt = data.createdAt.toMillis()
    }
    if (data.updatedAt instanceof Timestamp) {
      updates.updatedAt = data.updatedAt.toMillis()
    }

    if (Object.keys(updates).length > 0) {
      batch.update(docSnap.ref, updates)
      migrated++
    }
  }

  await batch.commit()

  // Build next cursor from the last doc's publishedAt Timestamp
  const lastDoc = snap.docs[snap.docs.length - 1]
  const lastTs = lastDoc.data().publishedAt
  const hasMore = snap.docs.length === BATCH_SIZE

  let nextCursor: string | undefined
  if (hasMore && lastTs instanceof Timestamp) {
    nextCursor = Buffer.from(`${lastTs.seconds}:${lastTs.nanoseconds}`).toString('base64')
  }

  return NextResponse.json({
    migrated,
    scanned: snap.docs.length,
    done: !hasMore,
    cursor: nextCursor,
  })
}
