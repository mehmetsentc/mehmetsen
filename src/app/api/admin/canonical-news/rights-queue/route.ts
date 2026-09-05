import { NextResponse } from 'next/server'
import { and, desc, eq, like } from 'drizzle-orm'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import {
  P18_4E_COHORT1_BATCH_ID,
  aggregateBatchRightsProgress,
} from '@/services/editorial/canonicalRightsReviewQueue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** P18.4D tiny pilot — always first in the default (all) rights queue. */
const PILOT_IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

/**
 * P18.4E / P18.4E.3 — rights review queue listing.
 * Optional ?batch=P18_4E_20260904T172223Z isolates Cohort #1.
 * Never publishes. Never mutates rights.
 */
export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const url = new URL(request.url)
  const batch = (url.searchParams.get('batch') || '').trim()
  const db = getDb()

  if (batch) {
    const cohort = await db
      .select({
        id: news.id,
        slug: news.slug,
        title: news.title,
        status: news.status,
        source: news.source,
        sourceUrl: news.sourceUrl,
        rightsStatus: news.rightsStatus,
        rightsBasis: news.rightsBasis,
        migrationBatchId: news.migrationBatchId,
        migratedAt: news.migratedAt,
      })
      .from(news)
      .where(eq(news.migrationBatchId, batch))

    const progress = aggregateBatchRightsProgress(cohort)

    return NextResponse.json({
      queue: cohort.map((row) => ({
        id: row.id,
        kind: 'cohort' as const,
        slug: row.slug,
        title: row.title,
        status: row.status,
        source: row.source,
        sourceUrl: row.sourceUrl,
        rightsStatus: row.rightsStatus,
        rightsBasis: row.rightsBasis,
        migrationBatchId: row.migrationBatchId,
      })),
      batch,
      pilotCount: 0,
      cohortCount: cohort.length,
      progress,
      note: 'Batch-filtered human review queue — never clears rights or publishes.',
      knownCohort1Batch: P18_4E_COHORT1_BATCH_ID,
    })
  }

  const cohort = await db
    .select({
      id: news.id,
      slug: news.slug,
      title: news.title,
      status: news.status,
      source: news.source,
      sourceUrl: news.sourceUrl,
      rightsStatus: news.rightsStatus,
      rightsBasis: news.rightsBasis,
      migrationBatchId: news.migrationBatchId,
      migratedAt: news.migratedAt,
    })
    .from(news)
    .where(and(eq(news.status, 'draft'), like(news.migrationBatchId, 'P18_4E_%')))
    .orderBy(desc(news.migratedAt))

  const seen = new Set<string>()
  const queue: Array<{
    id: string
    kind: 'pilot' | 'cohort'
    slug?: string | null
    title?: string | null
    status?: string | null
    source?: string | null
    sourceUrl?: string | null
    rightsStatus?: string | null
    rightsBasis?: string | null
    migrationBatchId?: string | null
  }> = []

  for (const id of PILOT_IDS) {
    seen.add(id)
    queue.push({ id, kind: 'pilot' })
  }
  for (const row of cohort) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    queue.push({
      id: row.id,
      kind: 'cohort',
      slug: row.slug,
      title: row.title,
      status: row.status,
      source: row.source,
      sourceUrl: row.sourceUrl,
      rightsStatus: row.rightsStatus,
      rightsBasis: row.rightsBasis,
      migrationBatchId: row.migrationBatchId,
    })
  }

  return NextResponse.json({
    queue,
    pilotCount: PILOT_IDS.length,
    cohortCount: queue.filter((q) => q.kind === 'cohort').length,
    progress: null,
    note: 'Human review only — this endpoint never clears rights or publishes.',
    knownCohort1Batch: P18_4E_COHORT1_BATCH_ID,
  })
}
