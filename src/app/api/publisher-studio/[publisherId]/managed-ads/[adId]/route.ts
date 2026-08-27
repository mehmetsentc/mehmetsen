import { NextResponse } from 'next/server'
import { publisherManagedAdsService } from '@/services/publisher/publisherManagedAdsService'
import {
  selfManagedAdsErrorResponse,
  serializeCreative,
  serializeManagedAd,
  withSelfManagedAdsAuth,
} from '@/lib/publisher/selfManagedAdApi'
import type { PublisherManagedAdUpdateInput } from '@/types/publisherManagedAds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string; adId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { publisherId, adId } = await context.params
  const auth = await withSelfManagedAdsAuth(request, publisherId, 'ads:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const item = await publisherManagedAdsService.get(publisherId, adId, auth.auth!.user.uid)
    const { creative, ...ad } = item
    return NextResponse.json({
      item: serializeManagedAd(ad),
      creative: creative ? serializeCreative(creative) : null,
    })
  } catch (err) {
    return selfManagedAdsErrorResponse(err)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { publisherId, adId } = await context.params
  const body = (await request.json()) as PublisherManagedAdUpdateInput & { action?: string }
  if (body.action === 'archive') {
    const auth = await withSelfManagedAdsAuth(request, publisherId, 'ads:archive')
    if ('error' in auth && auth.error) return auth.error
    try {
      const item = await publisherManagedAdsService.archive(
        publisherId,
        adId,
        auth.auth!.user.uid
      )
      return NextResponse.json({ item: serializeManagedAd(item) })
    } catch (err) {
      return selfManagedAdsErrorResponse(err)
    }
  }

  const auth = await withSelfManagedAdsAuth(request, publisherId, 'ads:update')
  if ('error' in auth && auth.error) return auth.error
  try {
    const { action: _a, ...patch } = body
    const item = await publisherManagedAdsService.update(
      publisherId,
      adId,
      auth.auth!.user.uid,
      patch
    )
    return NextResponse.json({ item: serializeManagedAd(item) })
  } catch (err) {
    return selfManagedAdsErrorResponse(err)
  }
}
