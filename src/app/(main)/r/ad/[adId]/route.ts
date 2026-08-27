import { NextResponse } from 'next/server'
import { hasDatabaseUrl } from '@/db'
import {
  isPublisherAdServingEnabled,
  isPublisherSelfManagedAdsEnabled,
} from '@/lib/publisher/selfManagedAdFlags'
import { publisherManagedAdsService } from '@/services/publisher/publisherManagedAdsService'
import { verifyUserRequest } from '@/lib/userAuthServer'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ adId: string }>
}

/**
 * Safe click redirect — destination from DB only. No client URL open-redirect.
 */
export async function GET(request: Request, context: RouteContext) {
  const { adId } = await context.params
  if (!hasDatabaseUrl() || !isPublisherSelfManagedAdsEnabled() || !isPublisherAdServingEnabled()) {
    return NextResponse.redirect(new URL('/', request.url), 302)
  }

  let userId: string | null = null
  try {
    const user = await verifyUserRequest(request)
    userId = user?.uid ?? null
  } catch {
    userId = null
  }

  let sessionId: string | null = null
  try {
    const jar = await cookies()
    sessionId = jar.get('nh_sid')?.value ?? null
  } catch {
    sessionId = null
  }

  const result = await publisherManagedAdsService.recordClickAndGetDestination({
    adId,
    userId,
    sessionId,
  })

  if (!result?.destinationUrl) {
    return NextResponse.redirect(new URL('/', request.url), 302)
  }

  return NextResponse.redirect(result.destinationUrl, 302)
}
