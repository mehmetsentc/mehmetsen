/**
 * POST /api/admin/newsroom/queue/[id]/publish-manual
 *
 * Publish queue item as-is (optionally with edited fields) — no AI pipeline.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import {
  publishQueueItemManual,
  type ManualQueueEditFields,
} from '@/services/newsroom/queue/manualQueuePublish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as ManualQueueEditFields

  try {
    const db = getAdminFirestore()
    const result = await publishQueueItemManual(db, id, body)
    return NextResponse.json({ ok: true, ...result, publishedVia: 'manual-publish' })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
