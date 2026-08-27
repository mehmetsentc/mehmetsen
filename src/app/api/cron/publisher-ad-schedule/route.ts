import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { isPublisherSelfManagedAdsEnabled } from '@/lib/publisher/selfManagedAdFlags'
import { publisherManagedAdsService } from '@/services/publisher/publisherManagedAdsService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function handle(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isPublisherSelfManagedAdsEnabled()) {
    return NextResponse.json({ skipped: true, reason: 'SELF_MANAGED_ADS_DISABLED' })
  }
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ skipped: true, reason: 'NO_DATABASE' })
  }
  const result = await publisherManagedAdsService.runScheduleTick(100)
  return NextResponse.json(result)
}

export const GET = handle
export const POST = handle
