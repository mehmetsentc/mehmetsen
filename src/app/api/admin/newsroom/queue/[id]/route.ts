/**
 * GET  /api/admin/newsroom/queue/[id] — queue item for manual editor
 * PUT  /api/admin/newsroom/queue/[id] — save edited fields back to queue payload
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import {
  queueInputToEditorPayload,
  updateQueueItemPayload,
  type ManualQueueEditFields,
} from '@/services/newsroom/queue/manualQueuePublish'
import type { NewsQueueDocument } from '@/services/newsroom/queue/types'
import type { NewsroomArticleInput } from '@/services/newsroom/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'cron:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const db = getAdminFirestore()
  const snap = await db.collection(Collections.NEWS_QUEUE).doc(id).get()

  if (!snap.exists) {
    return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
  }

  const data = snap.data() as NewsQueueDocument
  const input = data.input as NewsroomArticleInput

  return NextResponse.json({
    id: snap.id,
    ...queueInputToEditorPayload(input, {
      workerId: data.workerId,
      status: data.status,
      createdAt: data.createdAt,
    }),
  })
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as ManualQueueEditFields

  try {
    const db = getAdminFirestore()
    const payload = await updateQueueItemPayload(db, id, body)
    return NextResponse.json({ ok: true, id, ...payload })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const status = msg.includes('not found') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
