/**
 * POST /api/admin/migrate/restore-events
 *
 * One-time migration: restores events that were incorrectly marked as
 * `status: 'cancelled'` due to a sync bug (providers returning empty arrays
 * when IP-blocked, causing markRemovedEvents to cancel all events).
 *
 * Restores only events whose `startsAt` is in the future and `source` is one
 * of the ticket platform providers ('biletix', 'bubilet', 'biletino').
 *
 * Call once; idempotent. Returns { restored, done }.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 400
const PROVIDER_SOURCES = ['biletix', 'bubilet', 'biletino']

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'system:settings')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getAdminFirestore()
  const nowIso = new Date().toISOString()
  let totalRestored = 0

  try {
    for (const source of PROVIDER_SOURCES) {
      let lastDoc = null as FirebaseFirestore.QueryDocumentSnapshot | null
      let keepGoing = true

      while (keepGoing) {
        let q = db
          .collection('events')
          .where('source', '==', source)
          .where('status', '==', 'cancelled')
          .where('startsAt', '>=', nowIso)
          .orderBy('startsAt')
          .limit(BATCH_SIZE)

        if (lastDoc) q = q.startAfter(lastDoc)

        const snap = await q.get()
        if (snap.empty) break

        lastDoc = snap.docs[snap.docs.length - 1]

        const batch = db.batch()
        for (const doc of snap.docs) {
          batch.update(doc.ref, { status: 'published', timelineStatus: 'upcoming' })
          totalRestored++
        }
        await batch.commit()

        if (snap.size < BATCH_SIZE) keepGoing = false
      }
    }

    console.log(`[restore-events] restored ${totalRestored} events`)
    return NextResponse.json({ restored: totalRestored, done: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[restore-events] failed:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
