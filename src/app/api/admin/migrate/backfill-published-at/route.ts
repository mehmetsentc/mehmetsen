/**
 * POST /api/admin/migrate/backfill-published-at
 *
 * One-time repair migration. Some published `news` documents carry a null/missing
 * `publishedAt` (e.g. created via a path that never set it, or nulled by an edit).
 * Category and home listings order by `publishedAt`, and Firestore's orderBy
 * SILENTLY DROPS documents that lack the field — so those articles are viewable at
 * their detail URL but never appear in their category. This backfills a numeric
 * `publishedAt` (from createdAt → updatedAt → now) and mirrors `category`↔`categoryId`.
 *
 * Paginated by document id (stable across mixed field types). Call repeatedly with
 * the returned cursor until `done: true`.
 * Body: { cursor?: string }  (document id to start after)
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 400

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let cursor: string | undefined
  try {
    const body = (await request.json()) as { cursor?: string }
    cursor = body.cursor
  } catch {
    /* no body — first call */
  }

  const db = getAdminFirestore()

  // Paginate published docs by document id (always present, single-field index).
  let q = db
    .collection('news')
    .where('status', '==', 'published')
    .orderBy('__name__')
    .limit(BATCH_SIZE)

  if (cursor) {
    q = q.startAfter(cursor)
  }

  const snap = await q.get()

  if (snap.empty) {
    return NextResponse.json({ fixed: 0, scanned: 0, done: true })
  }

  const batch = db.batch()
  let fixed = 0

  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    const updates: Record<string, unknown> = {}

    const hasValidPublishedAt = toMillis(data.publishedAt) != null
    if (!hasValidPublishedAt) {
      updates.publishedAt =
        toMillis(data.createdAt) ?? toMillis(data.updatedAt) ?? Date.now()
    }

    // Keep the legacy `category` mirror aligned with `categoryId`.
    const categoryId = (data.categoryId as string | undefined)?.trim()
    if (categoryId && data.category !== categoryId) {
      updates.category = categoryId
    }

    if (Object.keys(updates).length > 0) {
      batch.update(docSnap.ref, updates)
      fixed++
    }
  }

  if (fixed > 0) await batch.commit()

  const lastDoc = snap.docs[snap.docs.length - 1]
  const hasMore = snap.docs.length === BATCH_SIZE

  return NextResponse.json({
    fixed,
    scanned: snap.docs.length,
    done: !hasMore,
    cursor: hasMore ? lastDoc.id : undefined,
  })
}
