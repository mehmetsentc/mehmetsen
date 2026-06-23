/**
 * Diagnostic endpoint — reads last 20 failed/running cronRuns from Firestore.
 * Helps diagnose cron 500 errors when Vercel logs are truncated.
 * Protected by DEBUG_TOKEN env var.
 */
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  const expectedToken = process.env.CRON_SECRET?.trim()
  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection('cronRuns')
      .orderBy('startedAt', 'desc')
      .limit(20)
      .get()

    const runs = snap.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        jobName: data.jobName,
        status: data.status,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        durationMs: data.durationMs,
        error: data.error ?? null,
        result: data.result ? data.result.slice(0, 500) : null,
      }
    })

    return NextResponse.json({ runs }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
