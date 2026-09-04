import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import {
  CanonicalPublishError,
  publishCanonicalNews,
} from '@/services/editorial/canonicalNewsPublish'
import { getCanonicalNewsRightsReview } from '@/services/editorial/newsRightsDecision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/admin/canonical-news/[id]/publish
 * Explicit human publish of a PG canonical draft. Actor = auth.uid only.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  // Reject client-supplied actor / gate overrides if present in body.
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
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
      'gate',
      'force',
    ]
    for (const key of forbidden) {
      if (key in body) {
        return NextResponse.json(
          { error: 'client_override_rejected', field: key, published: false },
          { status: 400 }
        )
      }
    }
  }

  try {
    const result = await publishCanonicalNews({
      newsId: id,
      actorUid: auth.uid,
    })
    const review = await getCanonicalNewsRightsReview(id)
    return NextResponse.json({
      ok: true,
      published: true,
      alreadyPublished: result.alreadyPublished,
      result: {
        id: result.id,
        status: result.status,
        publishedAt: result.publishedAt,
        publishedByPresent: result.publishedByPresent,
        legacyFirestoreId: result.legacyFirestoreId,
        rightsStatus: result.rightsStatus,
        rightsBasis: result.rightsBasis,
        gate: result.gate,
      },
      review,
    })
  } catch (e) {
    if (e instanceof CanonicalPublishError) {
      let httpStatus = 400
      if (e.code === 'news_not_found') httpStatus = 404
      else if (e.code === 'publish_gate_rejected') httpStatus = 409
      else if (
        e.code.includes('actor') ||
        e.message.includes('automation') ||
        e.message.includes('not_trusted')
      ) {
        httpStatus = 403
      }
      return NextResponse.json(
        {
          error: e.code,
          blockers: e.blockers,
          published: false,
        },
        { status: httpStatus }
      )
    }
    const msg = e instanceof Error ? e.message : 'publish_failed'
    const httpStatus =
      msg.includes('automation') || msg.includes('not_trusted') || msg.includes('missing')
        ? 403
        : 400
    return NextResponse.json({ error: msg, published: false }, { status: httpStatus })
  }
}
