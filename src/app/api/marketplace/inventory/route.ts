import { NextResponse } from 'next/server'
import {
  marketplaceBrowseGuard,
  marketplaceErrorResponse,
} from '@/lib/advertiser/marketplaceApi'
import { advertiserMarketplaceService } from '@/services/advertiser/advertiserMarketplaceService'
import type { MarketplaceBrowseFilters } from '@/types/advertiserMarketplace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const guard = marketplaceBrowseGuard()
  if (guard) return guard

  try {
    const url = new URL(request.url)
    const filters: MarketplaceBrowseFilters = {
      city: url.searchParams.get('city') || undefined,
      district: url.searchParams.get('district') || undefined,
      publisherId: url.searchParams.get('publisherId') || undefined,
      inventoryType: url.searchParams.get('inventoryType') || undefined,
      placementScope: url.searchParams.get('placementScope') || undefined,
      format: url.searchParams.get('format') || undefined,
      pricingModel: url.searchParams.get('pricingModel') || undefined,
      q: url.searchParams.get('q') || undefined,
      preferredCity: url.searchParams.get('preferredCity') || undefined,
      cursor: url.searchParams.get('cursor') || undefined,
      sort: (url.searchParams.get('sort') as MarketplaceBrowseFilters['sort']) || 'recommended',
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 24,
    }
    const priceMin = url.searchParams.get('priceMinMinor')
    const priceMax = url.searchParams.get('priceMaxMinor')
    if (priceMin) filters.priceMinMinor = Number(priceMin)
    if (priceMax) filters.priceMaxMinor = Number(priceMax)

    const result = await advertiserMarketplaceService.browse(filters)
    return NextResponse.json(result)
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
