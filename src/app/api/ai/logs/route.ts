/**
 * GET /api/ai/logs
 *
 * AI pipeline loglarını döndürür (son 100 kayıt).
 * Auth: Bearer CRON_SECRET
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limitParam = Math.min(200, parseInt(url.searchParams.get('limit') ?? '100'))
  const level = url.searchParams.get('level') // info|warn|error

  const db = getAdminFirestore()
  let q = db.collection(Collections.AI_LOGS)
    .orderBy('timestamp', 'desc')
    .limit(limitParam)

  if (level) {
    q = db.collection(Collections.AI_LOGS)
      .where('level', '==', level)
      .orderBy('timestamp', 'desc')
      .limit(limitParam)
  }

  const snap = await q.get()
  const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

  return NextResponse.json({ logs, count: logs.length }, { headers: { 'Cache-Control': 'no-store' } })
}
