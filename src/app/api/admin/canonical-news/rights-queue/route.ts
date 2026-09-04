import { NextResponse } from 'next/server'
import { and, desc, eq, like } from 'drizzle-orm'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** P18.4D tiny pilot — always first in the rights queue. */
const PILOT_IDS = [
  '0ALMkrRCE3LQqubviNZh',
  '0SdmPVCnO8pVAbMENA9f',
  '0XYEJVwyi7oILuYKf91R',
] as const

/**
 * P18.4E — rights review queue listing.
 * Returns pilot IDs + migrated cohort drafts (P18_4E_*). Never publishes.
 */
export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const db = getDb()
  const cohort = await db
    .select({
      id: news.id,
      slug: news.slug,
      title: news.title,
      status: news.status,
      rightsStatus: news.rightsStatus,
      rightsBasis: news.rightsBasis,
      migrationBatchId: news.migrationBatchId,
      migratedAt: news.migratedAt,
    })
    .from(news)
    .where(and(eq(news.status, 'draft'), like(news.migrationBatchId, 'P18_4E_%')))
    .orderBy(desc(news.migratedAt))

  // Deduplicate while preserving pilot order then cohort.
  const seen = new Set<string>()
  const queue: Array<{
    id: string
    kind: 'pilot' | 'cohort'
    slug?: string | null
    title?: string | null
    status?: string | null
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
      rightsStatus: row.rightsStatus,
      rightsBasis: row.rightsBasis,
      migrationBatchId: row.migrationBatchId,
    })
  }

  return NextResponse.json({
    queue,
    pilotCount: PILOT_IDS.length,
    cohortCount: queue.filter((q) => q.kind === 'cohort').length,
    note: 'Human review only — this endpoint never clears rights or publishes.',
  })
}
