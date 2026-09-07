import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  CanonicalRevokeError,
  revokeCanonicalNews,
} from '@/services/editorial/canonicalNewsRevoke'
import { getCanonicalNewsRightsReview } from '@/services/editorial/newsRightsDecision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/admin/canonical-news/[id]/revoke
 * Explicit human unpublish of a PG canonical published row (published -> draft).
 * Actor = auth.uid only. Same permission scope as publish ('news:publish') so
 * this action is never easier to trigger than publish.
 *
 * P16.1 Task 5 -- the response's `firestoreFallbackRisk` flag is a
 * deterministic, code-level warning (never a live Firestore read/write):
 * when true, a matching Firestore `news` document at the same slug most
 * likely still exists and independently public, so /haber/[slug] can keep
 * resolving the article via the documented PG-then-Firestore fallback order
 * even after this revoke. This endpoint intentionally never touches
 * Firestore -- verify and act on the Firestore document separately if a
 * full takedown is required.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  // Reject client-supplied actor / gate overrides if present in body.
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  let reason: string | null = null
  if (body && typeof body === 'object') {
    const forbidden = [
      'actorUid',
      'published_by',
      'publishedBy',
      'rights_status',
      'rightsStatus',
      'rights_basis',
      'rightsBasis',
      'publication_authority',
      'publicationAuthority',
      'status',
      'force',
    ]
    for (const key of forbidden) {
      if (key in body) {
        return NextResponse.json(
          { error: 'client_override_rejected', field: key, unpublished: false },
          { status: 400 }
        )
      }
    }
    if (typeof body.reason === 'string') {
      reason = body.reason.slice(0, 200)
    }
  }

  try {
    const result = await revokeCanonicalNews({
      newsId: id,
      actorUid: auth.uid,
      actorEmail: auth.email,
      actorRole: auth.role,
      reason,
    })
    const review = await getCanonicalNewsRightsReview(id)
    return NextResponse.json({
      ok: true,
      unpublished: true,
      alreadyUnpublished: result.alreadyUnpublished,
      result: {
        id: result.id,
        status: result.status,
        previousStatus: result.previousStatus,
        legacyFirestoreId: result.legacyFirestoreId,
        rightsStatus: result.rightsStatus,
        rightsBasis: result.rightsBasis,
        firestoreFallbackRisk: result.firestoreFallbackRisk,
      },
      review,
    })
  } catch (e) {
    if (e instanceof CanonicalRevokeError) {
      let httpStatus = 400
      if (e.code === 'news_not_found') httpStatus = 404
      else if (e.code.startsWith('revoke_not_applicable_from_status')) httpStatus = 409
      else if (e.code === 'revoke_race_lost') httpStatus = 409
      else if (
        e.code.includes('actor') ||
        e.message.includes('automation') ||
        e.message.includes('not_trusted')
      ) {
        httpStatus = 403
      }
      return NextResponse.json(
        { error: e.code, unpublished: false },
        { status: httpStatus }
      )
    }
    const msg = e instanceof Error ? e.message : 'revoke_failed'
    const httpStatus =
      msg.includes('automation') || msg.includes('not_trusted') || msg.includes('missing')
        ? 403
        : 400
    return NextResponse.json({ error: msg, unpublished: false }, { status: httpStatus })
  }
}
