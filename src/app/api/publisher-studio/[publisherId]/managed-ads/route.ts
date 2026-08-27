import { NextResponse } from 'next/server'
import { publisherManagedAdsService } from '@/services/publisher/publisherManagedAdsService'
import {
  selfManagedAdsErrorResponse,
  serializeManagedAd,
  withSelfManagedAdsAuth,
} from '@/lib/publisher/selfManagedAdApi'
import type { PublisherManagedAdCreateInput, PublisherManagedAdStatus } from '@/types/publisherManagedAds'
import { isManagedAdStatus } from '@/lib/publisher/selfManagedAdDomain'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { publisherId } = await context.params
  const auth = await withSelfManagedAdsAuth(request, publisherId, 'ads:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const url = new URL(request.url)
    const statusRaw = url.searchParams.get('status')
    const includeArchived = url.searchParams.get('includeArchived') === '1'
    const status =
      statusRaw === 'ALL'
        ? 'ALL'
        : statusRaw && isManagedAdStatus(statusRaw)
          ? (statusRaw as PublisherManagedAdStatus)
          : undefined
    const items = await publisherManagedAdsService.list(publisherId, auth.auth!.user.uid, {
      status,
      includeArchived,
    })
    return NextResponse.json({ items: items.map(serializeManagedAd) })
  } catch (err) {
    return selfManagedAdsErrorResponse(err)
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { publisherId } = await context.params
  const auth = await withSelfManagedAdsAuth(request, publisherId, 'ads:create')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = (await request.json()) as PublisherManagedAdCreateInput
    const item = await publisherManagedAdsService.create(
      publisherId,
      auth.auth!.user.uid,
      body
    )
    return NextResponse.json({ item: serializeManagedAd(item) }, { status: 201 })
  } catch (err) {
    return selfManagedAdsErrorResponse(err)
  }
}
