import { NextResponse } from 'next/server'
import {
  creativeGuard,
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
  const guard = creativeGuard()
  if (guard) return guard
  const { advertiserId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'creatives:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const creatives = await advertiserMarketplaceService.listCreatives(advertiserId, auth.user!.uid)
    return NextResponse.json({
      creatives: creatives.map((c) => serializeDates(c as unknown as Record<string, unknown>)),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}

export async function POST(request: Request, context: Ctx) {
  const guard = creativeGuard()
  if (guard) return guard
  const { advertiserId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'creatives:write')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = await request.json()
    const creative = await advertiserMarketplaceService.createCreative(
      advertiserId,
      auth.user!.uid,
      body
    )
    return NextResponse.json({
      creative: serializeDates(creative as unknown as Record<string, unknown>),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
