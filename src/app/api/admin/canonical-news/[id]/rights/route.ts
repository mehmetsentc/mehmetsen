import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  getCanonicalNewsRightsReview,
  isNewsRightsBasis,
  isNewsRightsStatus,
  recordNewsRightsDecision,
} from '@/services/editorial/newsRightsDecision'
import { auditCanonicalDraftSourceOverlap } from '@/services/editorial/canonicalDraftSourceOverlapAudit'
import { isSeedDemoCanonicalNewsId } from '@/services/editorial/canonicalRightsReviewQueue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

// P16.1 Task 7 — pilotHint now backed by the shared SEED_DEMO_CANONICAL_NEWS_IDS constant.

export async function GET(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const review = await getCanonicalNewsRightsReview(id)
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    review,
    pilotHint: isSeedDemoCanonicalNewsId(id),
    note: 'P18.4D.2 rights foundation — decisions are human-only; this GET never clears rights.',
  })
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const body = (await request.json().catch(() => null)) as {
    status?: string
    basis?: string
    editorialBlocker?: string | null
    actorUid?: string
    uid?: string
  } | null

  if (!body || !isNewsRightsStatus(body.status) || !isNewsRightsBasis(body.basis)) {
    return NextResponse.json(
      { error: 'Invalid status/basis', allowedStatus: true, allowedBasis: true },
      { status: 400 }
    )
  }

  // Client-supplied actor UID is ignored — session auth.uid is sole actor.
  void body.actorUid
  void body.uid

  // P16.1 Task 3 -- fetch a live, read-only source-overlap evidence snapshot at
  // decision time and persist it (via the audit trail) alongside this rights
  // decision. auditCanonicalDraftSourceOverlap never throws (safe-fail to
  // SOURCE_NOT_EVALUABLE) and never returns raw source/canonical body text --
  // only char counts, scores, fetch status. A failure here must never block
  // the human's rights decision.
  let overlapSnapshot: Record<string, unknown> | null = null
  try {
    const overlap = await auditCanonicalDraftSourceOverlap({ newsId: id })
    overlapSnapshot = {
      evaluated: overlap.evaluated,
      sourceFetchStatus: overlap.sourceFetchStatus,
      similarity: overlap.similarity,
      jaccard: overlap.jaccard,
      ngram3: overlap.ngram3,
      tokenMatchRatio: overlap.tokenMatchRatio,
      maxSharedContiguousRun: overlap.maxSharedContiguousRun,
      gateOverlapCategory: overlap.gateOverlapCategory,
      risk: overlap.risk,
      classificationReason: overlap.classificationReason,
      canonicalBodyChars: overlap.canonicalBodyChars,
      sourceBodyChars: overlap.sourceBodyChars,
      algorithm: 'editorialSimilarityGate.checkTextSimilarity.v1',
    }
  } catch (overlapErr) {
    console.warn('[canonical-rights-route] overlap snapshot failed (non-blocking):', overlapErr)
  }

  try {
    const result = await recordNewsRightsDecision({
      newsId: id,
      actorUid: auth.uid,
      actorEmail: auth.email,
      actorRole: auth.role,
      status: body.status,
      basis: body.basis,
      refuseClearWhenBlocked: true,
      editorialBlocker:
        body.status === 'REWRITE_REQUIRED' && body.editorialBlocker !== undefined
          ? body.editorialBlocker
          : undefined,
      sourceOverlapSnapshot: overlapSnapshot,
    })
    const review = await getCanonicalNewsRightsReview(id)
    return NextResponse.json({
      ok: true,
      result,
      review,
      published: false,
      executePublish: false,
      actorFromSession: true,
      clientActorIgnored: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'rights_decision_failed'
    const status =
      msg.includes('automation') || msg.includes('not_trusted') || msg.includes('missing')
        ? 403
        : msg.includes('blocked')
          ? 409
          : 400
    return NextResponse.json({ error: msg, published: false }, { status })
  }
}
