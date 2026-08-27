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
  params: Promise<{ advertiserId: string; campaignId: string }>
}

export async function GET(request: Request, context: Ctx) {
  const guard = bookingGuard()
  if (guard) return guard
  const { advertiserId, campaignId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'requests:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const requests = await advertiserMarketplaceService.listCampaignRequests(
      advertiserId,
      auth.user!.uid,
      campaignId
    )
    return NextResponse.json({
      requests: requests.map((r) => serializeDates(r as unknown as Record<string, unknown>)),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
