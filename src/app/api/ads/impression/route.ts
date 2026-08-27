import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rateLimit'
import {
  isPublisherAdServingEnabled,
  isPublisherSelfManagedAdsEnabled,
} from '@/lib/publisher/selfManagedAdFlags'
import { publisherManagedAdsService } from '@/services/publisher/publisherManagedAdsService'
import { verifyUserRequest } from '@/lib/userAuthServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public impression beacon — rate limited, synthetic excluded in service.
 * Client must only fire after visibility threshold + dwell (enforced client-side).
 */
export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
  if (!isPublisherSelfManagedAdsEnabled() || !isPublisherAdServingEnabled()) {
    return NextResponse.json({ ok: false, skipped: true }, { status: 404 })
  }

  const ip = getClientIp(request)
  if (!checkRateLimit(`pmad-imp:${ip}`, 60, 60_000)) {
    return rateLimitResponse()
  }

  try {
    const body = (await request.json()) as {
      adId?: string
      creativeId?: string
      sessionId?: string
      deviceClass?: string
      referrerType?: string
      dedupeKey?: string
    }
    const adId = String(body.adId || '').trim()
    if (!adId) {
      return NextResponse.json({ error: 'AD_ID_REQUIRED' }, { status: 400 })
    }

    let userId: string | null = null
    try {
      const user = await verifyUserRequest(request)
      userId = user?.uid ?? null
    } catch {
      userId = null
    }

    const result = await publisherManagedAdsService.recordImpression({
      adId,
      creativeId: body.creativeId,
      userId,
      sessionId: body.sessionId,
      deviceClass: body.deviceClass,
      referrerType: body.referrerType,
      dedupeKey: body.dedupeKey,
    })
    return NextResponse.json({ ok: true, recorded: result.recorded })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
