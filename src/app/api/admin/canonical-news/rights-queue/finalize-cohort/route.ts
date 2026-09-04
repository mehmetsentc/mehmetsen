import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { P18_4E_COHORT1_BATCH_ID } from '@/services/editorial/canonicalRightsReviewQueue'
import { auditCanonicalDraftSourceOverlap } from '@/services/editorial/canonicalDraftSourceOverlapAudit'
import { recordNewsRightsDecision } from '@/services/editorial/newsRightsDecision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONFIRM_TOKEN = 'REWRITE_REQUIRED_COHORT_1'
const RIGHTS_BASIS = 'EDITORIALLY_TRANSFORMED_WITH_ATTRIBUTION' as const

/**
 * P18.4E.4 — Explicit human finalize for Cohort #1.
 * Actor = verifyCmsToken session uid only. Never publishes. No AI.
 */
export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const body = (await request.json().catch(() => null)) as {
    confirm?: string
    batch?: string
    actorUid?: string
    uid?: string
  } | null

  // Client-supplied actor is ignored.
  void body?.actorUid
  void body?.uid

  if (!body || body.confirm !== CONFIRM_TOKEN) {
    return NextResponse.json(
      { error: 'confirm_required', expected: CONFIRM_TOKEN },
      { status: 400 }
    )
  }

  const batch = (body.batch || '').trim()
  if (batch !== P18_4E_COHORT1_BATCH_ID) {
    return NextResponse.json(
      { error: 'batch_mismatch', expected: P18_4E_COHORT1_BATCH_ID },
      { status: 400 }
    )
  }

  const db = getDb()
  const rows = await db
    .select({
      id: news.id,
      status: news.status,
      rightsStatus: news.rightsStatus,
      rightsBasis: news.rightsBasis,
      editorialBlocker: news.editorialBlocker,
    })
    .from(news)
    .where(eq(news.migrationBatchId, batch))

  if (rows.length !== 10) {
    return NextResponse.json(
      { error: 'cohort_count_mismatch', found: rows.length, expected: 10 },
      { status: 409 }
    )
  }

  for (const row of rows) {
    if (row.status !== 'draft') {
      return NextResponse.json(
        { error: 'precondition_failed', id: row.id, detail: `status=${row.status}` },
        { status: 409 }
      )
    }
    if ((row.rightsStatus || '').toUpperCase() !== 'PENDING') {
      return NextResponse.json(
        {
          error: 'precondition_failed',
          id: row.id,
          detail: `rights_status=${row.rightsStatus}`,
        },
        { status: 409 }
      )
    }
    if ((row.rightsBasis || 'UNKNOWN').toUpperCase() !== 'UNKNOWN') {
      return NextResponse.json(
        {
          error: 'precondition_failed',
          id: row.id,
          detail: `rights_basis=${row.rightsBasis}`,
        },
        { status: 409 }
      )
    }
  }

  // Recompute similarity (non-AI) — abort if not 8 HIGH / 2 MEDIUM.
  const classified: Array<{
    id: string
    risk: string
    similarity: number | null
  }> = []
  for (const row of rows) {
    const audit = await auditCanonicalDraftSourceOverlap({ newsId: row.id })
    classified.push({
      id: row.id,
      risk: audit.risk,
      similarity: audit.similarity,
    })
  }

  const highs = classified.filter((c) => c.risk === 'HIGH_SOURCE_OVERLAP')
  const mediums = classified.filter((c) => c.risk === 'MEDIUM_OVERLAP')
  if (highs.length !== 8 || mediums.length !== 2 || classified.length !== 10) {
    return NextResponse.json(
      {
        error: 'similarity_mismatch',
        high: highs.length,
        medium: mediums.length,
        classified,
      },
      { status: 409 }
    )
  }

  const mediumIds = new Set(mediums.map((m) => m.id))
  const expectedMedium = new Set(['wUzimisXG1JZZqdRdHt5', '1Z22cs0LfMcvrwwgaSTn'])
  for (const id of expectedMedium) {
    if (!mediumIds.has(id)) {
      return NextResponse.json(
        { error: 'medium_ids_mismatch', expected: [...expectedMedium], got: [...mediumIds] },
        { status: 409 }
      )
    }
  }

  const results: Array<{
    id: string
    risk: string
    rightsStatus: string
    rightsBasis: string
    editorialBlocker: string | null
  }> = []

  // Sequential human decisions — session actor only.
  for (const c of classified) {
    const isHigh = c.risk === 'HIGH_SOURCE_OVERLAP'
    await recordNewsRightsDecision({
      newsId: c.id,
      actorUid: auth.uid,
      status: 'REWRITE_REQUIRED',
      basis: RIGHTS_BASIS,
      refuseClearWhenBlocked: true,
      editorialBlocker: isHigh ? 'HIGH_SOURCE_OVERLAP' : null,
    })

    const [verify] = await db
      .select({
        id: news.id,
        status: news.status,
        rightsStatus: news.rightsStatus,
        rightsBasis: news.rightsBasis,
        editorialBlocker: news.editorialBlocker,
      })
      .from(news)
      .where(eq(news.id, c.id))
      .limit(1)

    if (
      !verify ||
      verify.status !== 'draft' ||
      verify.rightsStatus !== 'REWRITE_REQUIRED' ||
      (isHigh && verify.editorialBlocker !== 'HIGH_SOURCE_OVERLAP') ||
      (!isHigh && verify.editorialBlocker)
    ) {
      return NextResponse.json(
        {
          error: 'post_verify_failed',
          id: c.id,
          verify,
          published: false,
          partialResults: results,
        },
        { status: 500 }
      )
    }

    results.push({
      id: c.id,
      risk: c.risk,
      rightsStatus: String(verify.rightsStatus),
      rightsBasis: String(verify.rightsBasis),
      editorialBlocker: verify.editorialBlocker,
    })
  }

  return NextResponse.json({
    ok: true,
    batch,
    actorFromSession: true,
    clientActorIgnored: true,
    published: false,
    executePublish: false,
    aiCalls: 0,
    highCount: highs.length,
    mediumCount: mediums.length,
    rewriteRequired: results.length,
    highBlockers: results.filter((r) => r.editorialBlocker === 'HIGH_SOURCE_OVERLAP').length,
    results,
    note: 'P18.4E.4 Cohort #1 finalized as REWRITE_REQUIRED — no publications.',
  })
}
