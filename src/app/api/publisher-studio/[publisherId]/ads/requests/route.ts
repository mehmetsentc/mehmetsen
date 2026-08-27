import { NextResponse } from 'next/server'
import { bookingGuard, marketplaceErrorResponse, serializeDates } from '@/lib/advertiser/marketplaceApi'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { advertiserMarketplaceService } from '@/services/advertiser/advertiserMarketplaceService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ publisherId: string }>
}

export async function GET(request: Request, context: Ctx) {
  const guard = bookingGuard()
  if (guard) return guard
  const { publisherId } = await context.params
  try {
    const user = await verifyUserRequest(request)
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    const requests = await advertiserMarketplaceService.listPublisherRequests(
      publisherId,
      user.uid
    )
    return NextResponse.json({
      requests: requests.map((r) => serializeDates(r as unknown as Record<string, unknown>)),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
