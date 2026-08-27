import { NextResponse } from 'next/server'
import { publisherManagedAdsService } from '@/services/publisher/publisherManagedAdsService'
import {
  selfManagedAdsErrorResponse,
  withSelfManagedAdsAuth,
} from '@/lib/publisher/selfManagedAdApi'
import { isPublisherAdAnalyticsEnabled } from '@/lib/publisher/selfManagedAdFlags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ publisherId: string }>
}

function parseRange(url: URL): { from: Date; to: Date } {
  const now = new Date()
  const range = url.searchParams.get('range') || '7d'
  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')
  if (fromParam && toParam) {
    const from = new Date(fromParam)
    const to = new Date(toParam)
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && to > from) {
      return { from, to }
    }
  }
  const to = now
  const from = new Date(now)
  if (range === 'today') {
    from.setHours(0, 0, 0, 0)
  } else if (range === '30d') {
    from.setDate(from.getDate() - 30)
  } else {
    from.setDate(from.getDate() - 7)
  }
  return { from, to }
}

export async function GET(request: Request, context: RouteContext) {
  const { publisherId } = await context.params
  if (!isPublisherAdAnalyticsEnabled()) {
    return NextResponse.json({ error: 'ANALYTICS_DISABLED', code: 'FLAG_OFF' }, { status: 404 })
  }
  const auth = await withSelfManagedAdsAuth(request, publisherId, 'ads:read')
  if ('error' in auth && auth.error) return auth.error
  try {
    const url = new URL(request.url)
    const { from, to } = parseRange(url)
    const adId = url.searchParams.get('adId') || undefined
    const summary = await publisherManagedAdsService.analytics(
      publisherId,
      auth.auth!.user.uid,
      from,
      to,
      adId
    )
    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      impressions: summary.impressions,
      clicks: summary.clicks,
      ctr: summary.ctr,
      byAd: summary.byAd,
      // Explicitly no revenue / earnings fields
    })
  } catch (err) {
    return selfManagedAdsErrorResponse(err)
  }
}
