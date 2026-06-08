import { NextResponse } from 'next/server'
import { eventAggregatorService } from '@/services/eventAggregatorService'
import type { EventCategory } from '@/types/event'

/**
 * GET /api/events/aggregate?citySlug=istanbul&category=concert
 *
 * Returns events aggregated live from all *enabled* external ticket platforms
 * (Biletix, Biletino, Bubilet, …). The events page reads from Firestore only;
 * this route is used as an empty-state fallback in `useEvents`, not on every load.
 * Daily incremental sync runs via /api/events/sync (cron 00:00 Istanbul).
 *
 * Runs on the Node.js runtime and is force-dynamic: provider data is live and
 * must not be statically cached at build time.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_CATEGORIES: ReadonlySet<string> = new Set<EventCategory>([
  'concert',
  'festival',
  'party',
  'exhibition',
  'theater',
  'other',
])

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const citySlugRaw = searchParams.get('citySlug')?.trim()
  const categoryRaw = searchParams.get('category')?.trim()

  const citySlug = citySlugRaw || undefined
  const category =
    categoryRaw && VALID_CATEGORIES.has(categoryRaw) ? categoryRaw : undefined

  try {
    const result = await eventAggregatorService.aggregateEvents({ citySlug, category })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    // Defensive: the aggregator already fails soft, but never 500 the page.
    console.warn('[api/events/aggregate] unexpected error:', error)
    return NextResponse.json(
      { events: [], providers: [], failedProviders: [] },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
