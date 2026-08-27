import { NextResponse } from 'next/server'
import { publisherManagedAdsService } from '@/services/publisher/publisherManagedAdsService'
import {
  selfManagedAdsErrorResponse,
  serializeCreative,
  withSelfManagedAdsAuth,
} from '@/lib/publisher/selfManagedAdApi'
import type { PublisherAdCreativeCreateInput } from '@/types/publisherManagedAds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string; adId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { publisherId, adId } = await context.params
  const auth = await withSelfManagedAdsAuth(request, publisherId, 'ads:update')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = (await request.json()) as PublisherAdCreativeCreateInput
    const creative = await publisherManagedAdsService.createCreative(
      publisherId,
      adId,
      auth.auth!.user.uid,
      body
    )
    return NextResponse.json({ creative: serializeCreative(creative) }, { status: 201 })
  } catch (err) {
    return selfManagedAdsErrorResponse(err)
  }
}
