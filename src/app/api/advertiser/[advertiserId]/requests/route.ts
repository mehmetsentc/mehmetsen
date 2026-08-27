import { NextResponse } from 'next/server'
import {
  bookingGuard,
  marketplaceErrorResponse,
  requireAdvertiserAuth,
  serializeDates,
} from '@/lib/advertiser/marketplaceApi'
import { advertiserMarketplaceService } from '@/services/advertiser/advertiserMarketplaceService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ advertiserId: string }>
}

export async function GET(request: Request, context: Ctx) {
  const guard = bookingGuard()
  if (guard) return guard
  const { advertiserId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'requests:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const requests = await advertiserMarketplaceService.listAdvertiserRequests(
      advertiserId,
      auth.user!.uid
    )
    return NextResponse.json({
      requests: requests.map((r) => serializeDates(r as unknown as Record<string, unknown>)),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}

export async function POST(request: Request, context: Ctx) {
  const guard = bookingGuard()
  if (guard) return guard
  const { advertiserId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'requests:write')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = await request.json()
    const submit = Boolean(body.submit)
    const req = await advertiserMarketplaceService.createBookingRequest(
      advertiserId,
      auth.user!.uid,
      body,
      { submit }
    )
    return NextResponse.json({
      request: serializeDates(req as unknown as Record<string, unknown>),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
