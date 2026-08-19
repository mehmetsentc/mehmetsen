import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { newsSyncService } from '@/services/newsSyncService'

/**
 * POST/GET /api/cron/news-ingest
 *
 * Minute cron: fetch RSS sources → OpenAI rewrite → write pending news docs.
 * Protected by CRON_SECRET / NEWS_INGEST_SECRET (same pattern as events sync).
 *
 * Vercel cron (vercel.json): `* * * * *` — injects Authorization: Bearer $CRON_SECRET
 *
 * Manual:
 *   curl -X POST "$APP_URL/api/cron/news-ingest" -H "Authorization: Bearer $CRON_SECRET"
 *   npm run ingest-news
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

let ingestInFlight: Promise<Awaited<ReturnType<typeof newsSyncService.ingestNews>>> | null = null

async function isAuthorized(request: Request): Promise<boolean> {
  return isNewsroomAuthorized(request)
}

export async function GET(request: Request) {
  return handleIngest(request)
}

export async function POST(request: Request) {
  return handleIngest(request)
}

function parseBatchOptions(request: Request) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('mode')?.trim().toLowerCase()
  const categories = url.searchParams.get('categories')?.trim()
  const daysRaw = url.searchParams.get('days')
  const maxAiRaw = url.searchParams.get('maxAiCalls') ?? url.searchParams.get('max_ai_calls')
  const perCategoryRaw = url.searchParams.get('perCategory') ?? url.searchParams.get('per_category')

  const isBatch = mode === 'batch' || Boolean(categories || daysRaw || perCategoryRaw)
  if (!isBatch) return null

  const days = daysRaw ? Number(daysRaw) : 30
  const maxAiCalls = maxAiRaw ? Number(maxAiRaw) : Number(process.env.NEWS_INGEST_MAX_AI_CALLS ?? 24)
  const perCategory = perCategoryRaw ? Number(perCategoryRaw) : 3

  return {
    categories: categories ? categories.split(',').map((c) => c.trim()).filter(Boolean) : undefined,
    days: Number.isFinite(days) ? days : 30,
    maxAiCalls: Number.isFinite(maxAiCalls) ? maxAiCalls : 24,
    perCategory: Number.isFinite(perCategory) ? perCategory : 3,
  }
}

async function handleIngest(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const batchOptions = parseBatchOptions(request)
    const { isLegacyDirectAiEnabled } = await import('@/services/crawler/legacyFlags')
    if (!isLegacyDirectAiEnabled()) {
      return NextResponse.json(
        { mode: 'legacy_disabled', aiRequests: 0, reason: 'LEGACY_DIRECT_AI_ENABLED=false' },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }
    if (!ingestInFlight) {
      ingestInFlight = (batchOptions
        ? newsSyncService.ingestNewsBatch(batchOptions)
        : newsSyncService.ingestNews()
      ).finally(() => {
        ingestInFlight = null
      })
    }
    const result = await ingestInFlight
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[api/cron/news-ingest] failed:', error)
    const message = error instanceof Error ? error.message : 'Ingest failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
