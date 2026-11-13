import { NextResponse } from 'next/server'
import { FieldPath } from 'firebase-admin/firestore'
import { isSyncSecretAuthorized } from '@/lib/eventSyncAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  isNewsPgMirrorEnabled,
  readBackfillCursor,
  toNewsMirrorRow,
  upsertNewsMirrorRows,
  writeBackfillCursor,
} from '@/services/newsMirror/newsReadMirror'

/**
 * GET/POST /api/cron/news-mirror-reconcile  (hourly, vercel.json)
 *
 * FinOps Neon migration, phase 1. No-op unless NEWS_PG_MIRROR=1.
 *
 * 1. Backfill: until done, mirrors the next BACKFILL_PER_RUN published articles
 *    (newest first, status + publishedAt DESC + __name__ DESC — the article sitemap
 *    index) and stores its cursor in news_read_mirror_state. One Firestore read per
 *    article, once. ~4k articles per hourly run.
 * 2. Reconcile (02:xx UTC only): re-mirrors articles published in the last 26 h, in
 *    case a publish hook was missed. ≈ one read per article published that day.
 *
 * Auth: CRON_SECRET / EVENTS_SYNC_SECRET (Vercel cron sends Bearer CRON_SECRET).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PAGE = 500
const BACKFILL_PER_RUN = 4000
const RECONCILE_WINDOW_MS = 26 * 60 * 60 * 1000
const RECONCILE_UTC_HOUR = 2
const BUDGET_MS = 240_000

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}

function publishedQuery() {
  return getAdminFirestore()
    .collection(Collections.NEWS)
    .where('status', '==', 'published')
    .orderBy('publishedAt', 'desc')
    .orderBy(FieldPath.documentId(), 'desc')
}

async function backfillChunk(t0: number) {
  const cursor = await readBackfillCursor()
  if (cursor === 'done') return { done: true, mirrored: 0 }
  let after: [number, string] | null = null
  if (cursor) {
    const [ms, id] = cursor.split('|')
    if (ms && id && Number.isFinite(Number(ms))) after = [Number(ms), id]
  }
  let mirrored = 0
  while (mirrored < BACKFILL_PER_RUN && Date.now() - t0 < BUDGET_MS) {
    let q = publishedQuery().limit(PAGE)
    if (after) q = q.startAfter(after[0], after[1])
    const snap = await q.get()
    if (snap.empty) {
      await writeBackfillCursor('done')
      return { done: true, mirrored }
    }
    await upsertNewsMirrorRows(snap.docs.map((d) => toNewsMirrorRow(d.id, d.data())))
    mirrored += snap.size
    const last = snap.docs[snap.docs.length - 1]!
    const pa = last.get('publishedAt')
    after = [typeof pa === 'number' ? pa : 0, last.id]
    await writeBackfillCursor(`${after[0]}|${after[1]}`)
    if (snap.size < PAGE) {
      await writeBackfillCursor('done')
      return { done: true, mirrored }
    }
  }
  return { done: false, mirrored }
}

async function reconcileRecent(t0: number) {
  // publishedAt is stored as epoch ms.
  const since = Date.now() - RECONCILE_WINDOW_MS
  let mirrored = 0
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null
  while (Date.now() - t0 < BUDGET_MS) {
    let q = getAdminFirestore()
      .collection(Collections.NEWS)
      .where('status', '==', 'published')
      .where('publishedAt', '>=', since)
      .orderBy('publishedAt', 'desc')
      .limit(PAGE)
    if (cursor) q = q.startAfter(cursor)
    const snap = await q.get()
    if (snap.empty) break
    await upsertNewsMirrorRows(snap.docs.map((d) => toNewsMirrorRow(d.id, d.data())))
    mirrored += snap.size
    cursor = snap.docs[snap.docs.length - 1] ?? null
    if (snap.size < PAGE) break
  }
  return { mirrored }
}

async function handle(request: Request) {
  if (!isSyncSecretAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const headers = { 'Cache-Control': 'no-store' }
  if (!isNewsPgMirrorEnabled()) {
    return NextResponse.json({ ok: true, skipped: 'NEWS_PG_MIRROR off' }, { headers })
  }
  const t0 = Date.now()
  const force = new URL(request.url).searchParams.get('reconcile') === '1'
  try {
    const backfill = await backfillChunk(t0)
    const reconcile =
      force || new Date().getUTCHours() === RECONCILE_UTC_HOUR ? await reconcileRecent(t0) : null
    return NextResponse.json({ ok: true, backfill, reconcile }, { headers })
  } catch (error) {
    console.error('[news-mirror-reconcile] failed:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'failed' },
      { status: 500, headers }
    )
  }
}
