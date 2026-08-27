import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { isPublisherSchedulingEnabled } from '@/lib/publisher/contentFlags'
import { publisherContentService } from '@/services/publisher/publisherContentService'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isPublisherSchedulingEnabled()) {
    return NextResponse.json({ skipped: true, reason: 'SCHEDULING_DISABLED' })
  }
  const workerId = `pcsched_${randomUUID().slice(0, 8)}`
  const result = await publisherContentService.runScheduleTick(workerId, 8)
  return NextResponse.json({ workerId, ...result, aiRequests: 0 })
}

export const GET = handle
export const POST = handle
