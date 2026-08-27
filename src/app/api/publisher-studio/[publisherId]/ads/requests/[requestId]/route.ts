import { NextResponse } from 'next/server'
import { bookingGuard, marketplaceErrorResponse, serializeDates } from '@/lib/advertiser/marketplaceApi'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { advertiserMarketplaceService } from '@/services/advertiser/advertiserMarketplaceService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ publisherId: string; requestId: string }>
}

export async function POST(request: Request, context: Ctx) {
  const guard = bookingGuard()
  if (guard) return guard
  const { publisherId, requestId } = await context.params
  try {
    const user = await verifyUserRequest(request)
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    const body = (await request.json()) as {
      action?: 'approve' | 'reject' | 'offer'
      note?: string | null
      publisherOfferMinor?: number | null
    }
    const action = body.action || 'approve'
    if (action === 'reject') {
      const req = await advertiserMarketplaceService.rejectRequest(
        publisherId,
        user.uid,
        requestId,
        body.note
      )
      return NextResponse.json({
        request: serializeDates(req as unknown as Record<string, unknown>),
      })
    }
    if (action === 'offer') {
      if (body.publisherOfferMinor == null) {
        return NextResponse.json({ error: 'OFFER_REQUIRED' }, { status: 400 })
      }
      const req = await advertiserMarketplaceService.offerOnRequest(
        publisherId,
        user.uid,
        requestId,
        body.publisherOfferMinor,
        body.note
      )
      return NextResponse.json({
        request: serializeDates(req as unknown as Record<string, unknown>),
      })
    }
    const result = await advertiserMarketplaceService.approveRequest(
      publisherId,
      user.uid,
      requestId,
      {
        publisherNote: body.note,
        publisherOfferMinor: body.publisherOfferMinor ?? null,
      }
    )
    return NextResponse.json({
      request: serializeDates(result.request as unknown as Record<string, unknown>),
      booking: serializeDates(result.booking as unknown as Record<string, unknown>),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
