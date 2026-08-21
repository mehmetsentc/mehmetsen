import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import {
  AI_DRAFT_PAGE_SIZES,
  filterSortPaginateJobs,
  mapJobToDetail,
  type AiDraftListTab,
  type AiDraftPageSize,
  type AiDraftSortField,
  type AiDraftSortOrder,
} from '@/services/crawler/editorial/aiDraftsQuery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Phase 4D.4 — AI Taslakları list.
 * Snapshot-first; bounded job fetch; no AI / no re-crawl / no N+1 source lookup.
 */
export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Veri kaynağına ulaşılamıyor', dataUnavailable: true }, { status: 503 })
  }

  const url = new URL(request.url)
  const tab = (url.searchParams.get('tab') || 'completed') as AiDraftListTab
  const page = Number(url.searchParams.get('page') || '1')
  const pageSizeRaw = Number(url.searchParams.get('pageSize') || '25')
  const pageSize = (AI_DRAFT_PAGE_SIZES.includes(pageSizeRaw as AiDraftPageSize)
    ? pageSizeRaw
    : 25) as AiDraftPageSize
  const sort = (url.searchParams.get('sort') || 'createdAt') as AiDraftSortField
  const order = (url.searchParams.get('order') || 'desc') as AiDraftSortOrder
  const provider = url.searchParams.get('provider')
  const model = url.searchParams.get('model')
  const quality = url.searchParams.get('quality')
  const jobId = url.searchParams.get('jobId')?.trim()

  try {
    const { DrizzleAiDispatchStore } = await import('@/services/crawler/aiDispatch/drizzleStore')
    const store = new DrizzleAiDispatchStore()

    if (jobId) {
      const jobs = await store.listJobs({ limit: 200 })
      const job = jobs.find((j) => j.id === jobId)
      if (!job) return NextResponse.json({ error: 'Taslak bulunamadı' }, { status: 404 })
      return NextResponse.json({
        draft: mapJobToDetail(job),
        queryShape: 'listJobs(limit:200)+filterById — no AI, no re-crawl',
      })
    }

    // Bounded fetch — AI job volume is small; avoid reconstructing clusters/sources.
    const jobs = await store.listJobs({ limit: 500 })
    const result = filterSortPaginateJobs(jobs, {
      tab: tab === 'failed' ? 'failed' : 'completed',
      page: Number.isFinite(page) ? page : 1,
      pageSize,
      sort: ['createdAt', 'completedAt', 'wordCount', 'cost', 'status'].includes(sort)
        ? sort
        : 'createdAt',
      order: order === 'asc' ? 'asc' : 'desc',
      provider,
      model,
      quality,
    })

    const failedTotal = filterSortPaginateJobs(jobs, {
      tab: 'failed',
      page: 1,
      pageSize: 25,
      sort: 'createdAt',
      order: 'desc',
    }).total
    const completedTotal = filterSortPaginateJobs(jobs, {
      tab: 'completed',
      page: 1,
      pageSize: 25,
      sort: 'createdAt',
      order: 'desc',
    }).total

    return NextResponse.json({
      ...result,
      tab: tab === 'failed' ? 'failed' : 'completed',
      counts: { completed: completedTotal, failed: failedTotal },
      queryShape:
        'listJobs(limit:500) → in-memory filter/sort/paginate on draft_snapshot; no N+1 source lookup',
      autoPublish: false,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Yüklenemedi', dataUnavailable: true },
      { status: 500 }
    )
  }
}
