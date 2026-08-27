import { NextResponse } from 'next/server'
import {
  marketplaceBrowseGuard,
  marketplaceErrorResponse,
} from '@/lib/advertiser/marketplaceApi'
import { advertiserMarketplaceService } from '@/services/advertiser/advertiserMarketplaceService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Ctx {
  params: Promise<{ inventoryId: string }>
}

export async function GET(_request: Request, context: Ctx) {
  const guard = marketplaceBrowseGuard()
  if (guard) return guard
  try {
    const { inventoryId } = await context.params
    const item = await advertiserMarketplaceService.getInventoryDetail(inventoryId)
    return NextResponse.json({ item })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
