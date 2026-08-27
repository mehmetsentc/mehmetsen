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
  params: Promise<{ advertiserId: string; requestId: string }>
}

export async function POST(request: Request, context: Ctx) {
  const guard = bookingGuard()
  if (guard) return guard
  const { advertiserId, requestId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'requests:write')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    const action = body.action || 'submit'
    if (action === 'cancel') {
      const req = await advertiserMarketplaceService.cancelBookingRequest(
        advertiserId,
        auth.user!.uid,
        requestId
      )
      return NextResponse.json({
        request: serializeDates(req as unknown as Record<string, unknown>),
      })
    }
    const req = await advertiserMarketplaceService.submitBookingRequest(
      advertiserId,
      auth.user!.uid,
      requestId
    )
    return NextResponse.json({
      request: serializeDates(req as unknown as Record<string, unknown>),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
