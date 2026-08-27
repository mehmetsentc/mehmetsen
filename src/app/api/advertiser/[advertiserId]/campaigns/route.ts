import { NextResponse } from 'next/server'
import {
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
  const { advertiserId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'campaigns:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const campaigns = await advertiserMarketplaceService.listCampaigns(advertiserId, auth.user!.uid)
    return NextResponse.json({
      campaigns: campaigns.map((c) => serializeDates(c as unknown as Record<string, unknown>)),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}

export async function POST(request: Request, context: Ctx) {
  const { advertiserId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'campaigns:write')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = await request.json()
    const campaign = await advertiserMarketplaceService.createCampaign(
      advertiserId,
      auth.user!.uid,
      body
    )
    return NextResponse.json({
      campaign: serializeDates(campaign as unknown as Record<string, unknown>),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
