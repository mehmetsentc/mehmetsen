/**
 * POST /api/ai/pipeline
 *
 * Yeni bir haber AI pipeline kuyruğuna ekle veya bekleyen kuyruğu işle.
 *
 * POST body:
 *   { action: 'enqueue', item: Partial<AiQueueItem> }
 *   { action: 'process' }  — bir sonraki batch'i işle
 *
 * Auth: Bearer CRON_SECRET
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { processPipelineQueue, addToAiQueue } from '@/lib/ai/pipeline'
import type { AiQueueItem } from '@/lib/ai/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { action?: string; item?: Partial<AiQueueItem> }
  try {
    body = (await request.json()) as typeof body
  } catch {
    body = { action: 'process' }
  }

  if (body.action === 'enqueue' && body.item) {
    const item = body.item
    if (!item.originalTitle || !item.sourceUrl) {
      return NextResponse.json({ error: 'originalTitle ve sourceUrl zorunlu' }, { status: 400 })
    }
    const id = await addToAiQueue({
      priority: item.priority ?? 0,
      sourceLabel: item.sourceLabel ?? 'Manuel',
      sourceUrl: item.sourceUrl,
      originalTitle: item.originalTitle,
      originalSummary: item.originalSummary ?? '',
      originalContent: item.originalContent ?? '',
      imageUrl: item.imageUrl,
      rssFingerprint: item.rssFingerprint,
      forcedCategoryId: item.forcedCategoryId,
    })
    return NextResponse.json({ success: true, queueItemId: id }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Default: process queue
  const result = await processPipelineQueue()
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await processPipelineQueue()
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
