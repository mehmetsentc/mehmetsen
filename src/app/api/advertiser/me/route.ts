import { NextResponse } from 'next/server'
import {
  advertiserPlatformGuard,
  marketplaceErrorResponse,
  serializeDates,
} from '@/lib/advertiser/marketplaceApi'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { advertiserMarketplaceService } from '@/services/advertiser/advertiserMarketplaceService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET memberships / POST onboard */
export async function GET(request: Request) {
  const guard = advertiserPlatformGuard()
  if (guard) return guard
  try {
    const user = await verifyUserRequest(request)
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    const memberships = await advertiserMarketplaceService.listMyAdvertisers(user.uid)
    return NextResponse.json({
      memberships: memberships.map((m) => ({
        role: m.role,
        advertiser: serializeDates(m.advertiser as unknown as Record<string, unknown>),
      })),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}

export async function POST(request: Request) {
  const guard = advertiserPlatformGuard()
  if (guard) return guard
  try {
    const user = await verifyUserRequest(request)
    if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
    const body = await request.json()
    const result = await advertiserMarketplaceService.onboard(user.uid, body)
    return NextResponse.json({
      advertiser: serializeDates(result.advertiser as unknown as Record<string, unknown>),
      member: serializeDates(result.member as unknown as Record<string, unknown>),
    })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
