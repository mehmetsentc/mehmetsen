import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { isPublisherManualPublishEnabled } from '@/lib/publisher/contentFlags'
import { publisherContentService } from '@/services/publisher/publisherContentService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * P7B — heal PARTIAL / recoverable FAILED publications.
 * Flag-off → safe no-op. Does not touch fresh PUBLISHING leases.
 */
async function handle(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isPublisherManualPublishEnabled()) {
    return NextResponse.json({ skipped: true, reason: 'MANUAL_PUBLISH_DISABLED' })
  }
  const result = await publisherContentService.reconcilePartialPublications(8)
  return NextResponse.json({ ...result, aiRequests: 0 })
}

export const GET = handle
export const POST = handle
