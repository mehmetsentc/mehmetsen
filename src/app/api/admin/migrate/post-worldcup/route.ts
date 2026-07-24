/**
 * POST /api/admin/migrate/post-worldcup
 *
 * Post-tournament backfill: `dunya-kupasi-2026` içindeki (varsayılan: final
 * sonrası yayınlanan) haberleri `futbol` kategorisine taşır.
 * Arşiv turnuva haberlerini korumak için `sinceMs` ile sınırlanır
 * (default: 2026-07-19 final günü 00:00 UTC).
 *
 * Body: { limit?: number; dryRun?: boolean; sinceMs?: number; moveAll?: boolean }
 */
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

export const runtime = 'nodejs'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET ?? ''

/** 2026 World Cup final day (Spain champion) — UTC midnight */
const DEFAULT_SINCE_MS = Date.UTC(2026, 6, 19)

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${CRON_SECRET}` && CRON_SECRET.length > 0
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    limit?: number
    dryRun?: boolean
    sinceMs?: number
    moveAll?: boolean
  } = {}
  try {
    body = await request.json()
  } catch {
    /* ignore */
  }

  const limit = Math.min(body.limit ?? 500, 2000)
  const dryRun = body.dryRun ?? false
  const moveAll = body.moveAll === true
  const sinceMs = typeof body.sinceMs === 'number' ? body.sinceMs : DEFAULT_SINCE_MS

  const db = getAdminFirestore()
  const startMs = Date.now()

  const snap = await db
    .collection('news')
    .where('categoryId', '==', 'dunya-kupasi-2026')
    .orderBy('publishedAt', 'desc')
    .limit(limit)
    .get()

  let updated = 0
  let unchanged = 0
  let failed = 0
  const changes: Array<{ id: string; title: string; publishedAt: number }> = []

  for (const doc of snap.docs) {
    const data = doc.data()
    const title = (data.title as string) ?? ''
    const publishedAt =
      typeof data.publishedAt === 'number'
        ? data.publishedAt
        : Date.parse(String(data.publishedAt ?? '')) || 0

    if (!moveAll && publishedAt > 0 && publishedAt < sinceMs) {
      unchanged++
      continue
    }

    try {
      changes.push({ id: doc.id, title: title.slice(0, 80), publishedAt })
      if (!dryRun) {
        await doc.ref.update({
          categoryId: 'futbol',
          category: 'futbol',
          migratedFromWorldCupAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      updated++
    } catch (err) {
      console.error('[migrate/post-worldcup] failed', doc.id, err)
      failed++
    }
  }

  if (!dryRun && updated > 0) {
    try {
      revalidatePath('/kategori/dunya-kupasi-2026')
      revalidatePath('/kategori/spor')
      revalidatePath('/kategori/futbol')
      revalidatePath('/feed')
      revalidatePath('/')
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({
    checked: snap.size,
    updated,
    unchanged,
    failed,
    dryRun,
    moveAll,
    sinceMs,
    durationMs: Date.now() - startMs,
    changes: changes.slice(0, 50),
  })
}
