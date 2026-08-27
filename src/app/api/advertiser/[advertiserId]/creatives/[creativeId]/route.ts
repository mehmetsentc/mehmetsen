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
  params: Promise<{ advertiserId: string; creativeId: string }>
}

export async function POST(request: Request, context: Ctx) {
  const guard = creativeGuard()
  if (guard) return guard
  const { advertiserId, creativeId } = await context.params
  const auth = await requireAdvertiserAuth(request, advertiserId, 'creatives:write')
  if ('error' in auth && auth.error) return auth.error
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string }
    if (body.action === 'submit') {
      const creative = await advertiserMarketplaceService.submitCreative(
        advertiserId,
        auth.user!.uid,
        creativeId
      )
      return NextResponse.json({
        creative: serializeDates(creative as unknown as Record<string, unknown>),
      })
    }
    return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 })
  } catch (err) {
    return marketplaceErrorResponse(err)
  }
}
